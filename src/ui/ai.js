import { AIError, CHAT_SOFT_LIMIT, chatSize, runTurn } from '../core/aiAgent.js';
import { applyChanges, planChanges, undoChanges } from '../core/aiTools.js';
import { Cloud } from '../core/cloud.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { esc, fmtDate, fmtMoney } from '../core/utils.js';
import { copyText } from './backup.js';
import { D, UI, VIEWS, toast } from './shared.js';

/* ---------- AI-менеджер: чат, підказки, дії з підтвердженням ---------- */
const S = { state: 'unknown', model: null, checkedAt: 0, busy: false, draft: '', focus: false };

const STATUS = {
  ready: ['accent', 'AI підключено'],
  checking: ['', 'Перевіряю підключення AI…'],
  unknown: ['', 'Перевіряю підключення AI…'],
  no_server: ['warn', 'Потрібне підключення AI'],
  not_configured: ['warn', 'Потрібне підключення AI'],
  signed_out: ['warn', 'Увійдіть, щоб користуватися AI'],
  error: ['bad', 'AI тимчасово недоступний'],
};
const STATUS_HINT = {
  no_server: 'AI працює через сервер облікових записів. Його ще не підключено, тому відповіді недоступні. Автоматичні перевірки нижче працюють і без AI.',
  not_configured: 'Сервер працює, але ключ AI ще не додано (секрет ANTHROPIC_API_KEY у Supabase). Без нього відповіді недоступні; автоматичні перевірки працюють.',
  signed_out: 'Увійдіть в обліковий запис, щоб ставити запитання AI-менеджеру.',
  error: 'Не вдалося зв’язатися з сервером AI. Перевірте інтернет і спробуйте пізніше.',
};
const TOOL_LABELS = {
  get_overview: 'огляд справ', list_tasks: 'завдання', list_reminders: 'нагадування', get_budget: 'бюджет', list_purchases: 'закупівлі',
  search_records: 'пошук', get_record: 'запис', compare_offers: 'порівняння цін', check_purchase_plan: 'розрахунок закупівлі', data_quality: 'перевірка даних',
  create_task: 'створення завдання', create_note: 'створення нотатки', create_reminder: 'створення нагадування', propose_changes: 'підготовка змін', draft_message: 'чернетка',
};
const OWN_CARD = new Set(['create_task', 'create_note', 'create_reminder', 'propose_changes', 'draft_message']);
const MONEY = new Set(['purchasePrice', 'retailPrice', 'planned', 'paid', 'totalBudget', 'deliveryCost']);
const COLLECTION_ACT = { suppliers: 'open-supplier', products: 'edit-product', notes: 'edit-note', tasks: 'edit-task', expenses: 'edit-expense', purchases: 'edit-purchase', reminders: 'edit-reminder' };
const CREATED = { tasks: 'завдання', notes: 'нотатку', reminders: 'нагадування' };
const FIELD = { title: 'назва', name: 'назва', deadline: 'термін', priority: 'пріоритет', status: 'статус', description: 'опис', purchasePrice: 'ціна закупівлі', retailPrice: 'роздрібна ціна', priceDate: 'дата ціни', packQty: 'у пакуванні', planned: 'план', paid: 'сплачено', totalBudget: 'загальний бюджет', expectedDate: 'очікувана дата', deliveryCost: 'доставка', date: 'дата', time: 'час', body: 'текст', supplierId: 'постачальник', categoryId: 'категорія' };
const SUGGEST = ['Що мені зробити сьогодні й цього тижня?', 'Порівняй пропозиції на шкарпетки', 'Чи вміщається наступна закупівля в бюджет?', 'Яких даних бракує або вони застаріли?'];

/* ---------- Сервер ---------- */
async function headers() {
  const token = await Cloud.token(); if (!token) throw new AIError('signed_out', 'Увійдіть, щоб користуватися AI.');
  return { Authorization: 'Bearer ' + token, apikey: Cloud.anonKey, 'Content-Type': 'application/json' };
}
export async function refreshStatus(force) {
  if (!force && Date.now() - S.checkedAt < 60000 && S.state !== 'unknown') return S.state;
  S.checkedAt = Date.now();
  if (!Cloud.configured) S.state = 'no_server';
  else if (!Cloud.user) S.state = 'signed_out';
  else {
    S.state = 'checking';
    try {
      const r = await fetch(Cloud.functionsUrl('ai-chat'), { headers: await headers() });
      if (r.status === 404) S.state = 'not_configured';
      else { const j = await r.json(); S.state = r.ok && j.configured ? 'ready' : r.ok ? 'not_configured' : 'error'; S.model = j.model || null; }
    } catch { S.state = 'error'; }
  }
  rerender(); return S.state;
}
const ERRORS = {
  not_configured: 'Потрібне підключення AI: на сервері не задано ключ.', daily_limit: 'Денний ліміт запитів до AI вичерпано. Спробуйте завтра.',
  bad_key: 'Сервер AI відхилив ключ. Перевірте ANTHROPIC_API_KEY у Supabase.', rate_limited: 'AI зараз перевантажений. Спробуйте за хвилину.',
  too_long: 'Розмова завелика. Почніть нову.', unauthorized: 'Сесія завершилась. Увійдіть знову.',
};
async function callModel(messages) {
  let r;
  try { r = await fetch(Cloud.functionsUrl('ai-chat'), { method: 'POST', headers: await headers(), body: JSON.stringify({ messages }) }); }
  catch (e) { if (e instanceof AIError) throw e; throw new AIError('network', 'Немає зв’язку з сервером AI.'); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 404 || j.error === 'not_configured') { S.state = 'not_configured'; }
    throw new AIError(j.error || 'upstream', ERRORS[j.error] || (r.status === 404 ? ERRORS.not_configured : 'Сервер AI повернув помилку. Спробуйте ще раз.'));
  }
  return j;
}

/* ---------- Розмови ---------- */
const chats = () => [...D().chats].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
const current = () => (UI.chatId && Repo.get('chats', UI.chatId)) || null;
async function send(text) {
  text = String(text || '').trim(); if (!text || S.busy) return;
  let chat = current();
  if (chat && chatSize(chat) > CHAT_SOFT_LIMIT) { chat = null; toast('Попередня розмова завелика, тому почато нову'); }
  S.busy = true; S.draft = ''; S.focus = true;
  if (!chat) { chat = await Repo.create('chats', { messages: [], log: [], notes: [], title: text.slice(0, 60) }); UI.chatId = chat.id; }
  const result = await runTurn({ chat, text, repo: Repo, callModel, onUpdate: c => { S.live = c; rerender(); } });
  S.busy = false; S.live = null;
  await Repo.update('chats', chat.id, { messages: result.messages, log: result.log, notes: result.notes });
  if (result.log.at(-1)?.code === 'not_configured') refreshStatus(true);
}
const entryOf = (i) => { const c = current(); return c ? c.log[i] : null; };
async function patchEntry(i, patch, note) {
  const c = current(); if (!c) return;
  const log = c.log.map((e, k) => (k === i ? { ...e, ...patch } : e));
  await Repo.update('chats', c.id, { log, notes: note ? [...(c.notes || []), note] : c.notes });
}

/* ---------- Відображення ---------- */
function inline(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((app:\/\/([a-z]+)\/([^)\s]+)|https?:\/\/[^)\s]+)\)/g, (m, label, url, col, id) => {
      if (col) {
        const act = COLLECTION_ACT[col]; const rid = id.replace(/&amp;/g, '&');
        return act && Repo.get(col, rid) ? `<button class="btn link rec-link" data-act="${act}" data-id="${esc(rid)}">${label}</button>` : `<span class="rec-missing" title="Запис не знайдено">${label}</span>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
}
/** Безпечний мінімальний Markdown: текст спершу екранується, далі дозволено лише жирний, код, списки й посилання. */
export function md(text) {
  const lines = esc(text).split('\n'); let out = '', list = null, para = [];
  const flushP = () => { if (para.length) { out += `<p>${inline(para.join('<br>'))}</p>`; para = []; } };
  const flushL = () => { if (list) { out += `<${list.t}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.t}>`; list = null; } };
  for (const ln of lines) {
    const ul = ln.match(/^\s*[-*•]\s+(.*)/), ol = ln.match(/^\s*\d+[.)]\s+(.*)/), h = ln.match(/^#{1,4}\s+(.*)/);
    if (ul || ol) { flushP(); const t = ul ? 'ul' : 'ol'; if (!list || list.t !== t) { flushL(); list = { t, items: [] }; } list.items.push((ul || ol)[1]); }
    else if (h) { flushP(); flushL(); out += `<p><b>${inline(h[1])}</b></p>`; }
    else if (!ln.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(ln); }
  }
  flushP(); flushL(); return out;
}
const fieldName = f => FIELD[f] || f;
const val = (f, v) => (MONEY.has(f) && v !== '—' && !isNaN(Number(v)) ? fmtMoney(Number(v)) : v);
function entryHtml(e, i, interactive) {
  if (e.role === 'user') return `<div class="msg user">${esc(e.text)}</div>`;
  if (e.role === 'assistant') return `<div class="msg assistant">${md(e.text)}</div>`;
  if (e.type === 'error') return `<div class="msg err" role="alert">${esc(e.text)}</div>`;
  if (e.type === 'created') {
    const exists = Repo.get(e.collection, e.id);
    return `<div class="msg action"><div>✓ Створено ${CREATED[e.collection] || 'запис'} «${esc(e.title)}»</div>
      <div class="row">${e.undone ? '<span class="small muted">Скасовано</span>' : exists ? `<button class="btn sm" data-act="${COLLECTION_ACT[e.collection]}" data-id="${esc(e.id)}">Відкрити</button>${interactive ? `<button class="btn sm ghost" data-act="ai-undo-create" data-i="${i}">Скасувати</button>` : ''}` : '<span class="small muted">Запис уже видалено</span>'}</div></div>`;
  }
  if (e.type === 'confirm') {
    const rows = e.plan.map(c => `<li><b>${c.action === 'create' ? 'Створити' : c.action === 'delete' ? 'Видалити' : 'Змінити'}</b> ${esc(Schema.LABELS[c.collection] || 'налаштування')}: «${esc(c.title)}»${c.diff.length && c.action !== 'delete' ? `<ul class="diff">${c.diff.map(x => `<li>${esc(fieldName(x.field))}: ${c.action === 'create' ? '' : `<s>${esc(val(x.field, x.from))}</s> → `}<b>${esc(val(x.field, x.to))}</b></li>`).join('')}</ul>` : ''}</li>`).join('');
    const state = { pending: '', applied: '<span class="pill accent">Виконано</span>', rejected: '<span class="pill">Відхилено</span>', undone: '<span class="pill">Скасовано</span>' }[e.state] || '';
    const btns = !interactive ? '' : e.state === 'pending' ? `<button class="btn sm primary" data-act="ai-confirm" data-i="${i}">Підтвердити</button><button class="btn sm" data-act="ai-reject" data-i="${i}">Відхилити</button>` : e.state === 'applied' ? `<button class="btn sm ghost" data-act="ai-undo-changes" data-i="${i}">Скасувати зміни</button>` : '';
    return `<div class="msg action confirm"><div><b>Потрібне підтвердження.</b> ${esc(e.summary)} ${state}</div><ul class="plan">${rows}</ul><div class="row">${btns}</div></div>`;
  }
  if (e.type === 'draft') return `<div class="msg action"><div class="small muted">Чернетка${e.supplier ? ' для «' + esc(e.supplier) + '»' : ''}. Не надіслано: скопіюйте й надішліть самостійно.</div><div class="pre small" style="margin-top:6px">${esc(e.text)}</div><div class="row"><button class="btn sm" data-act="ai-copy" data-i="${i}">Копіювати</button>${e.supplierId && Repo.get('suppliers', e.supplierId) ? `<button class="btn sm ghost" data-act="open-supplier" data-id="${esc(e.supplierId)}">Контакти постачальника</button>` : ''}</div></div>`;
  return '';
}
function logHtml(log, interactive) {
  let out = '', tools = [];
  const flush = () => { if (tools.length) { out += `<div class="msg tool">Переглянуто: ${[...new Set(tools)].join(', ')}</div>`; tools = []; } };
  log.forEach((e, i) => { if (e.type === 'tool') { if (!OWN_CARD.has(e.name)) tools.push(TOOL_LABELS[e.name] || e.name); return; } flush(); out += entryHtml(e, i, interactive); });
  flush(); return out;
}
export function statusPill() { const [cls, txt] = STATUS[S.state] || STATUS.unknown; return `<span class="pill ${cls}">${txt}</span>`; }
const canAsk = () => S.state === 'ready';

function chatHtml(compact) {
  const c = S.busy && S.live ? S.live : current();
  const log = c ? c.log : [];
  const hint = STATUS_HINT[S.state];
  const body = log.length ? logHtml(log, !S.busy) : `<div class="empty mini" style="margin:auto"><p>${canAsk() ? 'Запитайте про бюджет, постачальників, ціни, закупівлі чи справи. AI бачить лише ваші записи й нічого не надсилає сам.' : esc(hint || '')}</p>
      ${canAsk() ? `<div class="row" style="justify-content:center">${SUGGEST.map(s => `<button class="btn sm" data-act="ai-suggest" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}</div>`;
  return `<div class="chat">
    <div class="chat-log" id="chat-log" aria-live="polite">${body}${S.busy ? '<div class="msg tool">Думаю…</div>' : ''}</div>
    ${log.length && hint && !canAsk() ? `<div class="callout warn" style="margin:0 12px 8px">${esc(hint)}</div>` : ''}
    <form class="chat-form" data-form="ai-chat"><textarea class="input" name="q" id="ai-input" rows="1" placeholder="${canAsk() ? 'Напишіть запит…' : 'AI недоступний'}" aria-label="Повідомлення AI-менеджеру" ${canAsk() && !S.busy ? '' : 'disabled'}></textarea><button class="btn primary" type="submit" ${canAsk() && !S.busy ? '' : 'disabled'} aria-label="Надіслати">Надіслати</button></form>
  </div>`;
}

VIEWS.ai = () => {
  if (S.state === 'unknown') refreshStatus();
  const list = chats();
  return `<div class="page-head"><div><h1>AI-менеджер</h1><p>${statusPill()}${S.model ? ` <span class="small muted">${esc(S.model)}</span>` : ''}</p></div><button class="btn" data-act="ai-new">+ Нова розмова</button></div>
  <div class="ai-layout">
    <div class="ai-chats" aria-label="Розмови">${list.length ? list.map(c => `<button class="li-btn ${c.id === UI.chatId ? 'on' : ''}" data-act="ai-chat" data-id="${c.id}">${esc(c.title || 'Розмова')}<div class="small muted">${fmtDate(c.updatedAt)}</div></button>`).join('') : '<p class="small muted" style="margin:0">Історія розмов з’явиться тут.</p>'}
      ${list.length && UI.chatId ? `<button class="btn sm ghost danger" data-act="ai-del" data-id="${UI.chatId}" style="margin-top:8px">Видалити розмову</button>` : ''}</div>
    ${chatHtml(false)}
  </div>`;
};

function rerender() { if (rerender.fn) rerender.fn(); }
export const AI = {
  statusPill, refreshStatus, md,
  bindRender(fn) { rerender.fn = fn; },
  drawerHtml: () => `<div class="drawer-back" data-act="ai-close"></div><aside class="drawer" role="dialog" aria-label="AI-менеджер">
    <div class="drawer-h"><div><b>AI-менеджер</b> ${statusPill()}</div><div class="row" style="gap:6px"><button class="btn sm ghost" data-act="ai-new">Нова</button><button class="btn sm ghost" data-nav="ai">Історія</button><button class="icon-btn" data-act="ai-close" aria-label="Закрити">✕</button></div></div>
    ${chatHtml(true)}</aside>`,
  afterRender() {
    const ta = document.getElementById('ai-input'); const log = document.getElementById('chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    if (!ta) return;
    ta.value = S.draft;
    ta.oninput = () => { S.draft = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); } };
    if (S.focus && !ta.disabled) { ta.focus(); S.focus = false; }
  },
  open() { UI.aiOpen = true; S.focus = true; if (!UI.chatId) UI.chatId = chats()[0]?.id || null; refreshStatus(); rerender(); },
  close() { UI.aiOpen = false; rerender(); },
  /** Запит із головної: відкриває розділ AI з новою розмовою. */
  ask(q) { UI.chatId = null; location.hash = 'ai'; AI.go?.('ai'); refreshStatus().then(st => { if (st === 'ready') send(q); else { S.draft = q; rerender(); } }); },
  submit(text) { send(text); },
  actions: {
    'ai-new': () => { UI.chatId = null; S.draft = ''; S.focus = true; rerender(); },
    'ai-chat': el => { UI.chatId = el.dataset.id; rerender(); },
    'ai-suggest': el => send(el.dataset.q),
    'ai-del': async el => { const c = Repo.get('chats', el.dataset.id); if (!c) return; await Repo.remove('chats', c.id); UI.chatId = null; toast('Розмову видалено', null, () => Repo.restore('chats', c.id, c)); },
    'ai-copy': el => { const e = entryOf(+el.dataset.i); if (e) copyText(e.text); },
    'ai-undo-create': async el => {
      const i = +el.dataset.i; const e = entryOf(i); if (!e || e.undone) return;
      await Repo.restore(e.collection, e.id, null);
      await patchEntry(i, { undone: true }, `Користувач скасував створення: ${e.title}`); toast('Скасовано');
    },
    'ai-confirm': async el => {
      const i = +el.dataset.i; const e = entryOf(i); if (!e || e.state !== 'pending') return;
      let plan; try { plan = planChanges(Repo.data, e.plan); } catch (err) { toast('Дані вже змінились: ' + err.message + '. Попросіть AI підготувати зміни знову.', 'error'); return; }
      const undo = await applyChanges(Repo, plan);
      await patchEntry(i, { state: 'applied', undo }, `Користувач підтвердив, зміни виконано: ${e.summary}`); toast('Зміни виконано');
    },
    'ai-reject': async el => { const i = +el.dataset.i; const e = entryOf(i); if (!e || e.state !== 'pending') return; await patchEntry(i, { state: 'rejected' }, `Користувач відхилив зміни: ${e.summary}`); },
    'ai-undo-changes': async el => {
      const i = +el.dataset.i; const e = entryOf(i); if (!e || e.state !== 'applied') return;
      await undoChanges(Repo, e.undo || []); await patchEntry(i, { state: 'undone' }, `Користувач скасував виконані зміни: ${e.summary}`); toast('Зміни скасовано');
    },
  },
};
