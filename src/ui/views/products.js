import { Calc } from '../../core/calc.js';
import { byText, daysFromToday, esc, fmtDate, fmtMoney, fmtNum, fmtPct, isNum, plural, uniq } from '../../core/utils.js';
import { photoImg } from '../photos.js';
import { D, UI, VIEWS, emptyState, ext, supplierName } from '../shared.js';

/* ---------- 3. Товари ---------- */
export const FORMULAS = `<div class="formula">
  <span><b>Ціна одиниці</b> = ціна упаковки ÷ кількість одиниць в упаковці</span>
  <span><b>Націнка</b> = (роздрібна ціна − ціна одиниці) ÷ ціна одиниці × 100%</span>
  <span><b>Маржа</b> = (роздрібна ціна − ціна одиниці) ÷ роздрібна ціна × 100%</span></div>`;
export function productMobile(list, showSupplier) {
  return `<div class="m-list only-m">${list.map(p => {
    const c = Calc.unitCost(p), mk = Calc.markup(c, p.retailPrice), mg = Calc.margin(c, p.retailPrice);
    const sub = [p.category, showSupplier && (p.supplierId ? supplierName(p.supplierId) : 'без постачальника'), p.sku && 'арт. ' + p.sku].filter(Boolean).map(esc).join(' · ');
    const n = (p.photos || []).length;
    return `<button class="m-item ${n ? 'has-photo' : ''}" data-act="edit-product" data-id="${p.id}">${n ? `<span class="m-photo">${photoImg(p.photos[0], 'thumb', p.name)}${n > 1 ? `<i>${n}</i>` : ''}</span>` : ''}<div class="m-row"><b>${esc(p.name)}</b><span class="num">${fmtMoney(p.retailPrice)}</span></div>${sub ? `<div class="m-sub">${sub}</div>` : ''}
      <div class="m-metrics"><span>Закуп. од. <b>${fmtMoney(c)}</b></span><span>Націнка <b>${fmtPct(mk)}</b></span><span>Маржа <b style="${isNum(mg) && mg < 0 ? 'color:var(--danger)' : ''}">${fmtPct(mg)}</b></span></div>
      <div class="m-sub">${p.priceType === 'pack' ? `${fmtMoney(p.purchasePrice)} за уп. ${fmtNum(p.packQty)} шт · ` : ''}ціна від ${fmtDate(p.priceDate)}</div></button>`;
  }).join('')}</div>`;
}
const thumbBtn = p => { const n = (p.photos || []).length;
  return n ? `<button class="thumb-btn" data-act="product-photos" data-id="${p.id}" aria-label="Фото товару (${n})">${photoImg(p.photos[0], 'thumb', p.name)}${n > 1 ? `<i>${n}</i>` : ''}</button>` : ''; };
export function productTable(list, showSupplier) {
  return productMobile(list, showSupplier) + `<div class="table-wrap hide-m"><table class="t stack"><thead><tr><th>Товар</th><th>Категорія</th>${showSupplier ? '<th>Постачальник</th>' : ''}<th class="r">Закупівля</th><th class="r">Ціна од.</th><th class="r">Роздріб</th><th class="r">Націнка</th><th class="r">Маржа</th><th>Ціна від</th><th class="acts"><span class="sr">Дії</span></th></tr></thead><tbody>
  ${list.map(p => {
    const c = Calc.unitCost(p), mk = Calc.markup(c, p.retailPrice), mg = Calc.margin(c, p.retailPrice);
    const age = p.priceDate ? -daysFromToday(p.priceDate) : null;
    return `<tr>
      <td class="first" data-label="Товар">${thumbBtn(p)}<div>${esc(p.name)}</div><div class="small muted">${[p.sku && 'арт. ' + esc(p.sku), p.sizes && 'розм. ' + esc(p.sizes), p.colors && esc(p.colors)].filter(Boolean).join(' · ')}</div>${p.url ? `<div class="small">${ext(p.url)}</div>` : ''}${p.comment ? `<div class="small muted">${esc(p.comment)}</div>` : ''}</td>
      <td data-label="Категорія">${esc(p.category) || '—'}</td>
      ${showSupplier ? `<td data-label="Постачальник">${p.supplierId ? `<button class="btn sm ghost" style="padding:2px 4px" data-act="open-supplier" data-id="${p.supplierId}">${esc(supplierName(p.supplierId))}</button>` : '<span class="muted">не вказано</span>'}</td>` : ''}
      <td class="r" data-label="Закупівля"><span>${fmtMoney(p.purchasePrice)}${p.priceType === 'pack' ? `<br><span class="small muted">за уп. ${fmtNum(p.packQty)} шт</span>` : ''}</span></td>
      <td class="r" data-label="Ціна од.">${fmtMoney(c)}</td>
      <td class="r" data-label="Роздріб">${fmtMoney(p.retailPrice)}</td>
      <td class="r" data-label="Націнка">${fmtPct(mk)}</td>
      <td class="r" data-label="Маржа" style="${isNum(mg) && mg < 0 ? 'color:var(--danger)' : ''}">${fmtPct(mg)}</td>
      <td data-label="Ціна від">${fmtDate(p.priceDate)}${age !== null && age > 60 ? ' <span class="pill warn">стара</span>' : ''}</td>
      <td class="acts"><button class="btn sm" data-act="edit-product" data-id="${p.id}">Змінити</button> <button class="btn sm danger" data-act="del-product" data-id="${p.id}" aria-label="Видалити">✕</button></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}
VIEWS.products = () => {
  const d = D(); const q = UI.f.prodQ.trim().toLowerCase();
  const cats = uniq([...d.settings.productCategories, ...d.products.map(p => p.category).filter(Boolean)]).sort(byText);
  const list = d.products.filter(p => (!UI.f.prodCat || p.category === UI.f.prodCat)
    && (!UI.f.prodSup || (UI.f.prodSup === '__none' ? !p.supplierId : p.supplierId === UI.f.prodSup))
    && (!q || [p.name, p.sku, p.comment, p.colors, p.sizes, supplierName(p.supplierId)].join(' ').toLowerCase().includes(q))).sort((a, b) => byText(a.name, b.name));
  const head = `<div class="page-head"><div><h1>Товари та ціни</h1><p>${d.products.length} ${plural(d.products.length, 'товар', 'товари', 'товарів')}. Довідник цін без складського обліку.</p></div><button class="btn primary hide-m" data-act="add-product">+ Додати товар</button></div>`;
  if (!d.products.length) return head + emptyState('Додайте товар з ціною закупівлі та плановою роздрібною ціною, і націнка з маржею порахуються автоматично.', 'add-product', 'Додати перший товар') + FORMULAS;
  return head + `
  <div class="toolbar">
    <input class="input grow" id="f-prodQ" data-filter="prodQ" placeholder="Пошук: назва, артикул, коментар…" value="${esc(UI.f.prodQ)}" aria-label="Пошук товарів">
    <select class="input" id="f-prodCat" data-filter="prodCat" aria-label="Категорія"><option value="">Усі категорії</option>${cats.map(c => `<option ${UI.f.prodCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="input" id="f-prodSup" data-filter="prodSup" aria-label="Постачальник"><option value="">Усі постачальники</option><option value="__none" ${UI.f.prodSup === '__none' ? 'selected' : ''}>Без постачальника</option>${[...d.suppliers].sort((a, b) => byText(a.name, b.name)).map(s => `<option value="${s.id}" ${UI.f.prodSup === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
  </div>
  ${list.length ? productTable(list, true) : '<p class="muted">Нічого не знайдено за цими умовами.</p>'}
  ${FORMULAS}`;
};
