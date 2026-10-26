import { Calc } from '../../core/calc.js';
import { NO_SECTION, SORTS, groupProducts, planRegroup, sectionOrder } from '../../core/sections.js';
import { byText, daysFromToday, esc, fmtDate, fmtMoney, fmtNum, fmtPct, isNum, plural, signedMoney, signedPct } from '../../core/utils.js';
import { photoImg } from '../photos.js';
import { D, UI, VIEWS, emptyState, ext, supplierName, moreMenu } from '../shared.js';
import { svg } from '../shell.js';

/* ---------- 3. Товари ---------- */
export const DIFF_HINT = 'Роздрібна ціна мінус закупівельна ціна за одиницю, без урахування інших витрат';
export const FORMULAS = `<details class="explain"><summary>Формули</summary><div class="formula">
  <span><b>Ціна одиниці</b> = ціна упаковки ÷ кількість одиниць в упаковці</span>
  <span><b>Націнка</b> = (роздрібна ціна − ціна одиниці) ÷ ціна одиниці × 100%</span>
  <span><b>Маржа</b> = (роздрібна ціна − ціна одиниці) ÷ роздрібна ціна × 100%</span></div></details>`;
/** Вигляд списку на комп'ютері: картки (типово) або таблиця. Налаштування лише цього пристрою. */
export const prodView = () => { try { return localStorage.getItem('komfort-prod-view') === 'table' ? 'table' : 'cards'; } catch { return 'cards'; } };
export function productMobile(list, showSupplier, cls = 'only-m') {
  if (cls === 'prod-cards') return `<div class="product-gallery">${list.map(p => {
    const cost = Calc.unitCost(p), d = Calc.diff(cost, p.retailPrice), tone = !isNum(d) ? '' : d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero';
    const sup = p.supplierId ? supplierName(p.supplierId) : '';
    return `<button class="catalog-card" data-act="view-product" data-id="${p.id}" aria-label="Відкрити товар ${esc(p.name)}"><span class="catalog-image">${p.photos?.length ? photoImg(p.photos[0], '', p.name) : `<span class="catalog-placeholder">${svg('products')}<span>Фото ще немає</span></span>`}</span>
      <span class="catalog-info"><span class="catalog-meta">${esc(sup || 'Постачальник не вказаний')}</span><span class="catalog-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="catalog-prices"><span><span class="k">Закупівля / од.</span>${isNum(cost) ? `<b>${fmtMoney(cost)}</b>` : '<b class="retail-none">Не задано</b>'}</span><span><span class="k">Роздріб</span>${isNum(p.retailPrice) ? `<b class="retail">${fmtMoney(p.retailPrice)}</b>` : '<b class="retail-none">Не задано</b>'}</span></span>
      ${isNum(d) ? `<span class="catalog-profit ${tone}" title="${DIFF_HINT}"><span><span class="k">Різниця / од.</span><b>${signedMoney(d)}</b></span><span><span class="k">Маржа</span><b>${signedPct(Calc.margin(cost, p.retailPrice))}</b></span></span>`
        : `<span class="catalog-profit empty-metrics">${isNum(cost) ? 'Вкажіть роздрібну ціну' : 'Вкажіть закупівельну ціну'}</span>`}</span></button>`;
  }).join('')}</div>`;
  return `<div class="m-list ${cls}">${list.map(p => {
    const c = Calc.unitCost(p), mk = Calc.markup(c, p.retailPrice), mg = Calc.margin(c, p.retailPrice);
    const sub = [p.sizes && 'Розміри: ' + p.sizes, showSupplier && (p.supplierId ? supplierName(p.supplierId) : 'без постачальника'), p.sku && 'арт. ' + p.sku].filter(Boolean).map(esc).join(' · ');
    const n = (p.photos || []).length;
    return `<button class="m-item prod-item" data-act="view-product" data-id="${p.id}"><span class="lead lg">${n ? photoImg(p.photos[0], '', p.name) : svg('products')}</span>
      <span class="mn"><b class="nm">${esc(p.name)}</b>${sub ? `<span class="m-sub">${sub}</span>` : ''}
      <span class="m-metrics"><span>Закуп <b>${fmtMoney(c)}</b></span><span>Роздріб <b>${fmtMoney(p.retailPrice)}</b></span>${isNum(c) && isNum(p.retailPrice) ? `<span title="${DIFF_HINT}">Різниця <b style="${p.retailPrice - c < 0 ? 'color:var(--danger)' : ''}">${signedMoney(p.retailPrice - c)}</b></span>` : ''}</span>
      <span class="m-sub">${p.priceType === 'pack' ? `${fmtMoney(p.purchasePrice)} за уп. ${fmtNum(p.packQty)} шт · ` : ''}ціна від ${fmtDate(p.priceDate)} · маржа <span style="${isNum(mg) && mg < 0 ? 'color:var(--danger)' : ''}">${fmtPct(mg)}</span></span></span>
      <span class="trail"><span class="small muted">Націнка</span><b class="big" style="${isNum(mk) && mk < 0 ? 'color:var(--danger)' : ''}">${fmtPct(mk)}</b>${n > 1 ? `<span class="small muted">${n} фото</span>` : ''}</span></button>`;
  }).join('')}</div>`;
}
const secLabel = p => [p.category, p.subcategory].filter(Boolean).join(' › ');
const thumbBtn = p => { const n = (p.photos || []).length;
  return n ? `<button class="thumb-btn" data-act="product-photos" data-id="${p.id}" aria-label="Фото товару (${n})">${photoImg(p.photos[0], 'thumb', p.name)}${n > 1 ? `<i>${n}</i>` : ''}</button>` : ''; };
export function productTable(list, showSupplier) {
  if (prodView() === 'cards') return productMobile(list, showSupplier, 'prod-cards');
  return productMobile(list, showSupplier) + `<div class="table-wrap hide-m"><table class="t stack"><thead><tr><th>Товар</th><th>Розділ</th>${showSupplier ? '<th>Постачальник</th>' : ''}<th class="r">Закупівля</th><th class="r">Ціна од.</th><th class="r">Роздріб</th><th class="r" title="${DIFF_HINT}">Різниця / од.</th><th class="r">Націнка</th><th class="r">Маржа</th><th>Ціна від</th><th class="acts"><span class="sr">Дії</span></th></tr></thead><tbody>
  ${list.map(p => {
    const c = Calc.unitCost(p), mk = Calc.markup(c, p.retailPrice), mg = Calc.margin(c, p.retailPrice);
    const age = p.priceDate ? -daysFromToday(p.priceDate) : null;
    return `<tr>
      <td class="first" data-label="Товар">${thumbBtn(p)}<div><button class="btn link prod-name" data-act="view-product" data-id="${p.id}">${esc(p.name)}</button></div><div class="small muted">${[p.sku && 'арт. ' + esc(p.sku), p.sizes && 'розм. ' + esc(p.sizes), p.colors && esc(p.colors)].filter(Boolean).join(' · ')}</div>${p.url ? `<div class="small">${ext(p.url)}</div>` : ''}${p.comment ? `<div class="small muted">${esc(p.comment)}</div>` : ''}</td>
      <td data-label="Розділ">${esc(secLabel(p)) || '—'}</td>
      ${showSupplier ? `<td data-label="Постачальник">${p.supplierId ? `<button class="btn sm ghost" style="padding:2px 4px" data-act="open-supplier" data-id="${p.supplierId}">${esc(supplierName(p.supplierId))}</button>` : '<span class="muted">не вказано</span>'}</td>` : ''}
      <td class="r" data-label="Закупівля"><span>${fmtMoney(p.purchasePrice)}${p.priceType === 'pack' ? `<br><span class="small muted">за уп. ${fmtNum(p.packQty)} шт</span>` : ''}</span></td>
      <td class="r" data-label="Ціна од.">${fmtMoney(c)}</td>
      <td class="r" data-label="Роздріб">${fmtMoney(p.retailPrice)}</td>
      <td class="r" data-label="Різниця / од." style="${isNum(c) && isNum(p.retailPrice) && p.retailPrice < c ? 'color:var(--danger)' : ''}">${isNum(c) && isNum(p.retailPrice) ? signedMoney(p.retailPrice - c) : '—'}</td>
      <td class="r" data-label="Націнка">${fmtPct(mk)}</td>
      <td class="r" data-label="Маржа" style="${isNum(mg) && mg < 0 ? 'color:var(--danger)' : ''}">${fmtPct(mg)}</td>
      <td data-label="Ціна від">${fmtDate(p.priceDate)}${age !== null && age > 60 ? ' <span class="pill warn">стара</span>' : ''}</td>
      <td class="acts"><button class="btn sm" data-act="edit-product" data-id="${p.id}">Редагувати</button> <button class="btn sm danger" data-act="del-product" data-id="${p.id}" aria-label="Видалити">✕</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}
const count = n => `<span class="muted">${n}</span>`;
const chip = (on, act, attrs, label, n) => `<button class="chip ${on ? 'on' : ''} ${n ? '' : 'zero'}" data-act="${act}" ${attrs}>${esc(label)} ${count(n)}</button>`;
VIEWS.products = () => {
  const d = D(); const q = UI.f.prodQ.trim().toLowerCase(); const sections = d.settings.sections;
  const order = sectionOrder(sections, d.products);
  if (UI.f.prodCat && UI.f.prodCat !== NO_SECTION && !order.includes(UI.f.prodCat)) UI.f.prodCat = '';
  const base = d.products.filter(p => (!UI.f.prodSup || (UI.f.prodSup === '__none' ? !p.supplierId : p.supplierId === UI.f.prodSup))
    && (!q || [p.name, p.sku, p.comment, p.colors, p.sizes, p.category, p.subcategory, supplierName(p.supplierId)].join(' ').toLowerCase().includes(q)));
  const inCat = UI.f.prodCat === NO_SECTION ? base.filter(p => !p.category) : UI.f.prodCat ? base.filter(p => p.category === UI.f.prodCat) : base;
  const subs = UI.f.prodCat && UI.f.prodCat !== NO_SECTION ? [...new Set([...(sections.find(s => s.name === UI.f.prodCat)?.subs || []), ...inCat.map(p => p.subcategory).filter(Boolean)])] : [];
  if (!subs.includes(UI.f.prodSub) && UI.f.prodSub !== NO_SECTION) UI.f.prodSub = '';
  const list = UI.f.prodSub === NO_SECTION ? inCat.filter(p => !p.subcategory) : UI.f.prodSub ? inCat.filter(p => p.subcategory === UI.f.prodSub) : inCat;
  const head = `<div class="page-head"><div><p>${d.products.length} ${plural(d.products.length, 'товар', 'товари', 'товарів')}. Довідник цін без складського обліку.</p></div><div class="row"><span class="view-seg hide-m" role="group" aria-label="Вигляд списку">${[['cards', 'Картки'], ['table', 'Таблиця']].map(([k, t]) => `<button type="button" data-act="prod-view" data-v="${k}" aria-pressed="${prodView() === k}">${t}</button>`).join('')}</span>${moreMenu([['edit-sections', 'Розділи й підрозділи'], ['regroup', 'Розкласти по розділах']])}<button class="btn primary hide-m" data-act="add-product">+ Додати товар</button></div></div>`;
  if (!d.products.length) return head + emptyState('Додайте товар з ціною закупівлі та плановою роздрібною ціною, і націнка з маржею порахуються автоматично.', 'add-product', 'Додати перший товар') + FORMULAS;
  const plan = planRegroup(d), toMove = plan.products.length + plan.suppliers.length;
  const noCat = base.filter(p => !p.category).length;
  const groups = groupProducts(list, sections, UI.f.prodSort);
  const one = groups.length === 1;
  return head + `
  <div class="toolbar">
    <label class="search">${svg('search')}<input class="input" id="f-prodQ" data-filter="prodQ" placeholder="Пошук: назва, артикул, коментар…" value="${esc(UI.f.prodQ)}" aria-label="Пошук товарів"></label>
    <select class="input" id="f-prodSup" data-filter="prodSup" aria-label="Постачальник"><option value="">Усі постачальники</option><option value="__none" ${UI.f.prodSup === '__none' ? 'selected' : ''}>Без постачальника</option>${[...d.suppliers].sort((a, b) => byText(a.name, b.name)).map(s => `<option value="${s.id}" ${UI.f.prodSup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <select class="input" id="f-prodSort" data-filter="prodSort" aria-label="Сортування">${SORTS.map(([k, t]) => `<option value="${k}" ${UI.f.prodSort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
  </div>
  <div class="chips sec-chips" role="group" aria-label="Розділи">${chip(!UI.f.prodCat, 'prod-cat', 'data-v=""', 'Усі', base.length)}${order.map(c => { const n = base.filter(p => p.category === c).length; return n || sections.some(s => s.name === c) ? chip(UI.f.prodCat === c, 'prod-cat', `data-v="${esc(c)}"`, c, n) : ''; }).join('')}${noCat ? chip(UI.f.prodCat === NO_SECTION, 'prod-cat', `data-v="${NO_SECTION}"`, 'Без розділу', noCat) : ''}</div>
  ${subs.length ? `<div class="chips sec-chips sub" role="group" aria-label="Підрозділи">${chip(!UI.f.prodSub, 'prod-sub', 'data-v=""', 'Усі', inCat.length)}${subs.map(s => chip(UI.f.prodSub === s, 'prod-sub', `data-v="${esc(s)}"`, s, inCat.filter(p => p.subcategory === s).length)).join('')}${inCat.some(p => !p.subcategory) ? chip(UI.f.prodSub === NO_SECTION, 'prod-sub', `data-v="${NO_SECTION}"`, 'Без підрозділу', inCat.filter(p => !p.subcategory).length) : ''}</div>` : ''}
  ${toMove && !UI.regroupHidden ? `<div class="callout row" style="justify-content:space-between"><span>Частину товарів чи постачальників можна автоматично розкласти по розділах: ${plan.products.length} ${plural(plan.products.length, 'товар', 'товари', 'товарів')}, ${plan.suppliers.length} ${plural(plan.suppliers.length, 'постачальник', 'постачальники', 'постачальників')}.</span><span class="row"><button class="btn sm ghost" data-act="regroup-hide">Не зараз</button><button class="btn sm primary" data-act="regroup">Переглянути й розкласти</button></span></div>` : ''}
  ${list.length ? groups.map(g => `<section class="sec-group">${one && UI.f.prodCat ? '' : `<h2 class="sec-h">${esc(g.name || 'Без розділу')} ${count(g.items.length)}</h2>`}
    ${g.subs.map(sg => `${g.subs.length > 1 || sg.name ? `<h3 class="sec-sub">${esc(sg.name || 'Інше')} ${count(sg.items.length)}</h3>` : ''}${productTable(sg.items, true)}`).join('')}</section>`).join('') : '<p class="muted">Нічого не знайдено за цими умовами.</p>'}
  ${FORMULAS}`;
};
