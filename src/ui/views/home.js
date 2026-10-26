import { Calc } from '../../core/calc.js';
import { runChecks } from '../../core/checks.js';
import { fireAt, isDue } from '../../core/reminders.js';
import { openingReadiness, monthlySummary } from '../../core/opening.js';
import { paymentSchedule } from '../../core/workspace.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, kyivParts, todayISO } from '../../core/utils.js';

import { longToday, svg } from '../shell.js';

import { D, VIEWS, isOverdue, prioPill } from '../shared.js';

/* ---------- Головна: компактний огляд. Кожен запис показується лише в одному з блоків. ---------- */
const chev = () => svg('chev', 'class="chev"');
const head = (icon, title, nav, label) => `<div class="panel-head">${nav ? `<button class="card-link" data-nav="${nav}"><h2>${title}</h2><span class="small muted row" style="gap:2px">${label || ''}${chev()}</span></button>` : `<h2>${title}</h2>`}</div>`;
const refBtn = (text, ref, page) => ref
  ? `<button class="btn link" style="text-align:left;white-space:normal" data-act="open-ref" data-col="${ref.collection}" data-id="${ref.id}">${esc(text)}</button>`
  : `<button class="btn link" style="text-align:left;white-space:normal" data-nav="${page || 'home'}">${esc(text)}</button>`;
const dot = l => `<i class="dot ${l === 'bad' ? 'bad' : l === 'warn' ? 'warn' : ''}"></i>`;
const LIMIT = 5;
const shortDate = iso => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')).replace('.', '');

/** Сьогоднішні й прострочені завдання та нагадування; якщо їх мало — найближчі за терміном завдання. */
function todayItems(d) {
  const today = todayISO(); const now = new Date();
  const tasks = d.tasks.filter(t => t.status !== 'done' && t.deadline && (isOverdue(t) || t.deadline === today))
    .map(t => ({ kind: 'task', t, key: t.deadline + (isOverdue(t) ? '0' : '1') }));
  const rems = d.reminders.filter(r => r.status !== 'done' && (isDue(r, now) || kyivParts(new Date(fireAt(r))).date === today))
    .map(r => ({ kind: 'rem', r, key: kyivParts(new Date(fireAt(r))).date + (isDue(r, now) ? '0' : '1') }));
  const urgent = [...tasks, ...rems].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const next = d.tasks.filter(t => t.status !== 'done' && t.deadline && t.deadline > today).sort((a, b) => a.deadline < b.deadline ? -1 : 1)
    .map(t => ({ kind: 'task', t, key: t.deadline + '2', later: true }));
  const undated = d.tasks.filter(t => t.status !== 'done' && !t.deadline).map(t => ({ kind: 'task', t }));
  return { urgent, items: [...urgent, ...next, ...undated].slice(0, LIMIT), more: urgent.length > LIMIT ? urgent.length - LIMIT : 0 };
}

function upcomingBlock({ urgent, items, more }) {
  const top = `<div class="panel-head"><button class="card-link" data-nav="planner"><h2>Найближчі справи</h2><span class="small muted row" style="gap:2px">Усі справи${chev()}</span></button></div>`;
  if (!items.length) return `<section class="panel hb-tasks c-tasks">${top}<p class="desk-empty">Немає незавершених справ. Додайте те, що хочете зробити.</p><button class="desk-add" data-act="add-task">${svg('plus')}Додати завдання</button></section>`;
  const now = new Date();
  const row = x => x.kind === 'task'
    ? `<div class="trow li ${isOverdue(x.t) ? 'overdue' : ''}" data-flip="t${x.t.id}"><button class="tick" data-act="task-done" data-id="${x.t.id}" aria-label="Позначити виконаним">✓</button><div class="mn"><button class="ttl" data-act="edit-task" data-id="${x.t.id}"><span class="nm">${esc(x.t.title)}</span></button>${x.t.priority === 'high' ? `<div class="meta">${prioPill('high')}</div>` : ''}</div><span class="date-chip ${isOverdue(x.t) ? 'bad' : ''}" ${isOverdue(x.t) ? 'title="Прострочено"' : ''}>${!x.t.deadline ? 'Без терміну' : x.t.deadline === todayISO() ? 'сьогодні' : shortDate(x.t.deadline)}</span></div>`
    : `<div class="trow li" data-flip="r${x.r.id}"><span class="li-ico" aria-hidden="true">${svg('bell')}</span><div class="mn"><button class="ttl" data-act="edit-reminder" data-id="${x.r.id}"><span class="nm">${esc(x.r.title)}</span></button>
      <div class="meta"><span class="pill ${isDue(x.r, now) ? 'bad' : 'accent'}">${isDue(x.r, now) ? 'Час настав · ' : ''}${esc(fmtKyiv(fireAt(x.r)))}</span>${isDue(x.r, now) ? `<button class="btn sm" data-act="rem-done" data-id="${x.r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${x.r.id}">Відкласти</button>` : ''}</div></div></div>`;
  return `<section class="panel hb-tasks c-tasks">${top}<div class="list">${items.map(row).join('')}</div>${more ? `<p class="small muted" style="margin:8px 0 0">І ще ${more} у справах.</p>` : ''}<button class="desk-add" data-act="add-task">${svg('plus')}Додати завдання</button></section>`;
}

VIEWS.home = () => {
  const d = D();
  const t = todayItems(d);

  const r = openingReadiness(d);
  const b = Calc.budget(d), monthly = monthlySummary(d), p = r.prep;
  const heading = `<div class="desk-heading"><div><span class="desk-date">${esc(longToday())}</span><h1>Мій магазин</h1><p>Справи, записи та гроші в одному місці.</p></div><button class="btn primary" data-act="add-task">${svg('plus')}Нове завдання</button></div>`;
  const stats = `<form class="workspace-quick" data-form="workspace-quick"><label for="home-quick">Швидкий запис</label><div><input class="input" id="home-quick" name="q" data-unsaved placeholder="Стелаж — 2 500 грн · завтра написати постачальнику" autocomplete="off"><button class="btn" type="submit">${svg('plus')}Записати</button></div></form>`;
  const money = `<section class="panel desk-money">${head('budget', 'Гроші', 'budget', 'Фінанси')}<span class="desk-label">${b.free !== null && b.free < 0 ? 'Перевищення бюджету' : 'Вільно з бюджету відкриття'}</span><strong class="desk-balance ${b.free !== null && b.free < 0 ? 'bad' : ''}">${b.free === null ? 'Не задано' : fmtMoney(Math.abs(b.free))}</strong><dl class="desk-ledger"><div><dt>Загальний бюджет</dt><dd>${b.total === null ? '—' : fmtMoney(b.total)}</dd></div><div><dt>Вже сплачено</dt><dd>${fmtMoney(b.paid)}</dd></div><div><dt>Ще потрібно сплатити</dt><dd>${fmtMoney(b.toPay)}</dd></div></dl><button class="desk-monthly" data-nav="monthly"><span>Щомісячні витрати</span><b>${fmtMoney(monthly.total)}</b>${chev()}</button><button class="desk-add" data-act="add-expense">${svg('plus')}Записати витрату</button></section>`;
  const opening = `<section class="panel desk-opening">${head('premises', 'Відкриття магазину', 'opening', 'План')}<div class="desk-opening-line"><span>${r.openingDate ? fmtDate(r.openingDate) : 'Дата не задана'}</span>${p.total ? `<b>${p.done} / ${p.total} завдань</b>` : ''}</div>${p.total ? `<div class="meter" role="progressbar" aria-label="Підготовка до відкриття" aria-valuenow="${p.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p.pct}%"></i></div>` : '<p class="desk-empty">Додайте завдання підготовки у план відкриття.</p>'}</section>`;
  const checks = runChecks(d).filter(c => c.level !== 'info' && ['budget','purchases',...(d.settings.storeOpened?[]:['premises','fitout'])].includes(c.page)).slice(0, 3);
  const attention = checks.length ? `<section class="panel desk-attention">${head('ai', 'Потребує уваги', 'ai', 'Допомога')}<ul class="hint-list">${checks.map(c => `<li>${dot(c.level)}${refBtn(c.text, c.ref, c.page)}</li>`).join('')}</ul></section>` : '';
  const payments=paymentSchedule(d).filter(x=>x.date).slice(0,3);
  const payBlock=`<section class="panel desk-payments">${head('budget','Найближчі платежі','payments','Календар')}${payments.length?payments.map(x=>`<button class="desk-delivery" data-nav="payments"><span class="desk-delivery-body"><b>${esc(x.title)}</b><small>${fmtDate(x.date)}${x.date<todayISO()?' · перевірити оплату':''}</small></span><span class="desk-delivery-sum">${x.amount===null?'Сума не задана':fmtMoney(x.amount)}${chev()}</span></button>`).join(''):'<p class="desk-empty">Додайте дату до витрати або день оплати щомісячної статті.</p>'}</section>`;
  return `${heading}${stats}<div class="desk-layout"><div class="desk-main">${upcomingBlock(t)}${payBlock}${deliveries(d)}${recentNotes(d)}</div><aside class="desk-aside">${money}${d.settings.storeOpened?'':opening}${attention}<button class="desk-assistant" data-nav="firstbuy">${svg('purchases')}<span><b>Перша закупівля</b><small>Асортимент, кількість і планові ціни</small></span>${svg('arrow')}</button><button class="desk-assistant" data-nav="ai">${svg('ai')}<span><b>AI-помічник</b><small>Обговорити плани або свої записи</small></span>${svg('arrow')}</button></aside></div>`;
};

function recentNotes(d) {
  const notes = [...d.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3);
  return `<section class="panel desk-notes">${head('notes', 'Під рукою', 'notes', 'Усі нотатки')}${notes.length ? notes.map(n => `<button class="desk-note" data-act="edit-note" data-id="${n.id}"><span class="desk-note-title">${esc(n.title || 'Без назви')}${n.pinned ? '<span class="desk-pinned">Закріплено</span>' : ''}</span><span class="desk-note-preview">${esc(n.body || 'Відкрити нотатку')}</span></button>`).join('') : '<p class="desk-empty">Ідеї, контакти й домовленості можна зберігати тут.</p>'}<button class="desk-add" data-act="add-note">${svg('plus')}Нова нотатка</button></section>`;
}

function deliveries(d) {
  const list = d.purchases.filter(p => ['ordered', 'awaiting'].includes(p.status)).sort((a, b) => (a.expectedDate || '9999').localeCompare(b.expectedDate || '9999')).slice(0, 3);
  return `<section class="panel desk-deliveries">${head('suppliers', 'Очікувані доставки', 'purchases', 'Закупівлі')}${list.length ? list.map(p => `<button class="desk-delivery" data-act="edit-purchase" data-id="${p.id}"><span class="desk-delivery-icon">${svg('suppliers')}</span><span class="desk-delivery-body"><b>${esc(p.title)}</b><small>${p.expectedDate ? fmtDate(p.expectedDate) : 'Дату не вказано'}</small></span><span class="desk-delivery-sum">${fmtMoney(Calc.purchaseTotal(p).total)}${chev()}</span></button>`).join('') : '<p class="desk-empty">Замовлень у дорозі поки немає.</p>'}<button class="desk-add" data-act="add-purchase">${svg('plus')}Нова закупівля</button></section>`;
}


