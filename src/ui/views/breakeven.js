import { Calc } from '../../core/calc.js';
import { esc, fmtMoney, fmtPct, isNum, plural } from '../../core/utils.js';
import { D, VIEWS } from '../shared.js';

/* ---------- 7. Беззбитковість ---------- */
VIEWS.breakeven = () => {
  const d = D(); const be = d.settings.breakeven; const r = Calc.breakeven(be);
  const touched = Object.values(be).some(v => String(v).trim() !== '' && v !== '26');
  const margins = d.products.map(p => Calc.margin(Calc.unitCost(p), p.retailPrice)).filter(isNum);
  const avgMargin = margins.length ? margins.reduce((a, x) => a + x, 0) / margins.length : null;
  const fld = (key, label, hint, ph) => `<label class="field"><span class="lbl">${label}</span><input class="input num ${touched && r.errors && r.errors[key] ? 'bad' : ''}" id="be-${key}" data-be="${key}" inputmode="decimal" placeholder="${ph}" value="${esc(be[key])}">${touched && r.errors && r.errors[key] ? `<span class="err">${r.errors[key]}</span>` : ''}<span class="hint">${hint}</span></label>`;
  let result;
  if (r.ok) result = `<div class="be-result">
      <div class="tile accent"><span class="k">Виручка на місяць</span><span class="v">${fmtMoney(r.monthly)}</span></div>
      <div class="tile"><span class="k">Виручка на день</span><span class="v">${fmtMoney(r.daily)}</span><span class="s">${r.D} ${plural(r.D, 'робочий день', 'робочі дні', 'робочих днів')}</span></div>
      <div class="tile"><span class="k">Покупок на день</span><span class="v">${r.purchases}</span><span class="s">при чеку ${fmtMoney(r.A)}, округлено вгору</span></div></div>
    <div class="formula"><span><b>Виручка беззбитковості</b> = постійні витрати ÷ (частка валової маржі − частка додаткових змінних витрат)</span>
      <span>${fmtMoney(r.F)} ÷ (${(r.m / 100).toFixed(3).replace('.', ',')} − ${(r.v / 100).toFixed(3).replace('.', ',')}) = ${fmtMoney(r.F)} ÷ ${r.share.toFixed(3).replace('.', ',')} = ${fmtMoney(r.monthly)}</span>
      <span>На день: ${fmtMoney(r.monthly)} ÷ ${r.D} = ${fmtMoney(r.daily)}. Покупок: ${fmtMoney(r.daily)} ÷ ${fmtMoney(r.A)} = ${(r.daily / r.A).toFixed(2).replace('.', ',')} → ${r.purchases}.</span></div>
    <p class="small muted" style="margin:0">Це мінімум, за якого магазин не працює в мінус. Прибуток починається з виручки, вищої за цю.</p>`;
  else if (r.general) result = `<div class="callout bad">${r.general}</div>`;
  else result = `<div class="callout info">Заповніть усі поля ліворуч${touched ? ' і виправте позначені помилки' : ''}, і тут з’явиться результат.</div>`;
  return `
  <div class="page-head"><div><h1>Калькулятор беззбитковості</h1><p>Скільки треба продавати, щоб покрити щомісячні витрати.</p></div></div>
  <div class="grid-2">
    <section class="panel" style="display:flex;flex-direction:column;gap:14px">
      ${fld('fixed', 'Постійні витрати на місяць, ₴', 'Те, що платите щомісяця незалежно від продажів: оренда, зарплата, комунальні, зв’язок, бухгалтер, фіксований податок ФОП. Закупівлю товару сюди не додавайте: її вже враховує маржа.', '35000')}
      ${fld('margin', 'Валова маржа, %', `Яка частка ціни продажу лишається після собівартості товару. Купили за 60 ₴, продали за 100 ₴: маржа 40%.${isNum(avgMargin) ? ` Середня маржа ваших товарів: <button type="button" class="btn sm ghost" style="padding:0 4px" data-act="use-margin" data-v="${avgMargin.toFixed(1)}">${fmtPct(avgMargin)}, підставити</button>` : ''}`, '45')}
      ${fld('extra', 'Додаткові змінні витрати, % від виручки', 'Витрати, що ростуть разом із продажами: комісія за оплату карткою, податок у відсотках від доходу. Не повторюйте те, що вже є в постійних витратах чи собівартості. Якщо таких немає, вкажіть 0.', '3')}
      ${fld('avgCheck', 'Середній чек, ₴', 'Скільки в середньому платить один покупець за одну покупку.', '400')}
      ${fld('days', 'Робочих днів на місяць', 'Скільки днів на місяць магазин відчинений.', '26')}
      <div class="row"><button class="btn" data-act="be-clear">Очистити поля</button></div>
    </section>
    <section class="panel" style="display:flex;flex-direction:column;gap:14px"><h2>Результат</h2>${result}</section>
  </div>`;
};
