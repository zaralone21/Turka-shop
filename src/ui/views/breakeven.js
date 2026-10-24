import { Calc } from '../../core/calc.js';
import { monthlySummary, simpleAvgMargin, weightedMargin } from '../../core/opening.js';
import { esc, fmtMoney, fmtNum, fmtPct, isNum, parseNum, plural } from '../../core/utils.js';
import { D, VIEWS } from '../shared.js';

/* ---------- 7. Беззбитковість ---------- */
VIEWS.breakeven = () => {
  const d = D(); const be = d.settings.breakeven; const r = Calc.breakeven(be);
  const touched = ['fixed', 'margin', 'extra', 'avgCheck', 'days'].some(k => String(be[k] ?? '').trim() !== '' && be[k] !== '26');
  const avg = simpleAvgMargin(d.products);
  const planRaw = be.salesPlan || {};
  const plan = Object.fromEntries(Object.entries(planRaw).map(([id, v]) => [id, parseNum(v)]).filter(([, v]) => isNum(v) && v > 0));
  const wm = weightedMargin(d.products, plan);
  const ms = monthlySummary(d);
  const fld = (key, label, hint, ph) => `<label class="field"><span class="lbl">${label}</span><input class="input num ${touched && r.errors && r.errors[key] ? 'bad' : ''}" id="be-${key}" data-be="${key}" inputmode="decimal" placeholder="${ph}" value="${esc(be[key])}">${touched && r.errors && r.errors[key] ? `<span class="err">${r.errors[key]}</span>` : ''}<span class="hint">${hint}</span></label>`;
  let result;
  if (r.ok) result = `<div class="be-result">
      <div class="tile accent"><span class="k">Виручка на місяць</span><span class="v">${fmtMoney(r.monthly)}</span></div>
      <div class="tile"><span class="k">Виручка на день</span><span class="v">${fmtMoney(r.daily)}</span><span class="s">${r.D} ${plural(r.D, 'робочий день', 'робочі дні', 'робочих днів')}</span></div>
      <div class="tile"><span class="k">Покупок на день</span><span class="v">${r.purchases}</span><span class="s">при чеку ${fmtMoney(r.A)}, округлено вгору</span></div></div>
    <details class="explain"><summary>Як рахується</summary><div class="formula"><span><b>Виручка беззбитковості</b> = постійні витрати ÷ (частка валової маржі − частка додаткових змінних витрат)</span>
      <span>${fmtMoney(r.F)} ÷ (${(r.m / 100).toFixed(3).replace('.', ',')} − ${(r.v / 100).toFixed(3).replace('.', ',')}) = ${fmtMoney(r.F)} ÷ ${r.share.toFixed(3).replace('.', ',')} = ${fmtMoney(r.monthly)}</span>
      <span>На день: ${fmtMoney(r.monthly)} ÷ ${r.D} = ${fmtMoney(r.daily)}. Покупок: ${fmtMoney(r.daily)} ÷ ${fmtMoney(r.A)} = ${(r.daily / r.A).toFixed(2).replace('.', ',')} → ${r.purchases}.</span></div></details>
    <p class="small muted" style="margin:0">Це мінімум, за якого магазин не працює в мінус. Прибуток починається з виручки, вищої за цю.</p>`;
  else if (r.general) result = `<div class="callout bad">${r.general}</div>`;
  else result = `<div class="callout info">Заповніть усі поля ліворуч${touched ? ' і виправте позначені помилки' : ''}, і тут з’явиться результат.</div>`;
  return `
  <div class="page-head"><div><h1>Калькулятор беззбитковості</h1><p>Скільки треба продавати, щоб покрити щомісячні витрати.</p></div></div>
  <div class="grid-2">
    <section class="panel" style="display:flex;flex-direction:column;gap:14px">
      ${fld('fixed', 'Постійні витрати на місяць, ₴', `Те, що платите щомісяця незалежно від продажів: оренда, зарплата, комунальні, зв’язок, бухгалтер, фіксований податок ФОП. Закупівлю товару сюди не додавайте: її вже враховує маржа.${ms.total > 0 ? ` <button type="button" class="btn sm ghost" style="padding:0 4px" data-act="monthly-to-be">Підставити щомісячні витрати: ${fmtMoney(ms.total)}</button>` : ' <button type="button" class="btn link" data-nav="monthly">Заповнити щомісячні витрати</button>'}`, '35000')}
      ${fld('margin', 'Валова маржа, %', `Яка частка ціни продажу лишається після собівартості товару. Купили за 60 ₴, продали за 100 ₴: маржа 40%.${isNum(wm.margin) ? ` Маржа за вашим планом продажів: <button type="button" class="btn sm ghost" style="padding:0 4px" data-act="use-margin" data-v="${wm.margin.toFixed(1)}">${fmtPct(wm.margin)}, підставити</button>` : ''}${avg ? ` Просте середнє по ${avg.count} ${plural(avg.count, 'товару', 'товарах', 'товарах')}: ${fmtPct(avg.margin)} <span class="muted">(довідково, без урахування структури продажів)</span> <button type="button" class="btn sm ghost" style="padding:0 4px" data-act="use-margin" data-v="${avg.margin.toFixed(1)}">підставити</button>` : ''}`, '45')}
      ${fld('extra', 'Додаткові змінні витрати, % від виручки', 'Витрати, що ростуть разом із продажами: комісія за оплату карткою, податок у відсотках від доходу. Не повторюйте те, що вже є в постійних витратах чи собівартості. Якщо таких немає, вкажіть 0.', '3')}
      ${fld('avgCheck', 'Середній чек, ₴', 'Скільки в середньому платить один покупець за одну покупку.', '400')}
      ${fld('days', 'Робочих днів на місяць', 'Скільки днів на місяць магазин відчинений.', '26')}
      <div class="row"><button class="btn" data-act="be-clear">Очистити поля</button></div>
    </section>
    <section class="panel" style="display:flex;flex-direction:column;gap:14px"><h2>Результат</h2>${result}</section>
  </div>
  ${salesPlanPanel(d, planRaw, wm)}`;
};

/** План продажів на місяць по товарах → зважена маржа. Нічого не підставляється без натискання. */
function salesPlanPanel(d, planRaw, wm) {
  const priced = d.products.filter(p => isNum(Calc.unitCost(p)) && isNum(p.retailPrice) && p.retailPrice > 0);
  const filled = Object.keys(planRaw).filter(k => String(planRaw[k]).trim() !== '').length;
  const rows = d.products.map(p => { const c = Calc.unitCost(p); const ok = isNum(c) && isNum(p.retailPrice) && p.retailPrice > 0;
    return `<tr><td>${esc(p.name)}${ok ? '' : ' <span class="pill warn">немає ціни</span>'}</td><td class="num hide-m">${ok ? fmtMoney(c) : '—'}</td><td class="num hide-m">${ok ? fmtMoney(p.retailPrice) : '—'}</td>
      <td><input class="input num" style="max-width:90px" id="plan-${p.id}" data-plan="${p.id}" inputmode="decimal" placeholder="0" value="${esc(planRaw[p.id] ?? '')}" aria-label="Продажів на місяць: ${esc(p.name)}"></td></tr>`; }).join('');
  const res = isNum(wm.margin)
    ? `<div class="row" style="gap:10px;align-items:center"><div><div class="small muted">Зважена маржа за планом</div><b style="font-size:1.4rem">${fmtPct(wm.margin)}</b></div><button class="btn sm primary" data-act="use-margin" data-v="${wm.margin.toFixed(1)}">Підставити в калькулятор</button></div>
       <details class="explain"><summary>Як рахується</summary><div class="formula"><span><b>Маржа</b> = (сумарна виручка − сумарна собівартість) ÷ сумарна виручка × 100%</span><span>(${fmtMoney(wm.revenue)} − ${fmtMoney(wm.cost)}) ÷ ${fmtMoney(wm.revenue)} = ${fmtPct(wm.margin)}</span><span>Виручка й собівартість = кількість × роздрібна ціна та кількість × ціна одиниці, по кожному товару з плану (${wm.lines.length}).</span></div></details>`
    : '<p class="small muted" style="margin:0">Вкажіть, скільки штук кожного товару плануєте продавати на місяць. Тоді маржа врахує, що одних товарів продається більше, ніж інших.</p>';
  const skipped = wm.skipped.length ? `<div class="callout warn small">Не враховано, бо немає ціни закупівлі чи роздрібу: ${wm.skipped.map(x => esc(x.name)).join(', ')}.</div>` : '';
  return `<details class="panel plan-box" ${filled ? 'open' : ''}><summary><h2 style="display:inline">План продажів і зважена маржа</h2> <span class="small muted">${filled ? `заповнено ${filled}` : 'необов’язково'}</span></summary>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">${res}${skipped}
    ${d.products.length ? `<div class="table-wrap"><table class="plan-table"><thead><tr><th>Товар</th><th class="num hide-m">Ціна од.</th><th class="num hide-m">Роздріб</th><th>Шт/міс</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="small muted">Спочатку додайте товари з цінами.</p>'}
    ${priced.length < d.products.length ? `<p class="small muted" style="margin:0">Товари без цін можна доповнити в розділі <button class="btn link" data-nav="products">Товари та ціни</button>.</p>` : ''}
    <p class="small muted" style="margin:0">Це план, а не прогноз. Без плану вказуйте маржу вручну.</p></div></details>`;
}
