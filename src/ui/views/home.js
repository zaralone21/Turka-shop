import { Calc } from '../../core/calc.js';
import { runChecks } from '../../core/checks.js';
import { fireAt, isDue } from '../../core/reminders.js';
import { openingReadiness } from '../../core/opening.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, kyivParts, plural, todayISO } from '../../core/utils.js';
import { AI } from '../ai.js';
import { longToday, svg } from '../shell.js';
import { cottonLogo } from '../brand.js';
import { D, VIEWS, deadlineLabel, isOverdue, prioPill } from '../shared.js';

/* ---------- Головна: компактний огляд. Кожен запис показується лише в одному з блоків. ---------- */
const chev = () => svg('chev', 'class="chev"');
const head = (icon, title, nav, label) => `<div class="panel-head">${nav ? `<button class="card-link" data-nav="${nav}"><h2>${title}</h2><span class="small muted row" style="gap:2px">${label || ''}${chev()}</span></button>` : `<h2>${title}</h2>`}</div>`;
const mini = (text, act, label, nav) => `<div class="empty mini"><p>${text}</p><button class="btn sm primary" ${nav ? `data-nav="${nav}"` : `data-act="${act}"`}>${label}</button></div>`;
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
  return { urgent, items: [...urgent, ...next].slice(0, LIMIT), more: urgent.length > LIMIT ? urgent.length - LIMIT : 0 };
}

function upcomingBlock({ urgent, items, more }) {
  const add = '<button class="btn sm ghost" data-act="add-task" aria-label="Додати завдання">' + svg('plus') + '</button>';
  const top = `<div class="panel-head"><button class="card-link" data-nav="planner" style="width:auto;flex:1"><h2>Найближчі справи${urgent.length ? ` <span class="cnt">${urgent.length}</span>` : ''}</h2><span class="small muted row" style="gap:2px">Усі${chev()}</span></button>${add}</div>`;
  if (!items.length) return `<section class="panel hb-tasks c-tasks">${top}${mini('Немає завдань із термінами. Додайте першу справу, щоб нічого не загубилось.', 'add-task', 'Додати завдання')}</section>`;
  const now = new Date();
  const row = x => x.kind === 'task'
    ? `<div class="trow li ${isOverdue(x.t) ? 'overdue' : ''}"><button class="tick" data-act="task-done" data-id="${x.t.id}" aria-label="Позначити виконаним">✓</button><div class="mn"><button class="ttl" data-act="edit-task" data-id="${x.t.id}"><span class="nm">${esc(x.t.title)}</span></button>${x.t.priority === 'high' ? `<div class="meta">${prioPill('high')}</div>` : ''}</div><span class="date-chip ${isOverdue(x.t) ? 'bad' : ''}" ${isOverdue(x.t) ? 'title="Прострочено"' : ''}>${x.t.deadline === todayISO() ? 'сьогодні' : shortDate(x.t.deadline)}</span></div>`
    : `<div class="trow li"><span class="li-ico" aria-hidden="true">${svg('bell')}</span><div class="mn"><button class="ttl" data-act="edit-reminder" data-id="${x.r.id}"><span class="nm">${esc(x.r.title)}</span></button>
      <div class="meta"><span class="pill ${isDue(x.r, now) ? 'bad' : 'accent'}">${isDue(x.r, now) ? 'Час настав · ' : ''}${esc(fmtKyiv(fireAt(x.r)))}</span>${isDue(x.r, now) ? `<button class="btn sm" data-act="rem-done" data-id="${x.r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${x.r.id}">Відкласти</button>` : ''}</div></div></div>`;
  return `<section class="panel hb-tasks c-tasks">${top}<div class="list">${items.map(row).join('')}</div>${more ? `<p class="small muted" style="margin:8px 0 0">І ще ${more} у планері.</p>` : ''}</section>`;
}

function budgetBlock(d) {
  const b = Calc.budget(d);
  if (b.total === null && !d.expenses.length) return `<section class="panel hb-budget c-budget">${head('budget', 'Бюджет відкриття', 'budget')}${mini('Задайте загальний бюджет відкриття, щоб бачити, чи вистачає грошей.', 'go-budget', 'Налаштувати бюджет')}</section>`;
  const short = b.free !== null && b.free < 0;
  const pct = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : 0;
  return `<section class="panel hb-budget c-budget">${head('budget', 'Бюджет відкриття', 'budget')}
    <div class="money-3 stats">
      <div class="stat"><span class="v">${fmtMoney(b.paid)}</span><span class="k">Сплачено</span></div>
      <div class="stat"><span class="v">${fmtMoney(b.toPay)}</span><span class="k">Ще потрібно</span></div>
      <div class="stat"><span class="v ${short ? 'bad' : b.free === null ? '' : 'good'}">${b.free === null ? '—' : fmtMoney(Math.abs(b.free))}</span><span class="k">${short ? 'Нестача' : 'Залишок'}</span></div></div>
    ${b.total ? `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Сплачено від бюджету ${fmtMoney(b.total)}"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pct}%"></i></div>
      <div class="meter-row"><span>Усього ${fmtMoney(b.total)}${b.deposit.needed ? ` · депозит ${fmtMoney(b.deposit.needed)}` : ''}</span><span class="num">${pct}%</span></div>`
      : '<p class="small muted" style="margin:10px 0 0"><button class="btn link" data-nav="budget">Задайте загальний бюджет</button>, щоб бачити залишок.</p>'}</section>`;
}

/** Підготовка: прогрес, дата і один найближчий важливий крок, якого немає в «Найближчих справах». */
function openingBlock(d, shownTaskIds) {
  const r = openingReadiness(d); const p = r.prep;
  const step = r.blockers.find(b => !(b.ref && b.ref.collection === 'tasks' && shownTaskIds.has(b.ref.id)))
    || (() => { const t = d.tasks.filter(x => x.prep && x.status !== 'done' && !shownTaskIds.has(x.id)).sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1)[0];
      return t ? { level: 'info', text: t.title + (t.deadline ? ` · до ${fmtDate(t.deadline)}` : ''), ref: { collection: 'tasks', id: t.id } } : null; })();
  const when = r.openingDate ? `Відкриття ${fmtDate(r.openingDate)} · ${r.daysLeft > 0 ? `через ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}` : r.daysLeft === 0 ? 'сьогодні' : `минула ${-r.daysLeft} ${plural(-r.daysLeft, 'день', 'дні', 'днів')} тому`}` : 'Дату відкриття ще не задано';
  const banner = `<button class="banner-card hb-open" data-nav="opening" aria-label="План відкриття"><span class="wm" aria-hidden="true">${cottonLogo()}</span>
    <span class="k">Підготовка до відкриття</span>
    ${p.total ? `<span class="big">${p.pct}%</span><span class="s">${p.done} з ${p.total} ${plural(p.total, 'завдання', 'завдання', 'завдань')} · ${esc(when)}</span><span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Виконано завдань підготовки"><i style="width:${p.pct}%"></i></span>`
      : `<span class="big" style="font-size:1.35rem">${r.openingDate ? esc(fmtDate(r.openingDate)) : 'Почніть план'}</span><span class="s">${esc(when)}. Позначайте завдання як «підготовка», щоб бачити прогрес.</span>`}
    <span class="go" aria-hidden="true">${svg('arrow')}</span></button>`;
  const next = step ? `<div class="panel next-step-card"><span class="small muted">Найближчий важливий крок</span><div class="hint-list" style="margin-top:4px"><div class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap">${dot(step.level)}${refBtn(step.text, step.ref, 'opening')}</div></div></div>` : '';
  return { html: `<div class="c-open" style="display:flex;flex-direction:column;gap:12px">${banner}${next}</div>`, stepRef: step && step.ref, r };
}

/** До трьох підказок, які не повторюють інші блоки головної. */
function aiBlock(d, stepRef) {
  const order = { bad: 0, warn: 1, info: 2 };
  const repeats = c => c.page === 'planner' || c.page === 'reminders' || /перевищують бюджет/.test(c.text)
    || (stepRef && c.ref && c.ref.collection === stepRef.collection && c.ref.id === stepRef.id);
  const checks = runChecks(d).filter(c => !repeats(c)).sort((a, b) => order[a.level] - order[b.level]).slice(0, 3);
  return `<section class="panel hb-ai c-ai">${head('ai', 'AI-менеджер', 'ai', 'Чат')}<div style="margin:-4px 0 8px">${AI.statusPill()}</div>
    ${checks.length ? `<ul class="hint-list">${checks.map(c => `<li>${dot(c.level)}${refBtn(c.text, c.ref, c.page)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">Нових підказок немає.</p>'}
    <form class="ask" data-form="ai-ask"><input class="input" name="q" id="home-ai-q" data-unsaved placeholder="Запитайте AI-менеджера" autocomplete="off" aria-label="Запит до AI-менеджера"><button class="btn primary" type="submit">Запитати</button></form></section>`;
}

/** Привітання за київським часом і один рядок про стан магазину з реальних даних. */
function greeting(d, r) {
  const h = kyivParts().h;
  const hi = h < 5 ? 'Доброї ночі' : h < 12 ? 'Доброго ранку' : h < 18 ? 'Доброго дня' : 'Доброго вечора';
  const bad = r.blockers.filter(b => b.level === 'bad').length;
  const state = bad ? `${bad} ${plural(bad, 'питання потребує', 'питання потребують', 'питань потребують')} уваги.` : 'Усе під контролем.';
  const left = r.openingDate && r.daysLeft > 0 ? ` До відкриття ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}.` : '';
  return `<div class="greet"><span class="hero-date">${esc(longToday())}</span><h1>${hi}</h1><p>${state}${left}</p></div>`;
}

VIEWS.home = () => {
  const d = D();
  const t = todayItems(d);
  const shown = new Set(t.items.filter(x => x.kind === 'task').map(x => x.t.id));
  const op = openingBlock(d, shown);
  return `${greeting(d, op.r)}
  <div class="dash home-2"><div class="col-l">${budgetBlock(d)}${upcomingBlock(t)}</div><div class="col-r">${op.html}${aiBlock(d, op.stepRef)}</div></div>`;
};
