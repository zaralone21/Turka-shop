import { Calc } from '../../core/calc.js';
import { expenseOrigins, monthlySummary } from '../../core/opening.js';
import { esc, fmtMoney, fmtNum } from '../../core/utils.js';
import { D, VIEWS, emptyState, moreMenu } from '../shared.js';
import { svg } from '../shell.js';

/* ---------- 6. Бюджет ---------- */
/** Кругова діаграма: частка кожної категорії в потрібній на відкриття сумі. */
function donut(d, b, cats) {
  const rows = cats.map(c => ({ name: c.name, v: b.byCat[c.id] ? b.byCat[c.id].needed : 0 })).filter(x => x.v > 0).sort((x, y) => y.v - x.v);
  const total = rows.reduce((s, x) => s + x.v, 0); if (!total) return '';
  const top = rows.slice(0, 5); const rest = rows.slice(5).reduce((s, x) => s + x.v, 0); if (rest) top.push({ name: 'Інше', v: rest });
  const R = 40, C = 2 * Math.PI * R; let off = 0;
  const arcs = top.map((x, i) => { const len = x.v / total * C; const a = `<circle class="seg-arc" r="${R}" cx="50" cy="50" stroke="var(--chart-${i + 1})" stroke-dasharray="${Math.max(len - 1.2, .1).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"></circle>`; off += len; return a; }).join('');
  return `<section class="panel"><div class="panel-head"><h2>Витрати по категоріях</h2><span class="small muted">потрібно на відкриття</span></div>
    <div class="donut-wrap"><svg class="donut" viewBox="0 0 100 100" role="img" aria-label="Розподіл витрат по категоріях"><circle r="${R}" cx="50" cy="50" stroke="var(--surface-2)"></circle>${arcs}</svg>
    <ul class="legend">${top.map((x, i) => `<li><i style="background:var(--chart-${i + 1})"></i><span>${esc(x.name)}</span><b>${Math.round(x.v / total * 100)}%</b></li>`).join('')}</ul></div></section>`;
}
VIEWS.budget = () => {
  const d = D(); const b = Calc.budget(d); const cats = d.settings.budgetCategories;
  const freeTile = b.total === null ? `<div class="tile"><span class="k">Вільний бюджет</span><span class="v">—</span><span class="s">задайте загальний бюджет</span></div>`
    : b.free >= 0 ? `<div class="tile good"><span class="k">Вільний бюджет</span><span class="v">${fmtMoney(b.free)}</span><span class="s">бюджет − потрібна сума</span></div>`
    : `<div class="tile bad"><span class="k">Перевищення бюджету</span><span class="v">${fmtMoney(-b.free)}</span><span class="s">потрібно більше, ніж закладено</span></div>`;
  let table = '';
  if (d.expenses.length) {
    const rows = cats.filter(c => b.byCat[c.id]).map(c => {
      const items = d.expenses.filter(e => e.categoryId === c.id); const s = b.byCat[c.id];
      return `<tr class="group"><td class="first" colspan="2">${esc(c.name)}${c.refundable ? ' <span class="pill info">повертається</span>' : ''}</td><td class="r" data-label="Заплановано">${fmtMoney(s.planned)}</td><td class="r" data-label="Сплачено">${fmtMoney(s.paid)}</td><td class="r" data-label="Сплатити">${fmtMoney(s.toPay)}</td><td></td></tr>` +
        items.map(e => { const over = (e.paid || 0) > (e.planned || 0);
          const from = expenseOrigins(d, e);
          return `<tr><td class="first" data-label="Назва">${esc(e.name)}${e.comment ? `<div class="small muted">${esc(e.comment)}</div>` : ''}${from.map(x => `<div class="small"><button class="btn link" data-act="open-ref" data-col="${x.collection}" data-id="${x.id}">↗ ${esc(x.label)}</button></div>`).join('')}</td><td data-label="Статус">${(e.paid || 0) >= (e.planned || 0) && (e.paid || 0) > 0 ? '<span class="pill ok">Сплачено</span>' : (e.paid || 0) > 0 ? '<span class="pill warn">Частково</span>' : '<span class="pill">Не сплачено</span>'}</td>
          <td class="r" data-label="Заплановано">${fmtMoney(e.planned ?? 0)}</td><td class="r" data-label="Сплачено">${fmtMoney(e.paid ?? 0)}${over ? `<div class="small" style="color:var(--danger)">+${fmtMoney(e.paid - (e.planned || 0))} понад план</div>` : ''}</td><td class="r" data-label="Сплатити">${fmtMoney(Math.max((e.planned || 0) - (e.paid || 0), 0))}</td>
          <td class="acts"><button class="btn sm" data-act="edit-expense" data-id="${e.id}">Змінити</button> <button class="btn sm danger" data-act="del-expense" data-id="${e.id}" aria-label="Видалити">✕</button></td></tr>`; }).join('');
    }).join('');
    const mobile = `<div class="m-list only-m">${cats.filter(c => b.byCat[c.id]).map(c => { const s = b.byCat[c.id];
      return `<div class="m-group"><span>${esc(c.name)}</span><span class="num">${fmtMoney(s.needed)}</span></div>` + d.expenses.filter(e => e.categoryId === c.id).map(e => {
        const p = e.planned || 0, f = e.paid || 0;
        return `<button class="m-item" data-act="edit-expense" data-id="${e.id}"><div class="m-row"><b>${esc(e.name)}</b><span class="num">${fmtMoney(Math.max(p, f))}</span></div>
          <div class="m-metrics"><span>План <b>${fmtMoney(p)}</b></span><span>Сплачено <b>${fmtMoney(f)}</b></span>${f >= p && f > 0 ? '<span class="pill ok">Сплачено</span>' : f > 0 ? '<span class="pill warn">Частково</span>' : '<span class="pill">Не сплачено</span>'}</div>${e.comment ? `<div class="m-sub">${esc(e.comment)}</div>` : ''}</button>`; }).join(''); }).join('')}
      <div class="m-group"><span>Разом потрібно</span><span class="num">${fmtMoney(b.needed)}</span></div></div>`;
    table = mobile + `<div class="table-wrap hide-m"><table class="t stack"><thead><tr><th>Стаття</th><th>Статус</th><th class="r">Заплановано</th><th class="r">Сплачено</th><th class="r">Залишилось сплатити</th><th class="acts"><span class="sr">Дії</span></th></tr></thead><tbody>${rows}
      <tr class="total"><td class="first" colspan="2">Разом</td><td class="r" data-label="Заплановано">${fmtMoney(b.planned)}</td><td class="r" data-label="Сплачено">${fmtMoney(b.paid)}</td><td class="r" data-label="Сплатити">${fmtMoney(b.toPay)}</td><td></td></tr></tbody></table></div>`;
  }
  const pctPaid = b.total ? Math.min(100, Math.round(b.paid / b.total * 100)) : null;
  const free = b.total === null ? ['—', '', 'Залишок'] : b.free >= 0 ? [fmtMoney(b.free), 'good', 'Залишок'] : [fmtMoney(-b.free), 'bad', 'Перевищення'];
  return `
  <div class="page-head"><div><p>Скільки грошей потрібно, щоб відкрити магазин, і скільки вже сплачено.</p></div><div class="row">${moreMenu([['budget-cats', 'Категорії витрат']])}<button class="btn primary hide-m" data-act="add-expense">+ Додати витрату</button></div></div>
  <section class="panel fin-total">
    <div class="big-total"><span class="lead">${svg('budget')}</span><div style="flex:1;min-width:0"><span class="small muted">Загальний бюджет відкриття</span><div class="v">${b.total === null ? 'Не задано' : fmtMoney(b.total)}</div></div></div>
    ${pctPaid !== null ? `<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctPaid}" aria-label="Сплачено від бюджету"><i class="${b.paid > b.total ? 'bad' : ''}" style="width:${pctPaid}%"></i></div><div class="meter-row"><span>Заплановано ${fmtMoney(b.planned)} · потрібно на відкриття ${fmtMoney(b.needed)}${b.deposit.needed ? `, з них депозит ${fmtMoney(b.deposit.needed)}` : ''}</span><span class="num">${pctPaid}%</span></div>` : ''}
    <details class="budget-edit" ${b.total === null ? 'open' : ''}><summary class="btn sm soft">${b.total === null ? 'Задати бюджет' : 'Змінити бюджет'}</summary>
    <form class="row" data-form="total-budget" style="align-items:flex-end;margin-top:10px">
    <label class="field" style="flex:1 1 220px"><span class="lbl">Загальний бюджет на відкриття, ₴</span><input class="input num" id="total-budget" name="total" inputmode="decimal" placeholder="Наприклад, 400000" value="${b.total === null ? '' : esc(fmtNum(b.total))}"><span class="hint">Сума, яку ви готові вкласти. Задаєте самостійно.</span></label>
    <button class="btn primary" type="submit">Зберегти бюджет</button></form></details></section>
  <section class="stat-cards tiles">
    <div class="tile"><span class="k">Сплачено</span><span class="v">${fmtMoney(b.paid)}</span></div>
    <div class="tile"><span class="k">Ще потрібно</span><span class="v">${fmtMoney(b.toPay)}</span></div>
    <div class="tile ${free[1]}"><span class="k">${free[2]}</span><span class="v">${free[0]}</span></div>
  </section>
  ${donut(d, b, cats)}
  ${(() => { const m = monthlySummary(d); return `<div class="callout info row" style="justify-content:space-between"><span>Щомісячні витрати після відкриття: <b>${fmtMoney(m.total)}</b> на місяць. Вони рахуються окремо й у бюджет відкриття не входять.</span><button class="btn sm" data-nav="monthly">Переглянути</button></div>`; })()}
  <details class="explain"><summary>Як рахується бюджет</summary><div class="formula"><span><b>Потрібно на відкриття</b> = сплачено + залишилося сплатити за планом. Якщо за статтею сплатили більше, ніж планували, враховується фактична сума, а не обидві. Так жодна витрата не рахується двічі.</span>
    <span><b>Поворотний депозит</b> (${fmtMoney(b.deposit.needed)}) входить у потрібну суму, бо гроші треба мати на руках, але показаний окремо: його повернуть. Безповоротні витрати: ${fmtMoney(b.nonRefundable)}.</span>
    ${b.overPlan > 0 ? `<span><b>Сплачено понад план:</b> ${fmtMoney(b.overPlan)}.</span>` : ''}</div></details>
  ${d.expenses.length ? `<h2 class="month-h">Статті витрат <span class="small muted">${d.expenses.length}</span></h2>` + table : emptyState('Додайте статті витрат: оренду, депозит, ремонт, меблі, першу закупівлю тощо.', 'add-expense', 'Додати першу витрату')}`;
};
