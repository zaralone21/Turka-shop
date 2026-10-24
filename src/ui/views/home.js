import { Calc } from '../../core/calc.js';
import { runChecks } from '../../core/checks.js';
import { fireAt, isDue } from '../../core/reminders.js';
import { criticalTasks, fitoutSummary, monthlySummary, isLeaseConfirmed, mainPremises, openingReadiness, premisesTitle } from '../../core/opening.js';
import { addDaysISO, daysFromToday, esc, fmtDate, fmtKyiv, fmtMoney, isNum, kyivParts, plural, todayISO } from '../../core/utils.js';
import { AI } from '../ai.js';
import { premisesPill } from './premises.js';
import { longToday, svg } from '../shell.js';
import { D, VIEWS, deadlineLabel, emptyState, isOverdue, prioPill, supplierName } from '../shared.js';

/* ---------- Головна: окремі блоки для щоденної роботи ---------- */
const svgBell = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const block = (title, body, { more, count, cls = '' } = {}) => `<section class="panel ${cls}"><div class="panel-head"><h2>${title}${count ? ` <span class="cnt">${count}</span>` : ''}</h2>${more ? `<button class="btn sm ghost" data-nav="${more}">Усі →</button>` : ''}</div>${body}</section>`;

const refBtn = (text, ref, page) => ref
  ? `<button class="btn link" style="text-align:left;white-space:normal" data-act="open-ref" data-col="${ref.collection}" data-id="${ref.id}">${esc(text)}</button>`
  : `<button class="btn link" style="text-align:left;white-space:normal" data-nav="${page || 'home'}">${esc(text)}</button>`;
const dot = l => `<i class="dot ${l === 'bad' ? 'bad' : l === 'warn' ? 'warn' : ''}"></i>`;

const ico = (name) => `<span class="ico-c" aria-hidden="true">${svg(name)}</span>`;

/** Банер «Готуємося до відкриття»: дата, прогрес за позначеними завданнями, перші перешкоди. */
function openingBanner(d) {
  const r = openingReadiness(d); const p = r.prep;
  const when = r.openingDate
    ? `<div class="ob-date"><span class="k">Планова дата</span><b class="serif">${fmtDate(r.openingDate)}</b><span class="s">${r.daysLeft > 0 ? `через ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}` : r.daysLeft === 0 ? 'сьогодні' : `минула ${-r.daysLeft} ${plural(-r.daysLeft, 'день', 'дні', 'днів')} тому`}</span></div>`
    : `<div class="ob-date"><span class="k">Планова дата</span><span class="s">ще не задана</span></div>`;
  const prog = p.total
    ? `<div class="ob-prog"><div class="row small" style="justify-content:space-between"><span>Завдання підготовки: ${p.done} з ${p.total}</span><b class="num">${p.pct}%</b></div><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Виконано завдань підготовки"><i style="width:${p.pct}%"></i></div><span class="progress-note">Рахується лише за завданнями, які ви позначили як підготовку. Це орієнтир, а не гарантія.</span></div>`
    : `<div class="ob-prog"><span class="small">Позначте завдання як «підготовка до відкриття», щоб бачити прогрес.</span></div>`;
  const bl = r.blockers.slice(0, 3);
  const blockers = bl.length ? `<ul class="ob-block hint-list">${bl.map(b => `<li>${dot(b.level)}${refBtn(b.text, b.ref, 'planner')}</li>`).join('')}${r.blockers.length > 3 ? `<li class="small muted">і ще ${r.blockers.length - 3}: запитайте AI «Що заважає відкритися?»</li>` : ''}</ul>` : '';
  return `<section class="opening-banner" aria-label="Підготовка до відкриття">
    <div class="ob-main">${ico('shop')}<div><h2 class="serif">Готуємося до відкриття</h2>${blockers ? '' : '<p class="small" style="margin:2px 0 0">Перешкод у записах не знайдено.</p>'}</div></div>
    ${when}${prog}
    <div class="ob-act"><button class="btn sm ${r.openingDate ? '' : 'primary'}" data-act="opening-date">${r.openingDate ? 'Змінити дату' : 'Задати дату'}</button></div>
    ${blockers}
  </section>`;
}

/** Чотири короткі показники. */
function kpis(d) {
  const b = Calc.budget(d); const ms = monthlySummary(d);
  const priced = d.products.filter(p => Calc.unitCost(p) !== null && isNum(p.retailPrice)).length;
  const contact = d.suppliers.filter(s => s.status === 'contact').length;
  const card = (page, icon, k, v, sub, extra = '') => `<button class="kpi" data-nav="${page}">${ico(icon)}<span class="k">${k}</span><span class="v num">${v}</span><span class="s">${sub}</span>${extra}</button>`;
  const pct = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : 0;
  return `<section class="kpis">
    ${card('budget', 'budget', 'Бюджет відкриття', b.total === null ? '<span class="muted">не задано</span>' : fmtMoney(b.total), b.total === null ? `заплановано ${fmtMoney(b.needed)}` : `сплачено ${fmtMoney(b.paid)}`, b.total ? `<span class="meter" aria-hidden="true"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pct}%"></i></span>` : '')}
    ${card('monthly', 'monthly', 'Щомісячні витрати', ms.total ? fmtMoney(ms.total) : '<span class="muted">—</span>', ms.missing.length ? `без суми: ${ms.missing.length}` : ms.total ? 'на місяць' : 'ще не заповнено')}
    ${card('products', 'products', 'Товари', String(d.products.length), d.products.length ? `з цінами: ${priced}` : 'ще не додано')}
    ${card('suppliers', 'suppliers', 'Постачальники', String(d.suppliers.length), d.suppliers.length ? (contact ? `зв’язатися: ${contact}` : 'усі в роботі') : 'ще не додано')}
  </section>`;
}

function upcomingBlock(d) {
  const today = todayISO(); const now = new Date(); const until = addDaysISO(today, 7);
  const tasks = d.tasks.filter(t => t.status !== 'done' && t.deadline && t.deadline <= until)
    .sort((a, b) => a.deadline < b.deadline ? -1 : 1).slice(0, 7);
  const rems = d.reminders.filter(r => r.status !== 'done' && (isDue(r, now) || kyivParts(new Date(fireAt(r))).date <= until))
    .sort((a, b) => fireAt(a) < fireAt(b) ? -1 : 1).slice(0, 5);
  const crit = criticalTasks(d).filter(t => !tasks.includes(t)).slice(0, 4);
  const critHtml = crit.length ? `<h3 class="sub-h">Критичні без найближчого терміну</h3><div class="list">${crit.map(t => `<div class="li"><button class="tick" data-act="task-done" data-id="${t.id}" aria-label="Позначити виконаним">✓</button><button class="li-btn" data-act="edit-task" data-id="${t.id}"><span class="nm">${esc(t.title)}</span><div class="row small" style="gap:6px;margin-top:2px">${prioPill(t.priority)}${t.deadline ? deadlineLabel(t) : '<span class="muted">без терміну</span>'}</div></button></div>`).join('')}</div>` : '';
  if (!tasks.length && !rems.length) {
    const next = d.tasks.filter(t => t.status !== 'done').length;
    if (crit.length) return block('Найближчі справи', `<p class="small muted" style="margin:-4px 0 8px">На 7 днів уперед справ із терміном немає.</p>${critHtml}`, { more: 'planner', cls: 'hb-tasks' });
    return block('Найближчі справи', `<div class="empty mini"><p>${next ? 'На найближчий тиждень немає справ із терміном.' : 'Запишіть першу справу або нагадування.'}</p><div class="row" style="justify-content:center"><button class="btn sm primary" data-act="add-task">Додати завдання</button><button class="btn sm" data-act="add-reminder">Нагадування</button></div></div>`, { more: 'planner', cls: 'hb-tasks' });
  }
  const remRows = rems.map(r => { const due = isDue(r, now);
    return `<div class="li" style="align-items:flex-start">${svgBell}<div class="t"><button class="li-btn" data-act="edit-reminder" data-id="${r.id}"><span class="nm">${esc(r.title)}</span></button>
      <div class="row small" style="gap:6px;margin-top:4px"><span class="pill ${due ? 'bad' : 'accent'}">${due ? 'Час настав · ' : ''}${esc(fmtKyiv(fireAt(r)))}${r.status === 'snoozed' ? ' · відкладено' : ''}</span>${due ? `<button class="btn sm" data-act="rem-done" data-id="${r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${r.id}">Відкласти</button>` : ''}</div></div></div>`; }).join('');
  const taskRows = tasks.map(t => `<div class="li"><button class="tick" data-act="task-done" data-id="${t.id}" aria-label="Позначити виконаним">✓</button><button class="li-btn" data-act="edit-task" data-id="${t.id}"><span class="nm">${esc(t.title)}</span><div class="row small" style="gap:6px;margin-top:2px">${deadlineLabel(t)} ${prioPill(t.priority)}${t.prep ? '<span class="pill">підготовка</span>' : ''}</div></button></div>`).join('');
  return block('Найближчі справи', `<p class="small muted" style="margin:-4px 0 8px">Прострочене та на 7 днів уперед</p><div class="list">${remRows}${taskRows}</div>${critHtml}`, { more: 'planner', count: tasks.length + rems.length, cls: 'hb-tasks' });
}

function budgetBlock(d) {
  const b = Calc.budget(d); const ms = monthlySummary(d);
  if (b.total === null && !d.expenses.length) return block('Бюджет і витрати', emptyState('Задайте загальний бюджет і додайте перші витрати на відкриття.', 'go-budget', 'Налаштувати бюджет', true), { cls: 'hb-budget' });
  const pct = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : 0;
  const cats = d.settings.budgetCategories.map(c => ({ c, v: b.byCat[c.id] })).filter(x => x.v && x.v.needed > 0).sort((x, y) => y.v.needed - x.v.needed).slice(0, 5);
  const max = Math.max(1, ...cats.map(x => x.v.needed));
  const bars = cats.length ? `<div class="cat-bars">${cats.map(({ c, v }) => `<div class="cat-bar"><div class="row small" style="justify-content:space-between;gap:8px"><span>${esc(c.name)}</span><span class="num muted">${fmtMoney(v.paid)} з ${fmtMoney(v.needed)}</span></div><div class="bar" aria-hidden="true"><i class="plan" style="width:${Math.round(v.needed / max * 100)}%"><i class="paid" style="width:${v.needed ? Math.min(100, Math.round(v.paid / v.needed * 100)) : 0}%"></i></i></div></div>`).join('')}</div>` : '';
  return block('Бюджет і витрати', `<div class="stats stats-4">
      <div class="stat"><span class="k">Доступно</span><span class="v">${b.total === null ? '—' : fmtMoney(b.total)}</span></div>
      <div class="stat"><span class="k">Сплачено</span><span class="v">${fmtMoney(b.paid)}</span></div>
      <div class="stat"><span class="k">Ще сплатити</span><span class="v">${fmtMoney(b.toPay)}</span></div>
      <div class="stat"><span class="k">${b.free !== null && b.free < 0 ? 'Не вистачає' : 'Вільно'}</span><span class="v ${b.free !== null && b.free < 0 ? 'bad' : 'good'}">${b.free === null ? '—' : fmtMoney(Math.abs(b.free))}</span></div></div>
    ${b.total ? `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Сплачено від бюджету"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pct}%"></i></div>` : ''}
    ${bars}
    <p class="small muted" style="margin:12px 0 0">${b.total === null ? '<button class="btn link" data-nav="budget">Задайте загальний бюджет</button>, щоб бачити, чи вистачає грошей. ' : ''}${b.deposit.needed ? `Депозит ${fmtMoney(b.deposit.needed)} повертається. ` : ''}Щомісячні витрати окремо: <button class="btn link" data-nav="monthly">${ms.total ? fmtMoney(ms.total) + ' на місяць' : 'ще не заповнено'}</button>.</p>`, { more: 'budget', cls: 'hb-budget' });
}

/** Швидка нотатка й кілька останніх. */
function quickNoteBlock(d) {
  const list = [...d.notes].sort((a, b) => b.updatedAt > a.updatedAt ? 1 : -1).slice(0, 3);
  return block('Швидка нотатка', `<form class="qnote" data-form="quick-note"><textarea class="input" id="home-note" name="q" rows="3" placeholder="Домовленість, ідея, контакт…" aria-label="Текст нотатки"></textarea><div class="row" style="justify-content:flex-end"><button class="btn sm primary" type="submit">Зберегти</button></div></form>
    ${list.length ? `<div class="list" style="margin-top:10px">${list.map(n => `<div class="li"><button class="li-btn" data-act="edit-note" data-id="${n.id}"><span class="nm">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Без заголовка')}</span><div class="small muted clamp" style="-webkit-line-clamp:1">${esc(n.body)}</div></button><span class="small muted">${fmtDate(n.updatedAt)}</span></div>`).join('')}</div>` : ''}`, { more: d.notes.length ? 'notes' : null, cls: 'hb-note' });
}

function placeBlock(d) {
  const pr = mainPremises(d); const fs = fitoutSummary(d);
  const prHtml = pr
    ? `<div class="li"><button class="li-btn" data-nav="premises"><span class="nm">${esc(premisesTitle(pr))}</span><div class="row small" style="gap:6px;margin-top:4px">${premisesPill(pr.status)}${isNum(pr.rent) ? `<span class="muted">оренда ${fmtMoney(pr.rent)}/міс</span>` : ''}</div></button></div>
       ${isLeaseConfirmed(pr) ? '' : '<p class="small" style="margin:6px 0 0;color:var(--warn)">Договір ще не підписано, умови не підтверджені.</p>'}`
    : `<div class="empty mini"><p>Приміщення ще не записане.</p><button class="btn sm primary" data-act="add-premises">Додати приміщення</button></div>`;
  const fitPct = fs.count ? Math.round(fs.done / fs.count * 100) : 0;
  const fitHtml = fs.count
    ? `<div class="row small" style="justify-content:space-between;margin-top:14px"><span>Облаштування: отримано або встановлено ${fs.done} з ${fs.count}</span><b>${fitPct}%</b></div><div class="meter"><i style="width:${fitPct}%"></i></div>
       <p class="small muted" style="margin:8px 0 0">${[fs.byStatus.undecided && `потрібно визначитися: ${fs.byStatus.undecided}`, fs.byStatus.ordered && `замовлено: ${fs.byStatus.ordered}`, fs.overdue.length && `<span style="color:var(--danger)">прострочено: ${fs.overdue.length}</span>`, fs.notInBudget && `не в бюджеті: ${fs.notInBudget}`].filter(Boolean).join(' · ') || 'Усе по плану.'}</p>`
    : '<p class="small muted" style="margin:14px 0 0"><button class="btn link" data-nav="fitout">Складіть список облаштування</button>: ремонт, світло, стелажі, вивіска.</p>';
  return block('Приміщення й облаштування', prHtml + fitHtml, { more: pr ? 'fitout' : null, cls: 'hb-place' });
}

function purchasesBlock(d) {
  if (!d.purchases.length) return block('Перша закупівля', emptyState('Плануйте закупівлю товару: постачальник, товари, кількість і очікувана дата.', 'add-purchase', 'Запланувати закупівлю', true));
  const sum = Calc.purchases(d);
  const ordered = d.purchases.filter(p => p.status === 'ordered' || p.status === 'awaiting');
  const active = d.purchases.filter(p => ['planned', 'ordered', 'awaiting'].includes(p.status))
    .sort((a, b) => (a.expectedDate || '9999') < (b.expectedDate || '9999') ? -1 : 1);
  const rows = active.slice(0, 4).map(p => { const late = p.expectedDate && daysFromToday(p.expectedDate) < 0 && p.status !== 'planned';
    return `<div class="li"><button class="li-btn" data-act="edit-purchase" data-id="${p.id}"><span class="nm">${esc(p.title)}</span><div class="small muted">${[supplierName(p.supplierId), p.expectedDate && (late ? `<span style="color:var(--danger)">мало бути ${fmtDate(p.expectedDate)}</span>` : 'очікується ' + fmtDate(p.expectedDate))].filter(Boolean).join(' · ')}</div></button><span class="num small" style="text-align:right">${fmtMoney(Calc.purchaseTotal(p).total)}<br><span class="pill ${p.status === 'planned' ? '' : 'accent'}">${p.status === 'planned' ? 'План' : 'Замовлено'}</span></span></div>`; }).join('');
  return block('Перша закупівля', `<div class="stats" style="margin-bottom:6px"><div class="stat"><span class="k">План (${sum.count.planned})</span><span class="v">${fmtMoney(sum.planned)}</span></div><div class="stat"><span class="k">Замовлено (${ordered.length})</span><span class="v">${fmtMoney(sum.awaiting)}</span></div><div class="stat"><span class="k">Отримано (${sum.count.received})</span><span class="v">${fmtMoney(sum.received)}</span></div></div>
    ${rows ? `<div class="list">${rows}</div>` : '<p class="small muted" style="margin:0">Активних закупівель немає.</p>'}`, { more: 'purchases' });
}

function suppliersBlock(d) {
  if (!d.suppliers.length) return block('Постачальники', emptyState('Додайте постачальника, щоб зберігати контакти, умови й ціни в одному місці.', 'add-supplier', 'Додати постачальника', true));
  const list = d.suppliers.filter(s => s.status === 'contact');
  const unchecked = d.suppliers.filter(s => s.status !== 'rejected' && (!s.checkedAt || -daysFromToday(s.checkedAt) > 90)).length;
  const body = list.length ? `<div class="list">${list.slice(0, 5).map(s => `<div class="li"><button class="li-btn" data-act="open-supplier" data-id="${s.id}"><span class="nm">${esc(s.name)}</span><div class="small muted">${[s.contactPerson, s.phone || s.messenger || s.instagram].filter(Boolean).map(esc).join(' · ') || 'контакти не вказані'}</div></button></div>`).join('')}</div>`
    : '<p class="small muted" style="margin:0">Зараз немає постачальників зі статусом «Зв’язатися».</p>';
  return block('Постачальники', body + (unchecked ? `<p class="small muted" style="margin:10px 0 0">Інформацію ${unchecked} ${unchecked === 1 ? 'постачальника' : 'постачальників'} давно не перевіряли.</p>` : ''), { more: 'suppliers', count: list.length || null });
}

function aiBlock(d) {
  const order = { bad: 0, warn: 1, info: 2 };
  const checks = runChecks(d).sort((a, b) => order[a.level] - order[b.level]).slice(0, 5);
  const list = checks.length ? `<ul class="hint-list">${checks.map(c => `<li>${dot(c.level)}${refBtn(c.text, c.ref, c.page)}</li>`).join('')}</ul>`
    : '<p class="small muted" style="margin:0">Автоматичні перевірки не знайшли проблем.</p>';
  return block(`${ico('ai')}AI-менеджер`, `<div style="margin:-4px 0 10px">${AI.statusPill()}</div><p class="small muted" style="margin:0 0 8px">Короткі підказки з перевірок ваших записів. Натисніть, щоб відкрити запис.</p>${list}
    <form class="ask" data-form="ai-ask"><input class="input" name="q" id="home-ai-q" placeholder="Наприклад: що заважає відкритися до обраної дати?" autocomplete="off" aria-label="Запит до AI-менеджера"><button class="btn primary" type="submit">Запитати</button></form>`, { more: 'ai', cls: 'hb-ai' });
}

VIEWS.home = () => {
  const d = D();
  return `<div class="hero only-m"><span class="hero-date">${esc(longToday())}</span><h1>Ваш магазин починається тут</h1></div>
  ${openingBanner(d)}${kpis(d)}
  <div class="home-row r-tasks">${upcomingBlock(d)}${aiBlock(d)}</div>
  <div class="home-row r-money">${budgetBlock(d)}${quickNoteBlock(d)}</div>
  <div class="home-row r-place">${placeBlock(d)}${purchasesBlock(d)}${suppliersBlock(d)}</div>`;
};
