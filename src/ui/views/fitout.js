import { FITOUT_STATUSES, fitoutCategories, fitoutLink, fitoutSummary } from '../../core/opening.js';
import { Repo } from '../../core/repo.js';
import { daysFromToday, esc, fmtDate, fmtMoney, fmtNum, isNum, plural } from '../../core/utils.js';
import { D, UI, VIEWS, emptyState, ext, prioPill } from '../shared.js';

/* ---------- Облаштування приміщення ---------- */
const PILL = { undecided: 'warn', chosen: 'info', ordered: 'accent', received: 'ok', installed: 'ok' };
const statusPill = s => `<span class="pill ${PILL[s]}">${FITOUT_STATUSES[s]}</span>`;

/** Рядок про зв'язок із бюджетом: сплачене завжди береться з пов'язаної статті. */
export function fitoutBudgetLine(d, it) {
  const st = fitoutLink(d, it);
  if (st.state === 'none') return `<div class="row small">${isNum(it.planned) ? '' : '<span class="muted">Немає планової суми.</span>'}<button class="btn sm" data-act="fitout-budget" data-id="${it.id}">Внести в бюджет</button></div>`;
  if (st.state === 'missing') return `<div class="small"><span class="pill bad">Статтю бюджету видалено</span> <button class="btn sm" data-act="fitout-budget" data-id="${it.id}">Створити або знайти знову</button> <button class="btn sm ghost" data-act="edit-fitout" data-id="${it.id}">Прив’язати іншу</button></div>`;
  const e = st.expense; const shared = d.fitout.filter(x => x.expenseId === e.id).length;
  return `<div class="small">У бюджеті: «${esc(e.name)}» · сплачено <b>${fmtMoney(e.paid ?? 0)}</b> з ${fmtMoney(e.planned ?? 0)}${shared > 1 ? ` <span class="muted">(спільна стаття для ${shared} позицій)</span>` : ''}
    ${st.state === 'mismatch' && shared === 1 ? `<div style="margin-top:4px"><span class="pill warn">Розбіжність: позиція ${fmtMoney(st.amount)}, бюджет ${fmtMoney(st.planned)}</span> <button class="btn sm" data-act="fitout-sync" data-id="${it.id}">Узгодити</button></div>` : ''}</div>`;
}

function card(d, it) {
  const late = it.deadline && daysFromToday(it.deadline) < 0 && it.status !== 'installed' && it.status !== 'received';
  const task = it.taskId && Repo.get('tasks', it.taskId);
  return `<article class="card click" data-act="edit-fitout" data-id="${it.id}" tabindex="0" role="button" aria-label="Відкрити ${esc(it.name)}">
    <div class="card-top"><h3>${esc(it.name)}</h3>${statusPill(it.status)}</div>
    <div class="small muted">${[isNum(it.qty) && `${fmtNum(it.qty)} шт`, it.size, it.vendor].filter(Boolean).map(esc).join(' · ') || 'Деталі не вказані'}</div>
    ${it.url ? `<div class="small">${ext(it.url)}</div>` : ''}
    <div class="row small" style="gap:6px">${prioPill(it.priority)}${it.deadline ? `<span class="pill ${late ? 'bad' : ''}">${late ? 'Прострочено · ' : 'до '}${fmtDate(it.deadline)}</span>` : ''}<b class="num" style="margin-left:auto">${isNum(it.planned) ? fmtMoney(it.planned) : '—'}</b></div>
    ${fitoutBudgetLine(d, it)}
    <div class="small">${task ? `Завдання: <button class="btn link" data-act="edit-task" data-id="${task.id}">${esc(task.title)}</button>${task.status === 'done' ? ' ✓' : ''}` : `<button class="btn sm ghost" data-act="fitout-task" data-id="${it.id}">+ Створити завдання</button>`}</div>
    ${it.comment ? `<div class="small muted clamp" style="-webkit-line-clamp:2">${esc(it.comment)}</div>` : ''}
  </article>`;
}

VIEWS.fitout = () => {
  const d = D(); const cats = fitoutCategories(d); const s = fitoutSummary(d);
  const head = `<div class="page-head"><div><h1>Облаштування</h1><p>Що потрібно для приміщення: ремонт, світло, меблі, вивіска, обладнання.</p></div><div class="row"><button class="btn" data-act="fitout-cats">Категорії</button><button class="btn primary hide-m" data-act="add-fitout">+ Позиція</button></div></div>`;
  if (!d.fitout.length) return head + emptyState('Складіть список того, що потрібно купити чи зробити в приміщенні. Для кожної позиції можна вказати суму, термін і продавця.', 'add-fitout', 'Додати першу позицію')
    + `<p class="small muted">Стандартні категорії: ${cats.map(c => esc(c.name)).join(', ')}.</p>`;
  if (UI.f.fitCat && !cats.some(c => c.id === UI.f.fitCat)) UI.f.fitCat = '';
  const list = d.fitout.filter(i => (!UI.f.fitCat || i.category === UI.f.fitCat) && (!UI.f.fitStatus || i.status === UI.f.fitStatus));
  const chip = (act, v, label, n, on) => `<button class="chip ${on ? 'on' : ''} ${n ? '' : 'zero'}" data-act="${act}" data-v="${esc(v)}">${esc(label)} <span class="muted">${n}</span></button>`;
  const groups = cats.map(c => ({ c, items: list.filter(i => i.category === c.id) })).filter(g => g.items.length);
  const orphan = list.filter(i => !cats.some(c => c.id === i.category));
  if (orphan.length) groups.push({ c: { name: 'Інше' }, items: orphan });
  return head + `
  <section class="tiles">
    <div class="tile"><span class="k">Позицій</span><span class="v">${s.count}</span><span class="s">отримано або встановлено: ${s.done}</span></div>
    <div class="tile"><span class="k">Заплановано</span><span class="v">${fmtMoney(s.planned)}</span><span class="s">${s.noPrice ? `${s.noPrice} без суми` : 'усі з сумою'}</span></div>
    <div class="tile"><span class="k">Сплачено (з бюджету)</span><span class="v">${fmtMoney(s.paid)}</span><span class="s">${s.notInBudget ? `${s.notInBudget} ${plural(s.notInBudget, 'позиція', 'позиції', 'позицій')} не в бюджеті` : 'усе пов’язано з бюджетом'}</span></div>
  </section>
  <div class="chips sec-chips" role="group" aria-label="Статус">${chip('fit-status', '', 'Усі', d.fitout.length, !UI.f.fitStatus)}${Object.entries(FITOUT_STATUSES).map(([k, v]) => chip('fit-status', k, v, s.byStatus[k], UI.f.fitStatus === k)).join('')}</div>
  <div class="chips sec-chips sub" role="group" aria-label="Категорія">${chip('fit-cat', '', 'Усі категорії', d.fitout.length, !UI.f.fitCat)}${cats.map(c => chip('fit-cat', c.id, c.name, d.fitout.filter(i => i.category === c.id).length, UI.f.fitCat === c.id)).join('')}</div>
  ${groups.length ? groups.map(g => `<h2 class="sec-h">${esc(g.c.name)} <span class="muted">${g.items.length}</span></h2><div class="grid-cards">${g.items.map(i => card(d, i)).join('')}</div>`).join('') : '<p class="muted">Нічого не знайдено за цими умовами.</p>'}
  <details class="explain"><summary>Як рахується</summary><div class="formula"><span><b>Заплановано</b> = сума планових сум позицій.</span><span><b>Сплачено</b> береться з пов’язаних статей бюджету. Кожна стаття рахується один раз, навіть якщо до неї прив’язано кілька позицій. Окремо оплату тут не записуйте, щоб гроші не рахувались двічі.</span></div></details>`;
};
