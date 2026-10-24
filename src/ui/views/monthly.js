import { MONTHLY_KINDS, monthlySummary } from '../../core/opening.js';
import { Calc } from '../../core/calc.js';
import { Repo } from '../../core/repo.js';
import { esc, fmtKyiv, fmtMoney, isNum } from '../../core/utils.js';
import { D, VIEWS, emptyState } from '../shared.js';

/* ---------- Щомісячні витрати: окремо від бюджету відкриття ---------- */
VIEWS.monthly = () => {
  const d = D(); const s = monthlySummary(d); const b = Calc.budget(d);
  const head = `<div class="page-head"><div><p>Постійні платежі після відкриття. До бюджету відкриття не входять.</p></div><div class="row"><button class="btn" data-act="monthly-to-be">У беззбитковість</button><button class="btn primary hide-m" data-act="add-monthly">+ Стаття</button></div></div>`;
  const rem = id => id && Repo.get('reminders', id);
  const rentRow = s.rent ? `<div class="li"><div class="t"><button class="li-btn" data-nav="premises"><span class="nm">${esc(s.rent.name)}</span><div class="small muted">${s.rent.payDay ? `${s.rent.payDay}-го числа · ` : ''}${s.rent.confirmed ? 'за договором' : 'договір ще не підписано'}</div></button></div><b class="num">${fmtMoney(s.rent.amount)}</b></div>` : '';
  const rows = s.items.map(m => { const r = rem(m.reminderId);
    return `<div class="li ${m.duplicate ? 'dim' : ''}"><div class="t"><button class="li-btn" data-act="edit-monthly" data-id="${m.id}"><span class="nm">${esc(m.name)}</span><div class="small muted">${[MONTHLY_KINDS[m.kind] !== m.name && MONTHLY_KINDS[m.kind], m.payDay && `${m.payDay}-го числа`, m.comment].filter(Boolean).map(esc).join(' · ')}${m.duplicate ? ' · <span class="pill warn">дублює оренду з приміщення, у суму не входить</span>' : ''}</div></button>
      <div class="row small" style="gap:6px;margin-top:4px"><button class="btn sm ghost" data-act="monthly-reminder" data-id="${m.id}">${r ? 'Нагадування: ' + esc(fmtKyiv(r.fireAt)) : '🔔 Нагадувати'}</button></div></div><b class="num">${isNum(m.amount) ? fmtMoney(m.amount) : '<span class="muted">сума ?</span>'}</b></div>`; }).join('');
  return head + `
  <section class="tiles">
    <div class="tile accent"><span class="k">Щомісячні витрати</span><span class="v">${fmtMoney(s.total)}</span><span class="s">${s.missing.length ? `без суми: ${s.missing.length}` : 'на місяць'}</span></div>
    <div class="tile"><span class="k">Разові витрати відкриття</span><span class="v">${fmtMoney(b.nonRefundable)}</span><span class="s">з бюджету, без депозиту</span></div>
    <div class="tile"><span class="k">Депозит</span><span class="v">${fmtMoney(b.deposit.needed)}</span><span class="s">повертається</span></div>
  </section>
  <section class="panel">
    ${s.rent || s.items.length ? `<div class="list">${rentRow}${rows}</div>
      <div class="row" style="justify-content:space-between;margin-top:12px"><b>Разом на місяць</b><b class="num">${fmtMoney(s.total)}</b></div>` : emptyState('Додайте постійні платежі: комунальні, зарплату, зв’язок, бухгалтерію, рекламу.', 'monthly-defaults', 'Додати типові статті', true)}
    ${(s.rent || s.items.length) && Object.keys(MONTHLY_KINDS).some(k => k !== 'rent' && !s.items.some(m => m.kind === k)) ? `<div style="margin-top:10px"><button class="btn sm ghost" data-act="monthly-defaults">+ Додати ${s.items.length ? 'відсутні ' : ''}типові статті</button></div>` : ''}
  </section>
  <details class="explain"><summary>Що тут рахується</summary><div class="formula"><span><b>Разом на місяць</b> = оренда з розділу «Приміщення» + суми інших статей. Окрема стаття з типом «Оренда» не додається, якщо оренду вже вказано в приміщенні.</span><span>Ці витрати не входять у бюджет відкриття. Перший місяць оренди й депозит вносяться в бюджет окремо, з розділу «Приміщення».</span><span>«У беззбитковість» підставляє суму в поле постійних витрат калькулятора після підтвердження.</span></div></details>`;
};
