import { Calc } from '../../core/calc.js';
import { esc, fmtDate, fmtMoney, todayISO } from '../../core/utils.js';
import { D, VIEWS, deadlineLabel, emptyState, isOverdue, prioPill, taskSort } from '../shared.js';

/* ---------- 1. Головна ---------- */
VIEWS.home = () => {
  const d = D(); const b = Calc.budget(d);
  const open = d.tasks.filter(t => t.status !== 'done').sort(taskSort);
  const overdue = open.filter(isOverdue).length;
  const upcoming = open.slice(0, 6);
  const pinned = d.notes.filter(n => n.pinned).slice(0, 3);
  const working = d.suppliers.filter(s => s.status === 'working').length;
  const freeTile = b.total === null
    ? `<div class="tile"><span class="k">Залишок бюджету</span><span class="v">—</span><span class="s"><button class="btn sm" data-nav="budget">Задати загальний бюджет</button></span></div>`
    : `<div class="tile ${b.leftAfterPaid < 0 ? 'bad' : ''}"><span class="k">Залишок бюджету</span><span class="v">${fmtMoney(b.leftAfterPaid)}</span><span class="s">${b.free >= 0 ? `після всіх планових витрат вільно ${fmtMoney(b.free)}` : `<span style="color:var(--danger)">план перевищує бюджет на ${fmtMoney(-b.free)}</span>`}</span></div>`;
  return `
  <div class="page-head"><div><h1>Головна</h1><p>Сьогодні ${fmtDate(todayISO())}</p></div></div>
  <section class="quick home-quick" aria-label="Швидке додавання">
    <button class="btn" data-act="add-supplier"><span class="plus">+</span> Постачальник</button>
    <button class="btn" data-act="add-note"><span class="plus">+</span> Нотатка</button>
    <button class="btn" data-act="add-task"><span class="plus">+</span> Завдання</button>
    <button class="btn" data-act="add-expense"><span class="plus">+</span> Витрата</button>
  </section>
  <section class="tiles home-tiles">
    <div class="tile accent"><span class="k">Бюджет відкриття</span><span class="v">${b.total === null ? '—' : fmtMoney(b.total)}</span><span class="s">заплановано витрат ${fmtMoney(b.needed)}</span></div>
    <div class="tile"><span class="k">Фактично сплачено</span><span class="v">${fmtMoney(b.paid)}</span><span class="s">ще сплатити за планом ${fmtMoney(b.toPay)}</span></div>
    ${freeTile}
    <div class="tile"><span class="k">Постачальники</span><span class="v">${d.suppliers.length}</span><span class="s">з них працюємо: ${working}</span></div>
    <div class="tile ${overdue ? 'bad' : ''}"><span class="k">Невиконані завдання</span><span class="v">${open.length}</span><span class="s">${overdue ? `прострочено: ${overdue}` : 'прострочених немає'}</span></div>
  </section>
  <div class="grid-2 home-tasks">
    <section class="panel">
      <div class="panel-head"><h2>Найближчі завдання</h2><button class="btn sm ghost" data-nav="planner">Усі завдання →</button></div>
      ${upcoming.length ? `<div class="list">${upcoming.map(t => `<div class="li"><div class="t"><div style="font-weight:500">${esc(t.title)}</div><div class="row small">${deadlineLabel(t)} ${prioPill(t.priority)}${t.status === 'in_progress' ? ' <span class="pill accent">У роботі</span>' : ''}</div></div><button class="tick" data-act="task-done" data-id="${t.id}" title="Позначити виконаним" aria-label="Позначити виконаним">✓</button></div>`).join('')}</div>`
      : emptyState('Невиконаних завдань немає. Запишіть перший крок до відкриття.', 'add-task', 'Додати завдання')}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Закріплені нотатки</h2><button class="btn sm ghost" data-nav="notes">Усі нотатки →</button></div>
      ${pinned.length ? `<div class="list">${pinned.map(n => `<div class="li"><div class="t"><div style="font-weight:500">${esc(n.title || 'Без заголовка')}</div><div class="small muted clamp" style="-webkit-line-clamp:2">${esc(n.body)}</div></div></div>`).join('')}</div>`
      : `<p class="muted small" style="margin:0">Закріпіть важливу нотатку значком 📌, і вона з’явиться тут.</p>`}
    </section>
  </div>`;
};
