import { criticalTasks, openingReadiness, prepProgress } from '../../core/opening.js';
import { esc, fmtDate, plural } from '../../core/utils.js';
import { D, VIEWS, deadlineLabel, prioPill, taskSort } from '../shared.js';

/* ---------- Відкриття → План відкриття: дата, завдання підготовки, критичні справи ---------- */
const taskRow = t => `<div class="li"><button class="tick ${t.status === 'done' ? 'on' : ''}" data-act="task-done" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Виконано' : 'Позначити виконаним'}">✓</button><button class="li-btn" data-act="edit-task" data-id="${t.id}"><span class="nm">${esc(t.title)}</span><div class="row small" style="gap:6px;margin-top:2px">${t.deadline ? deadlineLabel(t) : '<span class="muted">без терміну</span>'}${t.priority === 'high' ? prioPill(t.priority) : ''}</div></button></div>`;

VIEWS.opening = () => {
  const d = D(); const r = openingReadiness(d); const p = prepProgress(d);
  const prep = d.tasks.filter(t => t.prep);
  const open = prep.filter(t => t.status !== 'done').sort(taskSort);
  const done = prep.length - open.length;
  // критичні, які ще не показані серед завдань підготовки
  const crit = criticalTasks(d).filter(t => !t.prep);
  // перешкоди без завдань: вони вже є у списках нижче
  const blockers = r.blockers.filter(b => !b.ref || b.ref.collection !== 'tasks');
  const ref = b => b.ref ? `<button class="btn link" style="text-align:left;white-space:normal" data-act="open-ref" data-col="${b.ref.collection}" data-id="${b.ref.id}">${esc(b.text)}</button>` : `<span>${esc(b.text)}</span>`;
  return `
  <div class="page-head"><p>Дата відкриття, завдання підготовки й те, що може завадити.</p><button class="btn primary hide-m" data-act="add-prep-task">+ Завдання підготовки</button></div>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h2>Дата відкриття</h2><button class="btn sm" data-act="opening-date">${r.openingDate ? 'Змінити' : 'Задати дату'}</button></div>
      ${r.openingDate ? `<div class="big-date serif">${fmtDate(r.openingDate)}</div><div class="small muted">${r.daysLeft > 0 ? `через ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}` : r.daysLeft === 0 ? 'сьогодні' : `минула ${-r.daysLeft} ${plural(-r.daysLeft, 'день', 'дні', 'днів')} тому`}</div>` : '<p class="small muted" style="margin:0">Дату ще не задано. Вона потрібна, щоб бачити, що встигає до відкриття.</p>'}
      ${p.total ? `<div class="row small" style="justify-content:space-between;margin-top:16px"><span>Завдання підготовки: ${p.done} з ${p.total}</span><b class="num">${p.pct}%</b></div><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Виконано завдань підготовки"><i style="width:${p.pct}%"></i></div><p class="progress-note">Прогрес рахується лише за завданнями з позначкою «підготовка». Це орієнтир, а не гарантія.</p>` : ''}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Що може завадити</h2></div>
      ${blockers.length ? `<ul class="hint-list">${blockers.map(b => `<li><i class="dot ${b.level === 'bad' ? 'bad' : 'warn'}"></i>${ref(b)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">У записах перешкод не знайдено.</p>'}
    </section>
  </div>
  <section class="panel">
    <div class="panel-head"><h2>Завдання підготовки${open.length ? ` <span class="cnt">${open.length}</span>` : ''}</h2>${done ? `<span class="small muted">виконано: ${done}</span>` : ''}</div>
    ${open.length ? `<div class="list">${open.map(taskRow).join('')}</div>` : `<div class="empty mini"><p>${prep.length ? 'Усі завдання підготовки виконано.' : 'Додайте завдання підготовки або позначте наявні завдання як «підготовка до відкриття» у їхній формі.'}</p><button class="btn sm primary" data-act="add-prep-task">Додати завдання</button></div>`}
  </section>
  ${crit.length ? `<section class="panel"><div class="panel-head"><h2>Інші критичні справи <span class="cnt">${crit.length}</span></h2><button class="btn sm ghost" data-nav="planner">Усі завдання →</button></div><div class="list">${crit.slice(0, 8).map(taskRow).join('')}</div></section>` : ''}`;
};
