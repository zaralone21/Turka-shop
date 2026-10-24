import { Calc } from '../../core/calc.js';
import { runChecks } from '../../core/checks.js';
import { fireAt, isDue } from '../../core/reminders.js';
import { openingReadiness } from '../../core/opening.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, kyivParts, plural, todayISO } from '../../core/utils.js';
import { AI } from '../ai.js';
import { longToday, svg } from '../shell.js';
import { D, VIEWS, deadlineLabel, isOverdue, prioPill } from '../shared.js';

/* ---------- Головна: чотири блоки. Кожен запис показується лише в одному з них. ---------- */
const ico = name => `<span class="ico-c" aria-hidden="true">${svg(name)}</span>`;
const block = (icon, title, body, { more, moreLabel = 'Усі', count, cls = '' } = {}) => `<section class="panel ${cls}"><div class="panel-head"><h2>${ico(icon)}${title}${count ? ` <span class="cnt">${count}</span>` : ''}</h2>${more ? `<button class="btn sm ghost" data-nav="${more}">${moreLabel} →</button>` : ''}</div>${body}</section>`;
const mini = (text, act, label, nav) => `<div class="empty mini"><p>${text}</p><button class="btn sm primary" ${nav ? `data-nav="${nav}"` : `data-act="${act}"`}>${label}</button></div>`;
const refBtn = (text, ref, page) => ref
  ? `<button class="btn link" style="text-align:left;white-space:normal" data-act="open-ref" data-col="${ref.collection}" data-id="${ref.id}">${esc(text)}</button>`
  : `<button class="btn link" style="text-align:left;white-space:normal" data-nav="${page || 'home'}">${esc(text)}</button>`;
const dot = l => `<i class="dot ${l === 'bad' ? 'bad' : l === 'warn' ? 'warn' : ''}"></i>`;
const LIMIT = 5;

/** Сьогоднішні й прострочені завдання та нагадування. */
function todayItems(d) {
  const today = todayISO(); const now = new Date();
  const tasks = d.tasks.filter(t => t.status !== 'done' && t.deadline && (isOverdue(t) || t.deadline === today))
    .map(t => ({ kind: 'task', t, key: t.deadline + (isOverdue(t) ? '0' : '1') }));
  const rems = d.reminders.filter(r => r.status !== 'done' && (isDue(r, now) || kyivParts(new Date(fireAt(r))).date === today))
    .map(r => ({ kind: 'rem', r, key: kyivParts(new Date(fireAt(r))).date + (isDue(r, now) ? '0' : '1') }));
  return [...tasks, ...rems].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

function upcomingBlock(items) {
  if (!items.length) return block('planner', 'Найближчі справи', mini('На сьогодні немає справ і прострочених записів.', 'add-task', 'Додати завдання'), { more: 'planner', cls: 'hb-tasks' });
  const now = new Date();
  const row = x => x.kind === 'task'
    ? `<div class="li"><button class="tick" data-act="task-done" data-id="${x.t.id}" aria-label="Позначити виконаним">✓</button><button class="li-btn" data-act="edit-task" data-id="${x.t.id}"><span class="nm">${esc(x.t.title)}</span><div class="row small" style="gap:6px;margin-top:2px">${deadlineLabel(x.t)}${x.t.priority === 'high' ? prioPill('high') : ''}</div></button></div>`
    : `<div class="li"><span class="li-ico" aria-hidden="true">${svg('bell')}</span><div class="t"><button class="li-btn" data-act="edit-reminder" data-id="${x.r.id}"><span class="nm">${esc(x.r.title)}</span></button>
      <div class="row small" style="gap:6px;margin-top:4px"><span class="pill ${isDue(x.r, now) ? 'bad' : 'accent'}">${isDue(x.r, now) ? 'Час настав · ' : ''}${esc(fmtKyiv(fireAt(x.r)))}</span>${isDue(x.r, now) ? `<button class="btn sm" data-act="rem-done" data-id="${x.r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${x.r.id}">Відкласти</button>` : ''}</div></div></div>`;
  return block('planner', 'Найближчі справи', `<p class="small muted" style="margin:-4px 0 6px">Сьогодні й прострочене</p><div class="list">${items.slice(0, LIMIT).map(row).join('')}</div>${items.length > LIMIT ? `<p class="small muted" style="margin:8px 0 0">І ще ${items.length - LIMIT} у планері.</p>` : ''}`, { more: 'planner', count: items.length, cls: 'hb-tasks' });
}

function budgetBlock(d) {
  const b = Calc.budget(d);
  if (b.total === null && !d.expenses.length) return block('budget', 'Бюджет', mini('Задайте загальний бюджет відкриття, щоб бачити, чи вистачає грошей.', 'go-budget', 'Налаштувати бюджет'), { cls: 'hb-budget' });
  const short = b.free !== null && b.free < 0;
  const pct = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : 0;
  return block('budget', 'Бюджет', `<div class="stats">
      <div class="stat"><span class="k">Сплачено</span><span class="v">${fmtMoney(b.paid)}</span></div>
      <div class="stat"><span class="k">Ще потрібно за планом</span><span class="v">${fmtMoney(b.toPay)}</span></div>
      <div class="stat"><span class="k">${short ? 'Нестача' : 'Вільний залишок'}</span><span class="v ${short ? 'bad' : b.free === null ? '' : 'good'}">${b.free === null ? '—' : fmtMoney(Math.abs(b.free))}</span></div></div>
    ${b.total ? `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Сплачено від бюджету ${fmtMoney(b.total)}"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pct}%"></i></div><p class="small muted" style="margin:8px 0 0">Бюджет відкриття ${fmtMoney(b.total)}${b.deposit.needed ? `, з них поворотний депозит ${fmtMoney(b.deposit.needed)}` : ''}.</p>`
      : '<p class="small muted" style="margin:10px 0 0"><button class="btn link" data-nav="budget">Задайте загальний бюджет</button>, щоб бачити залишок.</p>'}`, { more: 'budget', moreLabel: 'Фінанси', cls: 'hb-budget' });
}

/** Підготовка: дата, прогрес і один найближчий важливий крок, якого немає в «Найближчих справах». */
function openingBlock(d, shownTaskIds) {
  const r = openingReadiness(d); const p = r.prep;
  const step = r.blockers.find(b => !(b.ref && b.ref.collection === 'tasks' && shownTaskIds.has(b.ref.id)))
    || (() => { const t = d.tasks.filter(x => x.prep && x.status !== 'done' && !shownTaskIds.has(x.id)).sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1)[0];
      return t ? { level: 'info', text: t.title + (t.deadline ? ` · до ${fmtDate(t.deadline)}` : ''), ref: { collection: 'tasks', id: t.id } } : null; })();
  const date = r.openingDate
    ? `<div class="ob-date"><b class="serif">${fmtDate(r.openingDate)}</b><span class="s">${r.daysLeft > 0 ? `через ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}` : r.daysLeft === 0 ? 'сьогодні' : `минула ${-r.daysLeft} ${plural(-r.daysLeft, 'день', 'дні', 'днів')} тому`}</span></div>`
    : '';
  const body = `${r.openingDate ? date : mini('Задайте планову дату відкриття.', 'opening-date', 'Задати дату')}
    ${p.total ? `<div class="row small" style="justify-content:space-between;margin-top:12px"><span>Підготовка: ${p.done} з ${p.total}</span><b class="num">${p.pct}%</b></div><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Виконано завдань підготовки"><i style="width:${p.pct}%"></i></div><p class="progress-note">За завданнями з позначкою «підготовка». Орієнтир, а не гарантія.</p>` : r.openingDate ? '<p class="small muted" style="margin:10px 0 0">Позначте завдання як «підготовка до відкриття», щоб бачити прогрес.</p>' : ''}
    ${step ? `<div class="next-step"><span class="k">Найближчий важливий крок</span><div class="hint-list"><div class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap">${dot(step.level)}${refBtn(step.text, step.ref, 'opening')}</div></div></div>` : ''}`;
  return { html: block('shop', 'Підготовка до відкриття', body, { more: 'opening', moreLabel: 'План', cls: 'hb-open' }), stepRef: step && step.ref };
}

/** До трьох підказок, які не повторюють інші блоки головної. */
function aiBlock(d, stepRef) {
  const order = { bad: 0, warn: 1, info: 2 };
  const repeats = c => c.page === 'planner' || c.page === 'reminders' || /перевищують бюджет/.test(c.text)
    || (stepRef && c.ref && c.ref.collection === stepRef.collection && c.ref.id === stepRef.id);
  const checks = runChecks(d).filter(c => !repeats(c)).sort((a, b) => order[a.level] - order[b.level]).slice(0, 3);
  return block('ai', 'AI-менеджер', `<div style="margin:-4px 0 8px">${AI.statusPill()}</div>
    ${checks.length ? `<ul class="hint-list">${checks.map(c => `<li>${dot(c.level)}${refBtn(c.text, c.ref, c.page)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">Нових підказок немає.</p>'}
    <form class="ask" data-form="ai-ask"><input class="input" name="q" id="home-ai-q" data-unsaved placeholder="Запитайте AI-менеджера" autocomplete="off" aria-label="Запит до AI-менеджера"><button class="btn primary" type="submit">Запитати</button></form>`, { more: 'ai', moreLabel: 'Чат', cls: 'hb-ai' });
}

VIEWS.home = () => {
  const d = D();
  const items = todayItems(d);
  const shown = new Set(items.slice(0, LIMIT).filter(x => x.kind === 'task').map(x => x.t.id));
  const op = openingBlock(d, shown);
  return `<div class="hero only-m"><span class="hero-date">${esc(longToday())}</span><h1>Ваш магазин починається тут</h1></div>
  <div class="home-2">${upcomingBlock(items)}${op.html}${budgetBlock(d)}${aiBlock(d, op.stepRef)}</div>`;
};
