import { Calc } from '../../core/calc.js';
import { criticalTasks, openingReadiness, prepProgress } from '../../core/opening.js';
import { cottonLogo } from '../brand.js';
import { svg } from '../shell.js';
import { esc, fmtDate, fmtMoney, plural } from '../../core/utils.js';
import { D, VIEWS, deadlineLabel, prioPill, taskSort } from '../shared.js';

/* ---------- Відкриття → План відкриття: дата, завдання підготовки, критичні справи ---------- */
const taskRow = t => `<div class="trow li"><button class="tick ${t.status === 'done' ? 'on' : ''}" data-act="task-done" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Виконано' : 'Позначити виконаним'}">✓</button><div class="mn"><button class="ttl" data-act="edit-task" data-id="${t.id}">${esc(t.title)}</button><div class="meta">${t.deadline ? deadlineLabel(t) : '<span class="muted">без терміну</span>'}${t.priority === 'high' ? prioPill(t.priority) : ''}</div></div></div>`;

/** Етапи відкриття з наявних записів (лише відображення, розрахунки не змінюються). */
function stages(d, p) {
  const pr = d.premises[0] ? openingReadiness(d).premises : null; const b = Calc.budget(d);
  const fit = d.fitout.length, fitDone = d.fitout.filter(i => i.status === 'installed' || i.status === 'received').length;
  const pur = d.purchases.filter(x => x.status !== 'cancelled'), purDone = pur.filter(x => x.status === 'received').length;
  const st = (done, started) => done ? 'done' : started ? 'doing' : 'todo';
  const pct = (a, n) => n ? Math.round(a / n * 100) : null;
  return [
    { nav: 'premises', name: 'Пошук і оренда приміщення', state: !pr ? 'todo' : pr.leaseConfirmed ? 'done' : 'doing', sub: pr ? `${pr.title} · ${pr.status}` : 'Приміщення ще не записане' },
    { nav: 'fitout', name: 'Ремонт і облаштування', state: st(fit && fitDone === fit, fitDone > 0 || d.fitout.some(i => i.status !== 'undecided')), pct: pct(fitDone, fit), sub: fit ? `Готово ${fitDone} з ${fit}` : 'Позицій ще немає' },
    { nav: 'budget', name: 'Бюджет відкриття', state: st(b.needed > 0 && b.toPay <= 0, b.paid > 0), pct: b.needed ? Math.min(100, Math.round(b.paid / b.needed * 100)) : null, sub: b.needed ? `Сплачено ${fmtMoney(b.paid)} з ${fmtMoney(b.needed)}` : 'Статей витрат ще немає' },
    { nav: 'purchases', name: 'Закупівля товару', state: st(pur.length && purDone === pur.length, pur.some(x => x.status !== 'planned')), pct: pct(purDone, pur.length), sub: pur.length ? `Отримано ${purDone} з ${pur.length}` : 'Закупівель ще немає' },
    { nav: 'planner', name: 'Завдання підготовки', state: st(p.total && p.done === p.total, p.done > 0), pct: p.pct, sub: p.total ? `Виконано ${p.done} з ${p.total}` : 'Позначте завдання як «підготовка»' },
  ];
}
const STATE = { done: ['ok', 'Завершено', 'check'], doing: ['warn', 'В процесі', 'dot'], todo: ['', 'Очікує', 'dot'] };


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
  const when = r.openingDate ? `${fmtDate(r.openingDate)} · ${r.daysLeft > 0 ? `через ${r.daysLeft} ${plural(r.daysLeft, 'день', 'дні', 'днів')}` : r.daysLeft === 0 ? 'сьогодні' : `минула ${-r.daysLeft} ${plural(-r.daysLeft, 'день', 'дні', 'днів')} тому`}` : 'Дату відкриття ще не задано';
  return `
  <div class="page-head"><p>Етапи, завдання підготовки й те, що може завадити.</p><div class="row"><button class="btn" data-act="opening-date">${r.openingDate ? 'Змінити дату' : 'Задати дату'}</button><button class="btn primary hide-m" data-act="add-prep-task">+ Завдання підготовки</button></div></div>
  <section class="banner-card hero-open" style="cursor:default"><span class="wm" aria-hidden="true">${cottonLogo()}</span>
    <span class="k">Загальний прогрес підготовки</span>
    <span class="big">${p.total ? p.pct + '%' : '—'}</span>
    <span class="s">${p.total ? `Завдання підготовки: ${p.done} з ${p.total}` : 'Прогрес рахується за завданнями з позначкою «підготовка»'} · відкриття ${esc(when)}</span>
    ${p.total ? `<span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="Виконано завдань підготовки"><i style="width:${p.pct}%"></i></span>` : ''}
  </section>
  <section class="list-card timeline" aria-label="Етапи відкриття">${stages(d, p).map(x => { const [cls, label, icon] = STATE[x.state];
    return `<button class="tl-item ${x.state}" data-nav="${x.nav}"><span class="tl-dot">${svg(icon)}</span><span class="mn"><span class="nm">${esc(x.name)}</span><span class="sub">${esc(x.sub)}</span><span><span class="pill ${cls}">${label}</span></span></span>${x.pct !== null && x.pct !== undefined && x.state !== 'done' ? `<span class="pct">${x.pct}%</span>` : ''}${svg('chev', 'class="chev" style="align-self:center"')}</button>`; }).join('')}</section>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h2>Завдання підготовки${open.length ? ` <span class="cnt">${open.length}</span>` : ''}</h2>${done ? `<span class="small muted">виконано: ${done}</span>` : ''}</div>
      ${open.length ? `<div class="list">${open.map(taskRow).join('')}</div>` : `<div class="empty mini"><p>${prep.length ? 'Усі завдання підготовки виконано.' : 'Додайте завдання підготовки або позначте наявні завдання як «підготовка до відкриття» у їхній формі.'}</p><button class="btn sm primary" data-act="add-prep-task">Додати завдання</button></div>`}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Що може завадити</h2></div>
      ${blockers.length ? `<ul class="hint-list">${blockers.map(b => `<li><i class="dot ${b.level === 'bad' ? 'bad' : 'warn'}"></i>${ref(b)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">У записах перешкод не знайдено.</p>'}
    </section>
  </div>
  ${crit.length ? `<section class="panel"><div class="panel-head"><h2>Інші критичні справи <span class="cnt">${crit.length}</span></h2><button class="btn sm ghost" data-nav="planner">Усі завдання →</button></div><div class="list">${crit.slice(0, 8).map(taskRow).join('')}</div></section>` : ''}`;
};
