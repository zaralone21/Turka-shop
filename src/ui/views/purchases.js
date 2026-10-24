import { Calc } from '../../core/calc.js';
import { purchaseLink } from '../../core/opening.js';
import { Schema } from '../../core/schema.js';
import { byText, daysFromToday, esc, fmtDate, fmtMoney } from '../../core/utils.js';
import { D, UI, VIEWS, emptyState, supplierName } from '../shared.js';

/* ---------- Закупівлі: що заплановано й що очікується ---------- */
const STATUS_PILL = { planned: '', ordered: 'accent', awaiting: 'accent', received: 'ok', cancelled: '' };
export const purchasePill = s => `<span class="pill ${STATUS_PILL[s]}">${Schema.PURCHASE_STATUSES[s]}</span>`;

VIEWS.purchases = () => {
  const d = D(); const sum = Calc.purchases(d);
  const head = `<div class="page-head"><p>Заплановані й очікувані закупівлі товару. Суми рахуються з позицій і доставки.</p><button class="btn primary hide-m" data-act="add-purchase">+ Нова закупівля</button></div>`;
  if (!d.purchases.length) return head + emptyState('Запишіть першу закупівлю: у кого, що й скільки береться, коли чекати доставку.', 'add-purchase', 'Запланувати закупівлю');
  const order = { awaiting: 0, ordered: 1, planned: 2, received: 3, cancelled: 4 };
  const list = d.purchases.filter(p => !UI.f.purStatus || p.status === UI.f.purStatus)
    .sort((a, b) => (order[a.status] - order[b.status]) || ((a.expectedDate || '9999') < (b.expectedDate || '9999') ? -1 : 1) || byText(a.title, b.title));
  return head + `
  <section class="tiles">
    <div class="tile"><span class="k">Заплановано · ${sum.count.planned}</span><span class="v">${fmtMoney(sum.planned)}</span></div>
    <div class="tile accent"><span class="k">Замовлено й очікується · ${sum.count.awaiting}</span><span class="v">${fmtMoney(sum.awaiting)}</span></div>
    <div class="tile"><span class="k">Отримано · ${sum.count.received}</span><span class="v">${fmtMoney(sum.received)}</span></div>
  </section>
  <div class="toolbar"><select class="input" id="f-purStatus" data-filter="purStatus" aria-label="Статус"><option value="">Усі статуси</option>${Object.entries(Schema.PURCHASE_STATUSES).map(([k, v]) => `<option value="${k}" ${UI.f.purStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  ${list.length ? `<div class="grid-cards">${list.map(purchaseCard).join('')}</div>` : '<p class="muted">Немає закупівель з таким статусом.</p>'}
  <details class="explain"><summary>Як рахується і як пов’язано з бюджетом</summary><div class="formula"><span><b>Сума закупівлі</b> = Σ (кількість × ціна одиниці) + доставка.</span><span>Закупівлі не додаються до бюджету самі, щоб не порахувати гроші двічі. Кнопка «Внести в бюджет» створює одну статтю витрат і пов’язує її із закупівлею. Якщо потім сума закупівлі зміниться, з’явиться позначка розбіжності й пропозиція оновити план статті. Сплачене змінюєте лише ви, у бюджеті.</span></div></details>`;
};
/** Стан зв'язку з бюджетом: розбіжність суми, видалена стаття, скасована закупівля з активною статтею. */
export function purchaseBudgetLine(p) {
  const st = purchaseLink(D(), p);
  if (st.state === 'none') return p.status !== 'cancelled' ? `<div class="small"><button class="btn sm" data-act="purchase-to-budget" data-id="${p.id}">Внести в бюджет</button></div>` : '';
  if (st.state === 'missing') return `<div class="small"><span class="pill bad">Статтю бюджету видалено</span><div class="row" style="gap:6px;margin-top:4px">${p.status !== 'cancelled' ? `<button class="btn sm" data-act="purchase-to-budget" data-id="${p.id}">Створити знову</button>` : ''}<button class="btn sm ghost" data-act="purchase-relink" data-id="${p.id}">Прив’язати наявну</button></div></div>`;
  const e = st.expense;
  if (p.status === 'cancelled') return `<div class="small"><span class="pill warn">Скасовано, але стаття «${esc(e.name)}» лишається в бюджеті</span> <button class="btn sm ghost" data-act="edit-expense" data-id="${e.id}">Переглянути</button></div>`;
  return `<div class="small">У бюджеті: «${esc(e.name)}» · сплачено ${fmtMoney(e.paid ?? 0)}${st.state === 'mismatch' ? `<div class="row" style="gap:6px;margin-top:4px"><span class="pill warn">Розбіжність: закупівля ${fmtMoney(st.amount)}, план у бюджеті ${fmtMoney(st.planned)}</span><button class="btn sm" data-act="purchase-sync" data-id="${p.id}">Узгодити</button></div>` : ''}</div>`;
}
function purchaseCard(p) {
  const t = Calc.purchaseTotal(p); const late = p.expectedDate && ['ordered', 'awaiting'].includes(p.status) && daysFromToday(p.expectedDate) < 0;
  return `<article class="card click" data-act="edit-purchase" data-id="${p.id}" tabindex="0" role="button" aria-label="Відкрити закупівлю ${esc(p.title)}">
    <div class="card-top"><h3>${esc(p.title)}</h3>${purchasePill(p.status)}</div>
    <div class="small muted">${[supplierName(p.supplierId) || 'Постачальник не вказаний', `${p.items.length} ${p.items.length === 1 ? 'позиція' : 'позицій'}`].map(esc).join(' · ')}</div>
    ${t.missing.length ? `<div class="small" style="color:var(--warn)">${t.missing.length} без ціни або кількості, у суму не входять</div>` : ''}
    <div class="card-foot"><b class="num">${fmtMoney(t.total)}</b><span class="small ${late ? '' : 'muted'}">${p.expectedDate ? (late ? `<span class="pill bad">Запізнюється · ${fmtDate(p.expectedDate)}</span>` : 'Очікується ' + fmtDate(p.expectedDate)) : 'Дата не вказана'}</span></div>
    ${purchaseBudgetLine(p)}
  </article>`;
}
