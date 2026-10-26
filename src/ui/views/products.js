import { Calc } from '../../core/calc.js';
import { NO_SECTION, SORTS, groupProducts, sortProducts, planRegroup, sectionOrder } from '../../core/sections.js';
import { byText, esc, fmtMoney, fmtNum, isNum, plural, signedMoney, signedPct } from '../../core/utils.js';
import { photoImg } from '../photos.js';
import { D, UI, VIEWS, emptyState, supplierName, moreMenu } from '../shared.js';
import { svg } from '../shell.js';
import { cartButton, cartControl } from './cart.js';

/* ---------- 3. Товари ---------- */
export const DIFF_HINT = 'Роздрібна ціна мінус закупівельна ціна за одиницю, без урахування інших витрат';
export const FORMULAS = `<details class="explain"><summary>Формули</summary><div class="formula">
  <span><b>Ціна одиниці</b> = ціна упаковки ÷ кількість одиниць в упаковці</span>
  <span><b>Націнка</b> = (роздрібна ціна − ціна одиниці) ÷ ціна одиниці × 100%</span>
  <span><b>Маржа</b> = (роздрібна ціна − ціна одиниці) ÷ роздрібна ціна × 100%</span></div></details>`;
/** Вигляд каталогу: картки (типово) або компактний список. Налаштування лише цього пристрою. */
export const prodView = () => { try { return ['list', 'table'].includes(localStorage.getItem('komfort-prod-view')) ? 'list' : 'cards'; } catch { return 'cards'; } };
const metrics = p => { const cost = Calc.unitCost(p), d = Calc.diff(cost, p.retailPrice);
  return { cost, d, mg: Calc.margin(cost, p.retailPrice), tone: !isNum(d) ? '' : d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero' }; };
const quickBtn = (p, cls, label) => `<button type="button" class="${cls}" data-act="quick-retail" data-id="${p.id}" aria-label="${esc(label)}: ${esc(p.name)}">${label}</button>`;
const supLabel = p => esc(p.supplierId ? supplierName(p.supplierId) : 'Постачальник не вказаний');
const openAttrs = p => `role="button" tabindex="0" data-act="view-product" data-id="${p.id}" aria-label="Відкрити товар ${esc(p.name)}"`;
function productCards(list) {
  return `<div class="product-gallery">${list.map(p => { const { cost, d, mg, tone } = metrics(p);
    return `<article class="catalog-card" ${openAttrs(p)}><span class="catalog-image">${p.photos?.length ? photoImg(p.photos[0], '', p.name) : `<span class="catalog-placeholder">${svg('products')}<span>Фото ще немає</span></span>`}</span>
      <span class="catalog-info"><span class="catalog-meta">${supLabel(p)}</span><span class="catalog-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="catalog-prices"><span><span class="k">Закупівля / од.</span>${isNum(cost) ? `<b>${fmtMoney(cost)}</b>` : '<b class="retail-none">Не задано</b>'}</span><span><span class="k">Роздріб</span>${isNum(p.retailPrice) ? `<b class="retail">${fmtMoney(p.retailPrice)}</b>` : '<b class="retail-none">Не задано</b>'}</span></span>
      ${isNum(d) ? `<span class="catalog-profit ${tone}" title="${DIFF_HINT}"><span><span class="k">Різниця / од.</span><b>${signedMoney(d)}</b></span><span><span class="k">Маржа</span><b>${signedPct(mg)}</b></span></span>`
        : !isNum(p.retailPrice) ? quickBtn(p, 'catalog-profit empty-metrics', 'Вкажіть роздрібну ціну')
        : '<span class="catalog-profit empty-metrics">Вкажіть закупівельну ціну</span>'}<span class="catalog-cart" data-act="cart-noop">${cartControl(p)}</span></span></article>`;
  }).join('')}</div>`;
}
function productList(list) {
  return `<div class="prod-list" role="list"><div class="pl-head" aria-hidden="true"><span></span><span>Товар</span><span>Закупівля / од.</span><span>Роздріб</span><span title="${DIFF_HINT}">Різниця / од.</span><span>Маржа</span></div>
  ${list.map(p => { const { cost, d, mg, tone } = metrics(p);
    return `<article class="pl-row ${tone}" role="listitem"><div class="pl-open" ${openAttrs(p)}>
      <span class="pl-main"><span class="pl-photo">${p.photos?.length ? photoImg(p.photos[0], '', p.name) : svg('products')}</span>
      <span class="pl-name"><b title="${esc(p.name)}">${esc(p.name)}</b><span class="pl-sup">${supLabel(p)}</span></span></span>
      <span class="pl-v pl-cost"><span class="k">Закупівля / од.</span><b>${isNum(cost) ? fmtMoney(cost) : '<i class="none">Не задано</i>'}</b>${p.priceType === 'pack' && isNum(cost) ? `<span class="pl-note">уп. ${fmtNum(p.packQty)} шт</span>` : ''}</span>
      <span class="pl-v pl-retail"><span class="k">Роздріб</span><b>${isNum(p.retailPrice) ? fmtMoney(p.retailPrice) : '<i class="none">Не задано</i>'}</b></span>
      <span class="pl-v pl-diff" title="${DIFF_HINT}"><span class="k">Різниця / од.</span><b>${isNum(d) ? signedMoney(d) : '—'}</b></span>
      <span class="pl-v pl-margin"><span class="k">Маржа</span><b>${isNum(mg) ? signedPct(mg) : '—'}</b></span></div>
      <div class="pl-acts" data-act="cart-noop">${cartControl(p)}${quickBtn(p, 'btn sm pl-quick' + (isNum(p.retailPrice) ? ' ghost' : ''), isNum(p.retailPrice) ? 'Змінити роздріб' : 'Вкажіть роздрібну ціну')}</div></article>`;
  }).join('')}</div>`;
}
export function productTable(list) {
  return prodView() === 'list' ? productList(list) : productCards(list);
}
const QUICK = {
  noretail: p => !isNum(p.retailPrice),
  negdiff: p => { const d = Calc.diff(Calc.unitCost(p), p.retailPrice); return isNum(d) && d < 0; },
};
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
  const inSub = UI.f.prodSub === NO_SECTION ? inCat.filter(p => !p.subcategory) : UI.f.prodSub ? inCat.filter(p => p.subcategory === UI.f.prodSub) : inCat;
  const list = QUICK[UI.f.prodQuick] ? inSub.filter(QUICK[UI.f.prodQuick]) : inSub;
  const head = `<div class="page-head"><div><p>${d.products.length} ${plural(d.products.length, 'товар', 'товари', 'товарів')}. Довідник цін без складського обліку.</p></div><div class="row">${cartButton()}${moreMenu([['edit-sections', 'Розділи й підрозділи'], ['regroup', 'Розкласти по розділах']])}<button class="btn primary hide-m" data-act="add-product">+ Додати товар</button></div></div>`;
  if (!d.products.length) return head + emptyState('Додайте товар з ціною закупівлі та плановою роздрібною ціною, і націнка з маржею порахуються автоматично.', 'add-product', 'Додати перший товар') + FORMULAS;
  const plan = planRegroup(d), toMove = plan.products.length + plan.suppliers.length;
  const noCat = base.filter(p => !p.category).length;
  const grouped = UI.f.prodSort === 'name';
  const groups = grouped ? groupProducts(list, sections, UI.f.prodSort) : [];
  const one = groups.length === 1;
  const view = prodView();
  return head + `
  <div class="toolbar">
    <label class="search">${svg('search')}<input class="input" id="f-prodQ" data-filter="prodQ" placeholder="Пошук: назва, артикул, коментар…" value="${esc(UI.f.prodQ)}" aria-label="Пошук товарів"></label>
    <select class="input" id="f-prodSup" data-filter="prodSup" aria-label="Постачальник"><option value="">Усі постачальники</option><option value="__none" ${UI.f.prodSup === '__none' ? 'selected' : ''}>Без постачальника</option>${[...d.suppliers].sort((a, b) => byText(a.name, b.name)).map(s => `<option value="${s.id}" ${UI.f.prodSup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <span class="sort-view"><select class="input" id="f-prodSort" data-filter="prodSort" aria-label="Сортування">${SORTS.map(([k, t]) => `<option value="${k}" ${UI.f.prodSort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <span class="view-seg" role="group" aria-label="Вигляд каталогу">${[['cards', 'Картки'], ['list', 'Список']].map(([k, t]) => `<button type="button" data-act="prod-view" data-v="${k}" aria-pressed="${view === k}">${t}</button>`).join('')}</span></span>
  </div>
  <div class="chips sec-chips" role="group" aria-label="Розділи">${chip(!UI.f.prodCat, 'prod-cat', 'data-v=""', 'Усі', base.length)}${order.map(c => { const n = base.filter(p => p.category === c).length; return n || sections.some(s => s.name === c) ? chip(UI.f.prodCat === c, 'prod-cat', `data-v="${esc(c)}"`, c, n) : ''; }).join('')}${noCat ? chip(UI.f.prodCat === NO_SECTION, 'prod-cat', `data-v="${NO_SECTION}"`, 'Без розділу', noCat) : ''}</div>
  ${subs.length ? `<div class="chips sec-chips sub" role="group" aria-label="Підрозділи">${chip(!UI.f.prodSub, 'prod-sub', 'data-v=""', 'Усі', inCat.length)}${subs.map(s => chip(UI.f.prodSub === s, 'prod-sub', `data-v="${esc(s)}"`, s, inCat.filter(p => p.subcategory === s).length)).join('')}${inCat.some(p => !p.subcategory) ? chip(UI.f.prodSub === NO_SECTION, 'prod-sub', `data-v="${NO_SECTION}"`, 'Без підрозділу', inCat.filter(p => !p.subcategory).length) : ''}</div>` : ''}
  <div class="quick-row"><div class="chips quick-chips" role="group" aria-label="Швидкі фільтри">${[['', 'Усі'], ['noretail', 'Без роздрібної ціни'], ['negdiff', 'Від’ємна різниця']].map(([k, t]) => chip((UI.f.prodQuick || '') === k, 'prod-quick', `data-v="${k}"`, t, k ? inSub.filter(QUICK[k]).length : inSub.length)).join('')}</div>
  <p class="found" aria-live="polite">Знайдено ${list.length} з ${d.products.length}</p></div>
  ${toMove && !UI.regroupHidden ? `<div class="callout row" style="justify-content:space-between"><span>Частину товарів чи постачальників можна автоматично розкласти по розділах: ${plan.products.length} ${plural(plan.products.length, 'товар', 'товари', 'товарів')}, ${plan.suppliers.length} ${plural(plan.suppliers.length, 'постачальник', 'постачальники', 'постачальників')}.</span><span class="row"><button class="btn sm ghost" data-act="regroup-hide">Не зараз</button><button class="btn sm primary" data-act="regroup">Переглянути й розкласти</button></span></div>` : ''}
  ${!list.length ? '<p class="muted">Нічого не знайдено за цими умовами.</p>' : !grouped ? productTable(sortProducts(list, UI.f.prodSort)) : groups.map(g => `<section class="sec-group">${one && UI.f.prodCat ? '' : `<h2 class="sec-h">${esc(g.name || 'Без розділу')} ${count(g.items.length)}</h2>`}
    ${g.subs.map(sg => `${g.subs.length > 1 || sg.name ? `<h3 class="sec-sub">${esc(sg.name || 'Інше')} ${count(sg.items.length)}</h3>` : ''}${productTable(sg.items)}`).join('')}</section>`).join('')}
  ${FORMULAS}`;
};
