import { Calc } from '../../core/calc.js';
import { unitOf, unitWord } from '../../core/cart.js';
import { Repo } from '../../core/repo.js';
import { pickableProducts } from '../../core/supplierSections.js';
import { DEFAULT_MIN, MOVE_TYPES, assertStock, markupOf, moveSign, planReceipt, retailFromMarkup, stockLedger, stockRows, stockTotals, variantKey, variantLabel } from '../../core/stock.js';
import { byText, esc, fmtDate, fmtMoney, fmtNum, isNum, parseNum, plural, signedMoney, signedPct, todayISO, uid } from '../../core/utils.js';
import { F, closeModal, confirmDialog, dateField, formModal, g, openModal } from '../modal.js';
import { hydratePhotos, photoImg } from '../photos.js';
import { D, UI, VIEWS, moreMenu, supplierName, toast } from '../shared.js';
import { svg } from '../shell.js';

/* =====================================================================
   ТОВАРИ В НАЯВНОСТІ
   Залишок рахується з отриманих закупівель і руху товару (core/stock.js), окремого списку немає.
   ===================================================================== */
export const AVAIL = [['in', 'У наявності'], ['low', 'Закінчуються'], ['out', 'Немає в наявності'], ['all', 'Усі товари']];
export const STOCK_SORTS = [['name', 'Назва (А–Я)'], ['qty-desc', 'Залишок: більше'], ['qty-asc', 'Залишок: менше'], ['cost-desc', 'Собівартість: дорожчі'], ['cost-asc', 'Собівартість: дешевші'], ['retail-desc', 'Роздріб: дорожчі'], ['retail-asc', 'Роздріб: дешевші']];
const NONE = '__none';
const money = v => (isNum(v) ? fmtMoney(v) : '—');
const qtyText = n => `${fmtNum(n)} шт`;
/** Собівартість змінилась після того, як було встановлено роздрібну ціну. */
const costMoved = r => isNum(r.p.retailCostBase) && isNum(r.cost) && Math.abs(r.p.retailCostBase - r.cost) >= 0.01;

/** Посилання на постачальників товару; без постачальника — «Не вказано» з кнопкою прив’язки. */
export function supLinks(ids, productId, { short } = {}) {
  const list = ids.map(id => ({ id, name: supplierName(id) })).filter(s => s.name);
  if (!list.length) return `<span class="sup-none">Не вказано</span>${productId ? ` <button type="button" class="btn link sm" data-act="stock-bind-sup" data-id="${productId}">Вказати</button>` : ''}`;
  const shown = short ? list.slice(0, 2) : list;
  return shown.map(s => `<button type="button" class="sup-link" data-act="open-supplier" data-id="${s.id}" title="Відкрити картку постачальника">${esc(s.name)}</button>`).join('<span class="sup-sep">, </span>')
    + (list.length > shown.length ? `<span class="sup-more" title="${esc(list.slice(shown.length).map(s => s.name).join(', '))}"> +${list.length - shown.length}</span>` : '');
}
const stateLabel = r => (r.state === 'out' ? '<span class="pill stk-out">Немає в наявності</span>' : r.state === 'low' ? `<span class="pill warn" title="Менше за мінімальний залишок ${fmtNum(r.min)} шт">Закінчується</span>` : '');
const variantsHtml = r => (r.variants.filter(v => v.size || v.color).length ? `<span class="stk-vars">${r.variants.filter(v => v.size || v.color || v.qty).map(v => `<span class="stk-var ${v.qty <= 0 ? 'zero' : ''}">${esc(variantLabel(v) || 'Без розміру')} <b>${fmtNum(v.qty)}</b></span>`).join('')}</span>` : '');
const retailCell = r => (isNum(r.retail) ? `<b>${fmtMoney(r.retail)}</b>${costMoved(r) ? `<span class="stk-moved" title="Собівартість змінилась після встановлення ціни: була ${fmtMoney(r.p.retailCostBase)}, зараз ${fmtMoney(r.cost)}. Ціну не змінено автоматично.">собівартість змінилась</span>` : ''}` : '<span class="stk-noprice">Ціну не встановлено</span>');

function filtered(d, rows) {
  const f = UI.f, words = f.stockQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(r => {
    if (f.stockAvail === 'in' && r.qty <= 0) return false;
    if (f.stockAvail === 'low' && r.state !== 'low') return false;
    if (f.stockAvail === 'out' && r.qty > 0) return false;
    if (f.stockCat && (f.stockCat === NONE ? r.p.category : r.p.category !== f.stockCat)) return false;
    if (f.stockSup && (f.stockSup === NONE ? r.suppliers.some(supplierName) : !r.suppliers.includes(f.stockSup))) return false;
    if (words.length) { const h = `${r.p.name} ${r.p.sku}`.toLowerCase(); if (!words.every(w => h.includes(w))) return false; }
    return true;
  });
}
function sorted(list) {
  const [k, dir] = UI.f.stockSort.split('-'), sign = dir === 'asc' ? 1 : -1;
  const val = r => (k === 'qty' ? r.qty : k === 'cost' ? r.cost : k === 'retail' ? r.retail : null);
  if (k === 'name') return [...list].sort((a, b) => byText(a.p.name, b.p.name));
  // Порожні значення (немає ціни) завжди в кінці.
  return [...list].sort((a, b) => { const x = val(a), y = val(b); if (!isNum(x) || !isNum(y)) return (isNum(x) ? -1 : 0) + (isNum(y) ? 1 : 0) || byText(a.p.name, b.p.name); return (x - y) * sign || byText(a.p.name, b.p.name); });
}

VIEWS.stock = () => {
  const d = D(), ledger = stockLedger(d), all = stockRows(d, ledger), f = UI.f;
  if (!AVAIL.some(([k]) => k === f.stockAvail)) f.stockAvail = 'in';
  const list = sorted(filtered(d, all)), t = stockTotals(list);
  const cats = [...new Set([...d.settings.sections.map(s => s.name), ...d.products.map(p => p.category).filter(Boolean)])];
  const supIds = [...new Set(all.flatMap(r => r.suppliers))].filter(supplierName).sort((a, b) => byText(supplierName(a), supplierName(b)));
  const opt = (k, label, cur) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(label)}</option>`;
  const counts = { in: all.filter(r => r.qty > 0).length, low: all.filter(r => r.state === 'low').length, out: all.filter(r => r.qty <= 0).length, all: all.length };
  const head = `<div class="page-head"><div><p>Залишок рахується з отриманих закупівель і операцій: продажів, повернень, списань і коригувань.</p></div><div class="row">${moreMenu([['stock-min', `Мінімальний залишок: ${fmtNum(isNum(d.settings.stockMin) ? d.settings.stockMin : DEFAULT_MIN)} шт`], ['stock-legacy', 'Закупівлі до запуску обліку']])}<button class="btn primary hide-m" data-act="stock-op">+ Операція</button></div></div>`;
  const tile = (k, v, s = '', cls = '') => `<div class="tile ${cls}"><span class="k">${k}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const tiles = `<section class="tiles stk-tiles" aria-label="Підсумки за вибраними фільтрами">
    ${tile('Позицій у наявності', fmtNum(t.positions))}
    ${tile('Одиниць', fmtNum(t.units))}
    ${tile('Вартість за собівартістю', fmtMoney(t.costValue), t.costMissing ? `без собівартості: ${qtyText(t.costMissing)}` : '')}
    ${tile('Вартість у роздрібних цінах', fmtMoney(t.retailValue), t.noRetail.positions ? `без ціни: ${t.noRetail.positions} ${plural(t.noRetail.positions, 'позиція', 'позиції', 'позицій')}, ${qtyText(t.noRetail.units)}` : '')}
    ${tile('Потенційний валовий прибуток', signedMoney(t.gross), t.noRetail.positions ? 'лише товари з роздрібною ціною' : '', 'accent')}
  </section>`;
  const legacyN = ledger.legacy.length, unlinked = ledger.unlinked.length;
  const callouts = (legacyN ? `<div class="callout row stk-call"><span>${legacyN} ${plural(legacyN, 'отримана закупівля внесена', 'отримані закупівлі внесені', 'отриманих закупівель внесено')} до запуску обліку й не входять у залишки, щоб старі покупки не рахувались як поточний товар.</span><button class="btn sm" data-act="stock-legacy">Переглянути</button></div>` : '')
    + (unlinked ? `<div class="callout warn stk-call">${unlinked} ${plural(unlinked, 'позиція', 'позиції', 'позицій')} отриманих закупівель без назви й товару не враховано. Відкрийте закупівлю й виберіть товар.</div>` : '');
  const toolbar = `<div class="toolbar stk-toolbar">
    <label class="search">${svg('search')}<input class="input" id="f-stockQ" data-filter="stockQ" placeholder="Пошук: назва або артикул" value="${esc(f.stockQ)}" aria-label="Пошук товарів у наявності"></label>
    <select class="input" id="f-stockCat" data-filter="stockCat" aria-label="Категорія">${opt('', 'Усі категорії', f.stockCat)}${cats.map(c => opt(c, c, f.stockCat)).join('')}${opt(NONE, 'Без категорії', f.stockCat)}</select>
    <select class="input" id="f-stockSup" data-filter="stockSup" aria-label="Постачальник">${opt('', 'Усі постачальники', f.stockSup)}${supIds.map(id => opt(id, supplierName(id), f.stockSup)).join('')}${opt(NONE, 'Не вказано', f.stockSup)}</select>
    <select class="input" id="f-stockSort" data-filter="stockSort" aria-label="Сортування">${STOCK_SORTS.map(([k, l]) => opt(k, l, f.stockSort)).join('')}</select>
  </div>
  <div class="quick-row"><div class="chips quick-chips" role="group" aria-label="Наявність">${AVAIL.map(([k, l]) => `<button class="chip ${f.stockAvail === k ? 'on' : ''} ${counts[k] ? '' : 'zero'}" data-act="stock-avail" data-v="${k}" aria-pressed="${f.stockAvail === k}">${l} <span class="muted">${counts[k]}</span></button>`).join('')}</div>
  <p class="found" aria-live="polite">Показано ${list.length} з ${all.length}</p></div>`;
  if (!d.products.length) return head + '<div class="empty mini"><div class="empty-copy"><p>Товарів ще немає. Додайте їх у «Товари та ціни» або через закупівлю зі статусом «Отримано».</p></div></div>';
  const empty = f.stockAvail === 'in' && !counts.in && !f.stockQ && !f.stockCat && !f.stockSup
    ? `<div class="empty mini"><div class="empty-copy"><p>Товару в наявності поки немає. Він з’явиться, коли закупівля отримає статус «Отримано», або додайте залишок вручну операцією «Коригування».</p><button class="btn sm primary" data-act="stock-op" data-type="adjust">Внести залишок</button></div></div>`
    : '<p class="muted">Нічого не знайдено за цими умовами.</p>';
  return head + tiles + callouts + toolbar + (list.length ? stockTable(list) + stockCompact(list) : empty) + `<details class="explain"><summary>Як рахується</summary><div class="formula">
    <span><b>Собівартість</b> — середньозважена ціна одиниці в залишку після знижки постачальника: нова партія змінює її пропорційно кількості. Доставку не включено.</span>
    <span><b>Націнка</b> = (роздрібна ціна − собівартість) ÷ собівартість × 100%. Приклад: 100 ₴ і 60% → 160 ₴, прибуток 60 ₴ з одиниці. Маржа рахується від роздрібної ціни, тут це 37,5%.</span>
    <span><b>Залишок</b> = отримані закупівлі + повернення придатного товару − продажі − списання − повернення постачальнику ± коригування. Заплановані й замовлені закупівлі не враховуються.</span>
    <span>Зміна собівартості не змінює встановлену роздрібну ціну. Якщо собівартість змінилась, біля ціни з’явиться позначка.</span></div></details>`;
};

function stockTable(list) {
  return `<div class="table-wrap stk-table hide-m"><table class="t"><thead><tr><th class="stk-ph"><span class="sr">Фото</span></th><th>Товар</th><th>Категорія</th><th>Постачальник</th><th class="r">Залишок</th><th class="r">Собівартість / од.</th><th class="r">Націнка</th><th class="r">Роздріб</th><th class="r">Прибуток / од.</th><th class="acts"><span class="sr">Дії</span></th></tr></thead><tbody>
  ${list.map(r => `<tr class="stk-row ${r.state}">
    <td class="stk-ph"><span class="pl-photo">${r.p.photos?.length ? photoImg(r.p.photos[0], '', r.p.name) : svg('products')}</span></td>
    <td class="stk-name"><button type="button" class="stk-open" data-act="stock-open" data-id="${r.p.id}">${esc(r.p.name)}</button>${r.p.sku ? `<span class="small muted">арт. ${esc(r.p.sku)}</span>` : ''}${variantsHtml(r)}</td>
    <td class="small">${r.p.category ? esc(r.p.category) : '<span class="muted">—</span>'}</td>
    <td class="stk-sup">${supLinks(r.suppliers, r.p.id, { short: true })}</td>
    <td class="r stk-qty"><b>${fmtNum(r.qty)}</b>${stateLabel(r) ? `<div>${stateLabel(r)}</div>` : ''}</td>
    <td class="r">${money(r.cost)}</td>
    <td class="r">${isNum(r.markup) ? signedPct(r.markup) : '—'}</td>
    <td class="r stk-retail">${retailCell(r)}</td>
    <td class="r ${isNum(r.profit) && r.profit < 0 ? 'bad' : ''}">${isNum(r.profit) ? signedMoney(r.profit) : '—'}</td>
    <td class="acts"><button type="button" class="btn sm" data-act="stock-op" data-id="${r.p.id}">Операція</button><button type="button" class="btn sm ghost" data-act="stock-price" data-id="${r.p.id}">Ціна</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}
function stockCompact(list) {
  return `<div class="stk-m only-m" role="list">${list.map(r => `<article class="stk-card ${r.state}" role="listitem">
    <div class="stk-card-h"><button type="button" class="stk-open" data-act="stock-open" data-id="${r.p.id}">${esc(r.p.name)}</button><span class="stk-cap">${supLinks(r.suppliers, null, { short: true })}</span></div>
    <div class="stk-card-v"><span><span class="k">Залишок</span><b>${fmtNum(r.qty)}</b></span><span><span class="k">Собівартість</span><b>${money(r.cost)}</b></span><span><span class="k">Роздріб</span>${isNum(r.retail) ? `<b>${fmtMoney(r.retail)}</b>` : '<b class="stk-noprice">Ціну не встановлено</b>'}</span></div>
    ${stateLabel(r) ? `<div class="stk-card-s">${stateLabel(r)}</div>` : ''}
  </article>`).join('')}</div>`;
}

/* ---------- Деталі: партії за постачальниками, операції ---------- */
export function stockDetails(id) {
  const d = D(), p = Repo.get('products', id); if (!p) return;
  const ledger = stockLedger(d), r = stockRows(d, ledger).find(x => x.p.id === id), s = ledger.products.get(id);
  const back = () => stockDetails(id);
  const batches = s ? s.batches : [], moves = s ? [...s.moves].reverse() : [];
  const kv = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const body = `<div class="modal-b stk-detail">
    <div class="stk-d-head"><span class="pl-photo">${p.photos?.length ? photoImg(p.photos[0], '', p.name) : svg('products')}</span><div><h3>${esc(p.name)}</h3><p class="small muted">${[p.sku ? 'арт. ' + esc(p.sku) : '', p.category ? esc(p.category) : ''].filter(Boolean).join(' · ') || 'Без категорії'}</p><p class="small">Постачальник: ${supLinks(r.suppliers, p.id)}</p></div></div>
    <div class="calc-preview stk-kpi">${kv('Залишок', `${fmtNum(r.qty)} ${unitWord(unitOf(p), r.qty)}`)}${isNum(p.packQty) && p.packQty > 1 ? kv('В упаковці', `${fmtNum(p.packQty)} ${unitWord(unitOf(p), p.packQty)}`) : ''}${kv('Собівартість / од.', money(r.cost))}${kv('Роздріб', isNum(r.retail) ? fmtMoney(r.retail) : 'Ціну не встановлено')}${kv('Націнка', isNum(r.markup) ? signedPct(r.markup) : '—')}${kv('Прибуток / од.', isNum(r.profit) ? signedMoney(r.profit) : '—')}${kv('Вартість залишку', r.qty > 0 && isNum(r.cost) ? fmtMoney(Math.round(r.qty * r.cost * 100) / 100) : '—')}</div>
    ${costMoved(r) ? `<div class="callout warn">Собівартість змінилась після встановлення ціни: була ${fmtMoney(p.retailCostBase)}, зараз ${fmtMoney(r.cost)}. Роздрібну ціну не змінено. <button type="button" class="btn sm" data-d-price>Перевірити ціну</button></div>` : ''}
    ${r.variants.some(v => v.size || v.color) ? `<h4 class="pv-sub">Розміри й кольори</h4><div class="stk-vars big">${r.variants.map(v => `<span class="stk-var ${v.qty <= 0 ? 'zero' : ''}">${esc(variantLabel(v) || 'Без розміру')} <b>${fmtNum(v.qty)}</b></span>`).join('')}</div>` : ''}
    <h4 class="pv-sub">Партії <span class="muted small">${batches.length}</span></h4>
    ${batches.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Дата</th><th>Закупівля</th><th>Постачальник</th><th class="r">К-сть</th><th class="r">Ціна / од.</th><th class="r">Собівартість / од.</th></tr></thead><tbody>${batches.map(b => `<tr><td>${fmtDate(b.date)}</td><td><button type="button" class="btn link" data-d-pur="${b.purchaseId}">${esc(b.title || 'Закупівля')}</button>${variantLabel(b) ? `<div class="small muted">${esc(variantLabel(b))}</div>` : ''}</td><td>${b.supplierId && supplierName(b.supplierId) ? `<button type="button" class="sup-link" data-d-sup="${b.supplierId}">${esc(supplierName(b.supplierId))}</button>` : '<span class="sup-none">Не вказано</span>'}</td><td class="r">${fmtNum(b.qty)}</td><td class="r">${money(b.unitPrice)}</td><td class="r">${money(b.unitCost)}${b.discountPct ? `<div class="small muted">знижка ${String(b.discountPct).replace('.', ',')}%</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="small muted">Отриманих закупівель цього товару ще немає.</p>'}
    <h4 class="pv-sub">Операції <span class="muted small">${moves.length}</span></h4>
    ${moves.length ? `<div class="list stk-moves">${moves.map(m => `<div class="li"><div class="t"><span class="nm">${MOVE_TYPES[m.type]}${m.type === 'return' && m.resellable === false ? ' (непридатний)' : ''}${m.variant ? ` · ${esc(m.variant)}` : ''}</span><span class="small muted">${fmtDate(m.date)}${m.type === 'sale' && isNum(m.unitPrice) ? ` · ${fmtMoney(m.unitPrice)} / од.` : ''}${m.reason ? ` · ${esc(m.reason)}` : ''}${m.supplierId && supplierName(m.supplierId) ? ` · ${esc(supplierName(m.supplierId))}` : ''}</span></div><b class="stk-mq ${m.sign > 0 ? 'in' : m.sign < 0 ? 'out' : ''}">${m.sign > 0 ? '+' : m.sign < 0 ? '−' : ''}${fmtNum(m.qty)}</b><button type="button" class="btn sm ghost" data-d-move="${m.id}">Змінити</button></div>`).join('')}</div>`
      : '<p class="small muted">Продажів, повернень і списань ще немає.</p>'}
  </div>`;
  openModal({ title: 'Товар у наявності', wide: true, body,
    foot: `<div class="modal-f"><button class="btn" type="button" data-d-card style="margin-right:auto">Картка товару</button><button class="btn" type="button" data-d-price>Ціна</button><button class="btn primary" type="button" data-d-op>+ Операція</button></div>`,
    onMount: m => {
      hydratePhotos(m);
      m.addEventListener('click', e => {
        const t = e.target; let x;
        if (t.closest('[data-d-op]')) moveForm(null, { productId: id }, back);
        else if (t.closest('[data-d-price]')) stockPriceForm(id, back);
        else if (t.closest('[data-d-card]')) STOCK_ACTIONS.productView(id);
        else if ((x = t.closest('[data-d-move]'))) moveForm(x.dataset.dMove, {}, back);
        else if ((x = t.closest('[data-d-pur]'))) STOCK_ACTIONS.purchaseForm(x.dataset.dPur);
        else if ((x = t.closest('[data-d-sup]')) || (x = t.closest('[data-act="open-supplier"]'))) { closeModal(); STOCK_ACTIONS.openSupplier(x.dataset.dSup || x.dataset.id); }
        else if ((x = t.closest('[data-act="stock-bind-sup"]'))) bindSupplier(id, back);
      });
    } });
}

/* ---------- Операція з товаром ---------- */
const IN_TYPES = new Set(['return']);
export function moveForm(id, preset = {}, back) {
  const old = id ? Repo.get('moves', id) : null;
  const v = old || { type: preset.type || 'sale', productId: preset.productId || '', qty: null, date: todayISO(), direction: 'in', resellable: true };
  const prods = pickableProducts(D(), { keep: [v.productId] }).sort((a, b) => byText(a.name, b.name));
  const hiddenN = D().products.length - pickableProducts(D(), { keep: [v.productId] }).length;
  const vOpts = pid => {
    const s = stockLedger(D()).products.get(pid); const list = s ? s.variants : [];
    const cur = variantKey(v.size, v.color);
    const opts = list.map(x => `<option value="${esc(x.key)}" data-size="${esc(x.size)}" data-color="${esc(x.color)}" ${old && x.key === cur ? 'selected' : ''}>${esc(variantLabel(x) || 'Без розміру й кольору')} · ${fmtNum(x.qty)} шт</option>`);
    if (!list.length) opts.unshift(`<option value="|" data-size="" data-color="" ${old && cur === '|' ? 'selected' : ''}>Без розміру й кольору</option>`);
    return opts.join('') + '<option value="__new">Інший розмір чи колір…</option>';
  };
  const typeOpts = Object.entries(MOVE_TYPES);
  formModal({
    title: old ? 'Операція з товаром' : 'Нова операція', onClose: back,
    fields: `${F.select('type', 'Операція', v.type, typeOpts)}
      <label class="field"><span class="lbl">Товар *</span><select class="input" name="productId" id="fld-productId" data-search><option value="">— виберіть товар —</option>${prods.map(p => `<option value="${p.id}" ${p.id === v.productId ? 'selected' : ''}>${esc(p.name)}${p.sku ? ' · ' + esc(p.sku) : ''}</option>`).join('')}</select>${hiddenN ? `<span class="hint">Приховано ${hiddenN} ${plural(hiddenN, 'товар', 'товари', 'товарів')} постачальників, у яких товари сховано. Повернути — кнопкою «Показати товари» в постачальника.</span>` : ''}</label>
      <label class="field"><span class="lbl">Розмір / колір</span><select class="input" name="variant" id="fld-variant"></select></label>
      <div class="field mv-new" id="mv-new" hidden><span class="lbl">Новий варіант</span><div class="i-var"><input class="input" name="size" placeholder="Розмір" maxlength="40" value="${esc(old ? old.size : '')}"><input class="input" name="color" placeholder="Колір" maxlength="40" value="${esc(old ? old.color : '')}"></div></div>
      <div class="field" data-for="adjust"><span class="lbl">Напрям</span><div class="seg" role="radiogroup"><label><input type="radio" name="direction" value="in" ${v.direction !== 'out' ? 'checked' : ''}>Додати</label><label><input type="radio" name="direction" value="out" ${v.direction === 'out' ? 'checked' : ''}>Зменшити</label></div></div>
      ${F.money('qty', 'Кількість, шт *', v.qty)}
      ${F.date('date', 'Дата', v.date)}
      <div data-for="sale">${F.money('unitPrice', 'Ціна продажу за од., ₴', v.type === 'sale' ? v.unitPrice : null, { hint: 'Типово — роздрібна ціна товару.' })}</div>
      <div data-for="return">${F.money('refund', 'Повернуто покупцю за од., ₴', v.type === 'return' ? v.unitPrice : null)}</div>
      <label class="check full" data-for="return"><input type="checkbox" name="resellable" ${v.resellable !== false ? 'checked' : ''}> Товар придатний до продажу — повернути в залишок</label>
      <div data-for="adjust-in">${F.money('unitCost', 'Собівартість за од., ₴', v.unitCost, { hint: 'Для товару, якого немає в закупівлях. Порожньо — за поточною середньою.' })}</div>
      <label class="field" data-for="supplier_return"><span class="lbl">Постачальник</span><select class="input" name="supplierId" id="fld-mvsup"></select></label>
      <div class="full" data-for="reason">${F.text('reason', 'Причина', v.reason, { full: true, ph: 'Напр.: інвентаризація, пересорт, брак' })}</div>
      ${F.area('note', 'Коментар', v.note, { rows: 2 })}
      <div class="full small muted" id="mv-info" aria-live="polite"></div>`,
    onMount: m => {
      const form = m.querySelector('form');
      const sync = () => {
        const type = form.type.value, dir = form.querySelector('[name=direction]:checked').value, pid = form.productId.value;
        m.querySelectorAll('[data-for]').forEach(el => {
          const keys = el.dataset.for.split(' ');
          el.hidden = !keys.some(k => k === type || (k === 'adjust-in' && type === 'adjust' && dir === 'in') || (k === 'reason' && (type === 'adjust' || type === 'writeoff')));
        });
        const lbl = m.querySelector('[data-for="reason"] .lbl'); if (lbl) lbl.textContent = type === 'adjust' ? 'Причина *' : 'Причина';
        m.querySelector('#mv-new').hidden = form.variant.value !== '__new';
        const r = pid && stockRows(D()).find(x => x.p.id === pid);
        m.querySelector('#mv-info').textContent = r ? `Зараз у наявності: ${fmtNum(r.qty)} шт${isNum(r.cost) ? `, собівартість ${fmtMoney(r.cost)} / од.` : ''}${isNum(r.retail) ? `, роздріб ${fmtMoney(r.retail)}` : ''}.` : '';
      };
      const onProduct = (first) => {
        const pid = form.productId.value;
        form.variant.innerHTML = pid ? vOpts(pid) : '<option value="|">—</option>';
        if (first && old && !stockLedger(D()).products.get(pid)?.variants.some(x => x.key === variantKey(old.size, old.color)) && variantKey(old.size, old.color) !== '|') form.variant.value = '__new';
        const r = pid && stockRows(D()).find(x => x.p.id === pid);
        const sups = r ? r.suppliers.filter(supplierName) : [];
        form.supplierId.innerHTML = `<option value="">— не вказано —</option>${sups.map(s => `<option value="${s}" ${old && old.supplierId === s ? 'selected' : ''}>${esc(supplierName(s))}</option>`).join('')}`;
        if (!old && sups.length === 1) form.supplierId.value = sups[0];
        if (!first || !old) { const p = pid && Repo.get('products', pid); if (p && form.type.value === 'sale' && !form.unitPrice.value && isNum(p.retailPrice)) form.unitPrice.value = String(p.retailPrice).replace('.', ','); }
        sync();
      };
      form.productId.addEventListener('change', () => onProduct(false));
      form.addEventListener('change', e => { if (e.target.name === 'type') onProduct(false); else sync(); });
      onProduct(true);
    },
    read: (fd, form) => {
      const errors = {}, type = g(fd, 'type'), productId = g(fd, 'productId');
      if (!productId) errors.productId = 'Виберіть товар.';
      const qty = parseNum(g(fd, 'qty'));
      if (qty === null) errors.qty = 'Вкажіть кількість.'; else if (Number.isNaN(qty) || qty <= 0) errors.qty = 'Кількість має бути більшою за нуль.';
      let size = '', color = '';
      if (form.variant.value === '__new') { size = g(fd, 'size'); color = g(fd, 'color'); if (!size && !color) errors.size = 'Вкажіть розмір або колір.'; }
      else { const o = form.variant.selectedOptions[0]; size = o ? o.dataset.size || '' : ''; color = o ? o.dataset.color || '' : ''; }
      const num = k => { const n = parseNum(g(fd, k)); if (Number.isNaN(n) || (isNum(n) && n < 0)) { errors[k] = 'Введіть невід’ємне число.'; return null; } return n; };
      const date = dateField(fd, 'date', errors) || todayISO();
      const reason = g(fd, 'reason');
      if (type === 'adjust' && !reason) errors.reason = 'Для коригування причина обов’язкова.';
      const direction = fd.get('direction') === 'out' ? 'out' : 'in';
      const values = { type, productId, size, color, qty: isNum(qty) ? qty : null, date, note: g(fd, 'note'),
        unitPrice: type === 'sale' ? num('unitPrice') : type === 'return' ? num('refund') : null,
        resellable: type === 'return' ? fd.has('resellable') : true,
        direction: type === 'adjust' ? direction : 'in',
        unitCost: type === 'adjust' && direction === 'in' ? num('unitCost') : null,
        supplierId: type === 'supplier_return' ? (g(fd, 'supplierId') || null) : null,
        reason: type === 'adjust' || type === 'writeoff' ? reason : '' };
      return { errors, values };
    },
    onDelete: old ? async () => {
      try { assertStock(D(), [{ collection: 'moves', action: 'remove', id: old.id }]); } catch (ex) { toast('Не можна видалити: ' + ex.message, 'error'); back && back(); return; }
      if (await confirmDialog({ title: 'Видалити операцію?', text: `<p style="margin:0">${MOVE_TYPES[old.type]} · ${fmtNum(old.qty)} шт від ${fmtDate(old.date)}. Залишок буде перераховано.</p>` })) { await Repo.remove('moves', old.id); toast('Операцію видалено, залишок перераховано'); }
      back && back();
    } : null,
    save: async vals => {
      const op = old ? { collection: 'moves', action: 'update', id: old.id, fields: vals } : { collection: 'moves', action: 'create', id: uid(), fields: vals };
      assertStock(D(), [op]);
      await Repo.commit([op]);
      toast(old ? 'Операцію змінено, залишок перераховано' : `${MOVE_TYPES[vals.type]}: ${moveSign(vals) > 0 ? '+' : moveSign(vals) < 0 ? '−' : ''}${fmtNum(vals.qty)} шт`);
    },
  });
}

/* ---------- Роздрібна ціна: через націнку або вручну ---------- */
export function stockPriceForm(id, back) {
  const p = Repo.get('products', id); if (!p) return;
  const r = stockRows(D()).find(x => x.p.id === id);
  const cost = isNum(r.cost) ? r.cost : r.catalogCost, fromStock = isNum(r.cost);
  const mk = markupOf(cost, p.retailPrice);
  const pctStr = n => (isNum(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
  formModal({
    title: 'Роздрібна ціна', onClose: back,
    fields: `<div class="full qr-ctx"><b>${esc(p.name)}</b><span>Собівартість за одиницю: ${isNum(cost) ? `<b>${fmtMoney(cost)}</b> ${fromStock ? '<span class="muted">(середня в залишку, після знижки)</span>' : '<span class="muted">(з картки товару)</span>'}` : '<span class="muted">невідома — націнку не розрахувати</span>'}</span></div>
      ${F.money('markup', 'Націнка, %', pctStr(mk), { hint: 'Роздріб = собівартість × (1 + націнка ÷ 100).' })}
      ${F.money('retail', 'Роздрібна ціна, ₴', p.retailPrice, { hint: 'Або введіть ціну вручну — націнка порахується сама.' })}
      <div class="full calc-preview" id="sp-prev"></div>
      ${costMoved(r) ? `<div class="full callout warn">Ціну встановлено, коли собівартість була ${fmtMoney(p.retailCostBase)}. Зараз ${fmtMoney(r.cost)}.</div>` : ''}`,
    onMount: m => {
      const form = m.querySelector('form'), prev = m.querySelector('#sp-prev');
      const show = () => { const rt = parseNum(form.retail.value); const ok = isNum(rt) && rt >= 0;
        prev.innerHTML = `<div><span>Прибуток / од.</span><b>${ok && isNum(cost) ? signedMoney(rt - cost) : '—'}</b></div><div><span>Націнка</span><b>${ok ? signedPct(markupOf(cost, rt)) : '—'}</b></div><div><span>Маржа</span><b>${ok ? signedPct(Calc.margin(cost, rt)) : '—'}</b></div>`; };
      form.markup.addEventListener('input', () => { const n = parseNum(form.markup.value); if (isNum(n) && isNum(cost)) form.retail.value = String(retailFromMarkup(cost, n)).replace('.', ','); show(); });
      form.retail.addEventListener('input', () => { const n = parseNum(form.retail.value); form.markup.value = isNum(n) && isNum(cost) && cost > 0 ? pctStr(markupOf(cost, n)) : ''; show(); });
      show();
    },
    read: fd => {
      const errors = {}; const n = parseNum(g(fd, 'retail'));
      if (n === null) errors.retail = 'Вкажіть ціну або націнку.'; else if (Number.isNaN(n) || n < 0) errors.retail = 'Ціна має бути невід’ємним числом.';
      const mkv = parseNum(g(fd, 'markup')); if (Number.isNaN(mkv) || (isNum(mkv) && mkv <= -100)) errors.markup = 'Націнка має бути числом більшим за −100.';
      return { errors, values: { retailPrice: isNum(n) ? Math.round(n * 100) / 100 : null, retailCostBase: isNum(cost) ? Math.round(cost * 100) / 100 : null } };
    },
    save: async vals => { await Repo.update('products', id, vals); toast('Роздрібну ціну збережено'); },
  });
}

/* ---------- Прив’язка постачальника, мінімальний залишок, старі закупівлі ---------- */
export function bindSupplier(id, back) {
  const p = Repo.get('products', id); if (!p) return;
  const sups = [...D().suppliers].sort((a, b) => byText(a.name, b.name));
  if (!sups.length) { toast('Спершу додайте постачальника в розділі «Постачальники»'); return; }
  formModal({ title: 'Постачальник товару', onClose: back,
    fields: `<p class="full pv-ctx"><b>${esc(p.name)}</b></p>${F.select('supplierId', 'Постачальник', p.supplierId || '', [['', '— не вказано —'], ...sups.map(s => [s.id, s.name])], { full: true, hint: 'Історія партій не змінюється: вона завжди показує, від кого прийшла кожна партія.' })}`,
    read: fd => ({ errors: {}, values: { supplierId: g(fd, 'supplierId') || null } }),
    save: async vals => { await Repo.update('products', id, vals); toast(vals.supplierId ? 'Постачальника вказано' : 'Постачальника прибрано'); } });
}
function stockMinForm() {
  const cur = D().settings.stockMin;
  formModal({ title: 'Мінімальний залишок', fields: `${F.money('min', 'Закінчується, якщо менше ніж, шт', isNum(cur) ? cur : DEFAULT_MIN, { full: true, hint: 'Такі товари підсвічуються й потрапляють у фільтр «Закінчуються».' })}`,
    read: fd => { const n = parseNum(g(fd, 'min')); return Number.isNaN(n) || n === null || n < 0 ? { errors: { min: 'Вкажіть число від 0.' } } : { errors: {}, values: { stockMin: n } }; },
    save: async vals => { await Repo.setSettings(vals); toast('Мінімальний залишок збережено'); } });
}
export function legacyModal() {
  const list = D().purchases.filter(p => p.status === 'received' && p.stockMode === 'legacy').sort((a, b) => (b.receivedDate || b.updatedAt).localeCompare(a.receivedDate || a.updatedAt));
  openModal({ title: 'Закупівлі до запуску обліку', wide: true,
    body: `<div class="modal-b"><p class="small muted" style="margin:0">Ці закупівлі отримано до появи обліку залишків, тому їхні товари не рахуються як поточні: частину могли вже продати. Якщо товар із закупівлі ще повністю на місці, врахуйте її. Якщо лише частина — краще внести фактичний залишок операцією «Коригування».</p>
      ${list.length ? `<div class="list">${list.map(p => { const n = (p.items || []).reduce((a, i) => a + (isNum(i.qty) ? i.qty : 0), 0); return `<div class="li"><div class="t"><span class="nm">${esc(p.title)}</span><span class="small muted">${p.supplierId && supplierName(p.supplierId) ? esc(supplierName(p.supplierId)) + ' · ' : ''}${(p.items || []).length} ${plural((p.items || []).length, 'позиція', 'позиції', 'позицій')}, ${fmtNum(n)} шт · ${fmtMoney(Calc.purchaseTotal(p).items)}</span></div><button type="button" class="btn sm" data-lg-open="${p.id}">Відкрити</button><button type="button" class="btn sm primary" data-lg-count="${p.id}">Врахувати</button></div>`; }).join('')}</div>` : '<p class="muted">Таких закупівель немає.</p>'}</div>`,
    foot: '<div class="modal-f"><button class="btn" data-close>Закрити</button><button class="btn primary" data-lg-adjust>Внести залишок вручну</button></div>',
    onMount: m => m.addEventListener('click', async e => {
      const t = e.target; let x;
      if ((x = t.closest('[data-lg-open]'))) STOCK_ACTIONS.purchaseForm(x.dataset.lgOpen);
      else if (t.closest('[data-lg-adjust]')) moveForm(null, { type: 'adjust' });
      else if ((x = t.closest('[data-lg-count]'))) {
        const p = Repo.get('purchases', x.dataset.lgCount); if (!p) return;
        const plan = planReceipt(D(), { ...p, stockMode: 'auto', receivedDate: p.receivedDate || p.expectedDate || String(p.updatedAt).slice(0, 10) }, uid);
        const ops = [...plan.ops, { collection: 'purchases', action: 'update', id: p.id, fields: { stockMode: 'auto', receivedDate: plan.purchase.receivedDate, items: plan.purchase.items } }];
        try { assertStock(D(), ops); await Repo.commit(ops); } catch (ex) { toast('Не вдалося: ' + ex.message, 'error'); return; }
        toast(`«${p.title}» враховано в залишках`, null, async () => { const back = [{ collection: 'purchases', action: 'update', id: p.id, fields: { stockMode: 'legacy' } }]; try { assertStock(D(), back); await Repo.commit(back); toast('Скасовано'); } catch (ex) { toast('Не вдалося скасувати: ' + ex.message, 'error'); } });
        legacyModal();
      }
    }) });
}

/** Дії сторінки. Залежності з інших модулів підставляє events.js. */
export const STOCK_ACTIONS = {
  productView: () => {}, purchaseForm: () => {}, openSupplier: () => {},
  'stock-op': el => moveForm(null, { productId: el.dataset.id || '', type: el.dataset.type }),
  'stock-open': el => stockDetails(el.dataset.id),
  'stock-price': el => stockPriceForm(el.dataset.id),
  'stock-bind-sup': el => bindSupplier(el.dataset.id),
  'stock-min': () => stockMinForm(),
  'stock-legacy': () => legacyModal(),
};
