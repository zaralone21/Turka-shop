import { Calc } from '../../core/calc.js';
import { runChecks } from '../../core/checks.js';
import { fireAt, isDue } from '../../core/reminders.js';
import { daysFromToday, esc, fmtDate, fmtKyiv, fmtMoney, kyivParts, todayISO } from '../../core/utils.js';
import { AI } from '../ai.js';
import { D, VIEWS, deadlineLabel, emptyState, isOverdue, prioPill, supplierName } from '../shared.js';

/* ---------- Головна: окремі блоки для щоденної роботи ---------- */
const svgBell = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const block = (title, body, { more, count, cls = '' } = {}) => `<section class="panel ${cls}"><div class="panel-head"><h2>${title}${count ? ` <span class="cnt">${count}</span>` : ''}</h2>${more ? `<button class="btn sm ghost" data-nav="${more}">Усі →</button>` : ''}</div>${body}</section>`;

function todayBlock(d) {
  const today = todayISO(); const now = new Date();
  const tasks = d.tasks.filter(t => t.status !== 'done' && t.deadline && (isOverdue(t) || t.deadline === today))
    .sort((a, b) => a.deadline < b.deadline ? -1 : 1);
  const rems = d.reminders.filter(r => r.status !== 'done' && (isDue(r, now) || kyivParts(new Date(fireAt(r))).date === today))
    .sort((a, b) => fireAt(a) < fireAt(b) ? -1 : 1);
  if (!tasks.length && !rems.length) {
    const next = d.tasks.filter(t => t.status !== 'done').length;
    return block('Сьогодні', `<div class="empty mini"><p>${next ? 'На сьогодні немає термінових справ і нагадувань.' : 'Запишіть першу справу або нагадування на сьогодні.'}</p><div class="row" style="justify-content:center"><button class="btn sm primary" data-act="add-task">Додати завдання</button><button class="btn sm" data-act="add-reminder">Нагадування</button></div></div>`, { more: 'planner', cls: 'span-2' });
  }
  const remRows = rems.map(r => { const due = isDue(r, now);
    return `<div class="li" style="align-items:flex-start">${svgBell}<div class="t"><button class="li-btn" data-act="edit-reminder" data-id="${r.id}"><span class="nm">${esc(r.title)}</span></button>
      <div class="row small" style="gap:6px;margin-top:4px"><span class="pill ${due ? 'bad' : 'accent'}">${due ? 'Час настав · ' : ''}${fmtKyiv(fireAt(r)).split(', ')[1]}${r.status === 'snoozed' ? ' · відкладено' : ''}</span><button class="btn sm" data-act="rem-done" data-id="${r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${r.id}">Відкласти</button></div></div></div>`; }).join('');
  const taskRows = tasks.map(t => `<div class="li"><button class="tick" data-act="task-done" data-id="${t.id}" aria-label="Позначити виконаним">✓</button><button class="li-btn" data-act="edit-task" data-id="${t.id}"><span class="nm">${esc(t.title)}</span><div class="row small" style="gap:6px;margin-top:2px">${deadlineLabel(t)} ${prioPill(t.priority)}</div></button></div>`).join('');
  return block('Сьогодні', `<div class="list">${remRows}${taskRows}</div>`, { more: 'planner', count: tasks.length + rems.length, cls: 'span-2' });
}

function budgetBlock(d) {
  const b = Calc.budget(d);
  if (b.total === null && !d.expenses.length) return block('Бюджет', emptyState('Задайте загальний бюджет і додайте перші витрати на відкриття.', 'go-budget', 'Налаштувати бюджет', true));
  const left = b.total === null ? null : b.total - b.paid;
  const pct = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : 0;
  return block('Бюджет', `<div class="stats">
      <div class="stat"><span class="k">Заплановано</span><span class="v">${fmtMoney(b.needed)}</span></div>
      <div class="stat"><span class="k">Витрачено</span><span class="v">${fmtMoney(b.paid)}</span></div>
      <div class="stat"><span class="k">Залишок</span><span class="v ${left !== null && left < 0 ? 'bad' : ''}">${left === null ? '—' : fmtMoney(left)}</span></div></div>
    ${b.total ? `<div class="meter" title="Витрачено ${pct}% бюджету"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pct}%"></i></div>` : ''}
    <p class="small muted" style="margin:10px 0 0">${b.total === null ? '<button class="btn link" data-nav="budget">Задайте загальний бюджет</button>, щоб бачити залишок.' : b.free >= 0 ? `Після всіх запланованих оплат вільно ${fmtMoney(b.free)}.` : `<span style="color:var(--danger)">План перевищує бюджет на ${fmtMoney(-b.free)}.</span>`}${b.deposit.needed ? ` Депозит ${fmtMoney(b.deposit.needed)} повертається.` : ''}</p>`, { more: 'budget' });
}

function suppliersBlock(d) {
  if (!d.suppliers.length) return block('Постачальники', emptyState('Додайте постачальника, щоб зберігати контакти, умови й ціни в одному місці.', 'add-supplier', 'Додати постачальника', true));
  const list = d.suppliers.filter(s => s.status === 'contact');
  const unchecked = d.suppliers.filter(s => s.status !== 'rejected' && (!s.checkedAt || -daysFromToday(s.checkedAt) > 90)).length;
  const body = list.length ? `<div class="list">${list.slice(0, 5).map(s => `<div class="li"><button class="li-btn" data-act="open-supplier" data-id="${s.id}"><span class="nm">${esc(s.name)}</span><div class="small muted">${[s.contactPerson, s.phone || s.messenger || s.instagram].filter(Boolean).map(esc).join(' · ') || 'контакти не вказані'}</div></button></div>`).join('')}</div>`
    : '<p class="small muted" style="margin:0">Зараз немає постачальників зі статусом «Зв’язатися».</p>';
  return block('Постачальники', body + (unchecked ? `<p class="small muted" style="margin:10px 0 0">Інформацію ${unchecked} ${unchecked === 1 ? 'постачальника' : 'постачальників'} давно не перевіряли.</p>` : ''), { more: 'suppliers', count: list.length || null });
}

function purchasesBlock(d) {
  if (!d.purchases.length) return block('Закупівлі', emptyState('Плануйте закупівлі: постачальник, товари, кількість і очікувана дата.', 'add-purchase', 'Запланувати закупівлю', true));
  const active = d.purchases.filter(p => ['planned', 'ordered', 'awaiting'].includes(p.status))
    .sort((a, b) => (a.expectedDate || '9999') < (b.expectedDate || '9999') ? -1 : 1);
  const sum = Calc.purchases(d);
  const rows = active.slice(0, 5).map(p => { const late = p.expectedDate && daysFromToday(p.expectedDate) < 0 && p.status !== 'planned';
    return `<div class="li"><button class="li-btn" data-act="edit-purchase" data-id="${p.id}"><span class="nm">${esc(p.title)}</span><div class="small muted">${[supplierName(p.supplierId), p.expectedDate && (late ? `<span style="color:var(--danger)">мало бути ${fmtDate(p.expectedDate)}</span>` : 'очікується ' + fmtDate(p.expectedDate))].filter(Boolean).join(' · ')}</div></button><span class="num small" style="text-align:right">${fmtMoney(Calc.purchaseTotal(p).total)}<br><span class="pill ${p.status === 'planned' ? '' : 'accent'}">${p.status === 'planned' ? 'План' : 'Очікується'}</span></span></div>`; }).join('');
  return block('Закупівлі', `<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:6px"><div class="stat"><span class="k">Заплановано (${sum.count.planned})</span><span class="v">${fmtMoney(sum.planned)}</span></div><div class="stat"><span class="k">Очікується (${sum.count.awaiting})</span><span class="v">${fmtMoney(sum.awaiting)}</span></div></div>
    ${rows ? `<div class="list">${rows}</div>` : '<p class="small muted" style="margin:0">Активних закупівель немає.</p>'}`, { more: 'purchases' });
}

function notesBlock(d) {
  if (!d.notes.length) return block('Останні нотатки', emptyState('Записуйте домовленості, ідеї та корисні контакти.', 'add-note', 'Створити нотатку', true));
  const list = [...d.notes].sort((a, b) => b.updatedAt > a.updatedAt ? 1 : -1).slice(0, 4);
  return block('Останні нотатки', `<div class="list">${list.map(n => `<div class="li"><button class="li-btn" data-act="edit-note" data-id="${n.id}"><span class="nm">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Без заголовка')}</span><div class="small muted clamp" style="-webkit-line-clamp:2">${esc(n.body)}</div></button><span class="small muted">${fmtDate(n.updatedAt)}</span></div>`).join('')}</div>`, { more: 'notes' });
}

function aiBlock(d) {
  const checks = runChecks(d).slice(0, 5);
  const list = checks.length ? `<ul class="hint-list">${checks.map(c => `<li><i class="dot ${c.level === 'bad' ? 'bad' : c.level === 'warn' ? 'warn' : ''}"></i><button class="btn link" style="text-align:left;white-space:normal" data-nav="${c.page}">${esc(c.text)}</button></li>`).join('')}</ul>`
    : '<p class="small muted" style="margin:0">Автоматичні перевірки не знайшли проблем.</p>';
  return block('AI-менеджер', `<div style="margin:-4px 0 10px">${AI.statusPill()}</div><p class="small muted" style="margin:0 0 8px">Підказки з автоматичних перевірок ваших записів:</p>${list}
    <form class="ask" data-form="ai-ask"><input class="input" name="q" id="home-ai-q" placeholder="Запитайте, наприклад: що зробити цього тижня?" autocomplete="off" aria-label="Запит до AI-менеджера"><button class="btn primary" type="submit">Запитати</button></form>`, { more: 'ai' });
}

VIEWS.home = () => {
  const d = D();
  return `<p class="muted" style="margin:0">Сьогодні ${fmtDate(todayISO())}</p>
  <div class="home-grid">${todayBlock(d)}${aiBlock(d)}${budgetBlock(d)}${suppliersBlock(d)}${purchasesBlock(d)}${notesBlock(d)}</div>`;
};
