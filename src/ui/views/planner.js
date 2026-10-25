import { Schema } from '../../core/schema.js';
import { esc, todayISO } from '../../core/utils.js';
import { svg } from '../shell.js';
import { D, UI, VIEWS, deadlineLabel, emptyState, isOverdue, prioPill, taskSort } from '../shared.js';

/* ---------- 5. Планер: один список із групами за місяцем терміну ---------- */
const monthName = iso => { const s = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso.slice(0, 7) + '-01T00:00:00Z')).replace(' р.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const groupOf = t => t.status === 'done' ? 'Виконані' : isOverdue(t) ? 'Прострочені' : t.deadline ? monthName(t.deadline) : 'Без терміну';

VIEWS.planner = () => {
  const d = D(); const showDone = d.settings.ui.showDoneTasks;
  const done = d.tasks.filter(t => t.status === 'done').length;
  const head = `<div class="page-head"><div><p>${d.tasks.length - done} невиконаних · ${done} виконано</p></div><button class="btn primary hide-m" data-act="add-task">+ Нове завдання</button></div>`;
  if (!d.tasks.length) return head + emptyState('Розбийте підготовку до відкриття на завдання з дедлайнами та чеклістами.', 'add-task', 'Додати перше завдання');
  const base = d.tasks.filter(t => (showDone || t.status !== 'done') && (!UI.f.taskStatus || t.status === UI.f.taskStatus));
  const list = base.filter(t => !UI.f.taskPrio || t.priority === UI.f.taskPrio).sort(taskSort);
  const chip = (v, label) => { const n = v ? base.filter(t => t.priority === v).length : base.length; return `<button class="chip ${UI.f.taskPrio === v ? 'on' : ''}" data-act="task-prio" data-v="${v}" aria-pressed="${UI.f.taskPrio === v}">${label} <span class="muted">${n}</span></button>`; };
  const groups = []; for (const t of list) { const g = groupOf(t); const last = groups[groups.length - 1]; if (last && last.name === g) last.items.push(t); else groups.push({ name: g, items: [t] }); }
  return head + `
  <div class="chips sec-chips" role="group" aria-label="Пріоритет">${chip('', 'Усі')}${Object.entries(Schema.PRIORITIES).map(([k, v]) => chip(k, v)).join('')}</div>
  <div class="toolbar">
    <select class="input" id="f-taskStatus" data-filter="taskStatus" aria-label="Статус"><option value="">Усі статуси</option>${Object.entries(Schema.TASK_STATUSES).map(([k, v]) => `<option value="${k}" ${UI.f.taskStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="check small"><input type="checkbox" id="show-done" data-act="toggle-done" ${showDone ? 'checked' : ''}> Показувати виконані${!showDone && done ? ` (${done})` : ''}</label>
  </div>
  ${list.length ? groups.map(g => `<h2 class="month-h">${esc(g.name)} <span class="small muted">${g.items.length}</span></h2><div class="list-card task-list">${g.items.map(taskCard).join('')}</div>`).join('') : '<div class="empty mini"><p>Немає завдань за цими умовами.</p></div>'}`;
};
const shortDate = iso => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')).replace('.', '');
export function taskCard(t) {
  const dn = t.checklist.filter(i => i.done).length, total = t.checklist.length, isDone = t.status === 'done';
  return `<article class="task trow ${isOverdue(t) ? 'overdue' : ''} ${isDone ? 'done' : ''}">
    <button class="tick ${isDone ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Повернути в роботу' : 'Позначити виконаним'}">✓</button>
    <div class="mn"><button class="ttl" data-act="edit-task" data-id="${t.id}">${esc(t.title)}</button>
      <div class="meta">${prioPill(t.priority)}${t.prep ? '<span class="pill info">підготовка</span>' : ''}${t.status === 'in_progress' ? '<span class="pill accent">У роботі</span>' : ''}${isOverdue(t) ? deadlineLabel(t) : ''}</div>
      ${t.description ? `<div class="small pre task-desc clamp" style="-webkit-line-clamp:2">${esc(t.description)}</div>` : ''}
      ${total ? `<details class="cl-box" data-cl="${t.id}" ${UI.openCl.has(t.id) ? 'open' : ''}><summary><span class="progress"><i style="width:${Math.round(dn / total * 100)}%"></i></span>Чекліст ${dn} з ${total}</summary>
      <div class="cl">${t.checklist.map(i => `<label class="${i.done ? 'dn' : ''}"><input type="checkbox" data-act="cl-toggle" data-id="${t.id}" data-item="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.text)}</span></label>`).join('')}</div></details>` : ''}
    </div>
    <div class="side-r">${t.deadline && !isOverdue(t) ? `<span class="date-chip">${t.deadline === todayISO() ? 'сьогодні' : shortDate(t.deadline)}</span>` : ''}
      <select class="input hide-m task-st" data-act="task-status" data-id="${t.id}" aria-label="Статус завдання">${Object.entries(Schema.TASK_STATUSES).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sm ghost hide-m" data-act="del-task" data-id="${t.id}" aria-label="Видалити">${svg('close')}</button></div>
  </article>`;
}
