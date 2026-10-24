import { Schema } from '../../core/schema.js';
import { esc } from '../../core/utils.js';
import { D, UI, VIEWS, deadlineLabel, emptyState, isOverdue, prioPill, taskSort } from '../shared.js';

/* ---------- 5. Планер ---------- */
VIEWS.planner = () => {
  const d = D(); const showDone = d.settings.ui.showDoneTasks;
  const done = d.tasks.filter(t => t.status === 'done').length;
  const list = d.tasks.filter(t => (showDone || t.status !== 'done') && (!UI.f.taskStatus || t.status === UI.f.taskStatus)).sort(taskSort);
  const head = `<div class="page-head"><div><p>${d.tasks.length - done} невиконаних · ${done} виконано</p></div><button class="btn primary hide-m" data-act="add-task">+ Нове завдання</button></div>`;
  if (!d.tasks.length) return head + emptyState('Розбийте підготовку до відкриття на завдання з дедлайнами та чеклістами.', 'add-task', 'Додати перше завдання');
  return head + `
  <div class="toolbar">
    <select class="input" id="f-taskStatus" data-filter="taskStatus" aria-label="Статус"><option value="">Усі статуси</option>${Object.entries(Schema.TASK_STATUSES).map(([k, v]) => `<option value="${k}" ${UI.f.taskStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="show-done" data-act="toggle-done" ${showDone ? 'checked' : ''}> Показувати виконані${!showDone && done ? ` (приховано ${done})` : ''}</label>
  </div>
  ${list.length ? `<div style="display:flex;flex-direction:column;gap:10px">${list.map(taskCard).join('')}</div>` : '<p class="muted">Немає завдань за цими умовами.</p>'}`;
};
export function taskCard(t) {
  const dn = t.checklist.filter(i => i.done).length, total = t.checklist.length, isDone = t.status === 'done';
  return `<article class="task ${isOverdue(t) ? 'overdue' : ''} ${isDone ? 'done' : ''}">
    <div class="task-main"><button class="tick ${isDone ? 'on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-pressed="${isDone}" aria-label="${isDone ? 'Повернути в роботу' : 'Позначити виконаним'}">✓</button>
      <div class="task-body"><div class="ttl">${esc(t.title)}</div><div class="row small" style="margin-top:4px;gap:6px">${deadlineLabel(t)} ${prioPill(t.priority)}${t.prep ? ' <span class="pill info">підготовка</span>' : ''}${t.status === 'in_progress' ? ' <span class="pill accent">У роботі</span>' : ''}</div></div>
      <div class="task-acts"><select class="input hide-m" style="width:auto" data-act="task-status" data-id="${t.id}" aria-label="Статус завдання">${Object.entries(Schema.TASK_STATUSES).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sm" data-act="edit-task" data-id="${t.id}">Змінити</button><button class="btn sm danger hide-m" data-act="del-task" data-id="${t.id}" aria-label="Видалити">✕</button></div></div>
    ${t.description ? `<div class="small pre muted task-desc">${esc(t.description)}</div>` : ''}
    ${total ? `<div class="row small task-desc"><div class="progress"><i style="width:${Math.round(dn / total * 100)}%"></i></div><span class="muted">${dn} з ${total}</span></div>
    <div class="cl">${t.checklist.map(i => `<label class="${i.done ? 'dn' : ''}"><input type="checkbox" data-act="cl-toggle" data-id="${t.id}" data-item="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.text)}</span></label>`).join('')}</div>` : ''}
  </article>`;
}
