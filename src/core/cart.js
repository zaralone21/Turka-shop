import { Calc } from './calc.js';
import { fmtMoney, fmtNum, isNum, nowISO, plural, uid } from './utils.js';

/* =====================================================================
   КОШИК ЗАКУПІВЕЛЬ: підбір товарів перед створенням запланованих закупівель.
   Позиція кошика зберігає власні кількість і погоджену ціну, тому зміни в каталозі
   її не переписують: розбіжності лише показуються для перевірки.
   Розрахунок ціни одиниці той самий, що й у каталозі (Calc.unitCost).
   ===================================================================== */

/** Одиниця товару: пара або штука (якщо в товарі не вказано, то штука). */
export const UNITS = { pcs: ['штука', 'штуки', 'штук', 'шт'], pair: ['пара', 'пари', 'пар', 'пар'] };
export const unitOf = p => (p && p.unit === 'pair' ? 'pair' : 'pcs');
export const unitWord = (u, n) => { const f = UNITS[u] || UNITS.pcs; return plural(n, f[0], f[1], f[2]); };
export const unitShort = u => (UNITS[u] || UNITS.pcs)[3];
export const packWord = n => plural(n, 'упаковка', 'упаковки', 'упаковок');
/** «за пару» / «за штуку» / «за упаковку». */
export const perLabel = it => (it.buyBy === 'pack' ? 'за упаковку' : it.unit === 'pair' ? 'за пару' : 'за штуку');

const cleanQty = v => (Number.isInteger(v) && v >= 1 && v <= 100000 ? v : null);
const packOf = p => (p.priceType === 'pack' ? (isNum(p.packQty) && p.packQty > 0 ? p.packQty : null) : null);

/** Знімок полів товару, від яких залежить позиція, щоб помітити зміни в каталозі. */
export const productSnapshot = p => ({ name: p.name, sku: p.sku || '', url: p.url || '', supplierId: p.supplierId || null, unit: unitOf(p), priceType: p.priceType === 'pack' ? 'pack' : 'unit', purchasePrice: isNum(p.purchasePrice) ? p.purchasePrice : null, packQty: packOf(p) });

/** Нова позиція з товару каталогу. Ціна — за одиницю закупівлі (штуку/пару або упаковку), як у товарі. */
export function itemFromProduct(p, now = nowISO()) {
  const s = productSnapshot(p);
  return { id: uid(), kind: 'item', productId: p.id, supplierId: s.supplierId, name: s.name, sku: s.sku, url: s.url, unit: s.unit,
    buyBy: s.priceType === 'pack' ? 'pack' : 'unit', packQty: s.packQty, qty: 1, price: s.purchasePrice, selected: true, src: s, createdAt: now, updatedAt: now };
}

/** Нормалізація запису кошика (позиція або доставка постачальника). */
export function normalizeCartRecord(x) {
  const num = v => (isNum(v) && v >= 0 ? v : null);
  if (x.kind === 'supplier') return { ...x, kind: 'supplier', supplierId: x.supplierId ? String(x.supplierId) : null, delivery: num(x.delivery) };
  return { ...x, kind: 'item', productId: x.productId ? String(x.productId) : null, supplierId: x.supplierId ? String(x.supplierId) : null,
    name: String(x.name ?? ''), sku: String(x.sku ?? ''), url: String(x.url ?? ''), unit: x.unit === 'pair' ? 'pair' : 'pcs',
    buyBy: x.buyBy === 'pack' ? 'pack' : 'unit', packQty: isNum(x.packQty) && x.packQty > 0 ? x.packQty : null,
    qty: cleanQty(x.qty) ?? 1, price: num(x.price), selected: x.selected !== false, src: x.src && typeof x.src === 'object' ? x.src : null };
}
export const deliveryId = supplierId => 'delivery-' + (supplierId || 'none');

/** Кількість одиниць (штук/пар) у позиції; null, якщо розмір упаковки невідомий. */
export const lineUnits = it => (it.buyBy === 'pack' ? (isNum(it.packQty) ? it.qty * it.packQty : null) : it.qty);
/** Сума позиції: кількість одиниць закупівлі × ціна за цю одиницю. Ціна упаковки на пари не множиться. */
export const lineSum = it => (isNum(it.price) ? it.qty * it.price : null);
/** «3 упаковки × 12 пар = 36 пар» або «5 пар». */
export function qtyText(it) {
  if (it.buyBy !== 'pack') return `${fmtNum(it.qty)} ${unitWord(it.unit, it.qty)}`;
  const u = lineUnits(it);
  return isNum(u) ? `${fmtNum(it.qty)} ${packWord(it.qty)} × ${fmtNum(it.packQty)} ${unitWord(it.unit, it.packQty)} = ${fmtNum(u)} ${unitWord(it.unit, u)}`
    : `${fmtNum(it.qty)} ${packWord(it.qty)}, кількість ${UNITS[it.unit][2]} в упаковці потребує уточнення`;
}

/** Що змінилось у каталозі після додавання позиції: [] — нічого; ['deleted'] — товар видалено. */
export function sourceChanges(it, product) {
  if (!it.productId) return [];
  if (!product) return ['deleted'];
  const a = it.src || {}, b = productSnapshot(product), out = [];
  if (a.name !== b.name) out.push('назва');
  if (a.purchasePrice !== b.purchasePrice || a.priceType !== b.priceType) out.push('закупівельна ціна');
  if (a.packQty !== b.packQty) out.push('розмір упаковки');
  if (a.unit !== b.unit) out.push('одиниця');
  if (a.supplierId !== b.supplierId) out.push('постачальник');
  if (a.sku !== b.sku || a.url !== b.url) out.push(a.sku !== b.sku ? 'артикул' : 'посилання');
  return out;
}
/** Поля позиції, оновлені з каталогу (кількість і вибір лишаються). */
export function refreshFromProduct(it, product) {
  const s = productSnapshot(product);
  return { name: s.name, sku: s.sku, url: s.url, unit: s.unit, supplierId: s.supplierId || it.supplierId, buyBy: s.priceType === 'pack' ? 'pack' : 'unit', packQty: s.packQty, price: s.purchasePrice, src: s };
}

/** Структурована умова мінімального замовлення постачальника (якщо записана числами). */
export function minOrderOf(s) {
  if (!s) return null;
  const sum = isNum(s.minOrderSum) && s.minOrderSum > 0 ? s.minOrderSum : null;
  const qty = isNum(s.minOrderQty) && s.minOrderQty > 0 ? s.minOrderQty : null;
  const unit = ['pcs', 'pair', 'pack'].includes(s.minOrderUnit) ? s.minOrderUnit : 'pcs';
  return sum || qty ? { sum, qty, unit } : null;
}
/** «від 3 000 ₴ або 150 пар». */
export const minOrderLabel = m => [m.sum && `від ${fmtMoney(m.sum)}`, m.qty && `від ${fmtNum(m.qty)} ${m.unit === 'pack' ? packWord(m.qty) : unitWord(m.unit, m.qty)}`].filter(Boolean).join(' · ').replace(/[\u00a0\u202f]/g, ' ');
/** Прогрес до мінімального замовлення для обраних позицій. Різні одиниці не додаються. */
export function minOrderProgress(min, selected) {
  if (!min) return [];
  const out = [];
  if (min.sum) {
    const known = selected.filter(i => isNum(i.price)); const sum = known.reduce((s, i) => s + lineSum(i), 0);
    const left = min.sum - sum;
    out.push({ kind: 'sum', ok: left <= 0, text: left > 0 ? `До мінімального замовлення залишилось ${fmtMoney(left)} (обрано ${fmtMoney(sum)} із ${fmtMoney(min.sum)})` : `Мінімальну суму ${fmtMoney(min.sum)} досягнуто`,
      note: known.length < selected.length ? 'Позиції без ціни не враховано.' : '' });
  }
  if (min.qty) {
    let n = 0, skipped = 0;
    for (const i of selected) {
      if (min.unit === 'pack') { if (i.buyBy === 'pack') n += i.qty; else skipped++; continue; }
      if (i.unit !== min.unit) { skipped++; continue; }
      const u = lineUnits(i); if (isNum(u)) n += u; else skipped++;
    }
    const word = k => (min.unit === 'pack' ? packWord(k) : unitWord(min.unit, k));
    out.push({ kind: 'qty', ok: n >= min.qty, text: `Обрано ${fmtNum(n)} із мінімальних ${fmtNum(min.qty)} ${word(min.qty)}`,
      note: skipped ? `${skipped} ${plural(skipped, 'позицію', 'позиції', 'позицій')} в інших одиницях або з невідомим розміром упаковки не враховано.` : '' });
  }
  return out;
}

/** Групи кошика за постачальниками: товари без постачальника — окремою групою в кінці. */
export function cartGroups(cart, suppliers, byText = (a, b) => a.localeCompare(b, 'uk')) {
  const items = cart.filter(x => x.kind === 'item');
  const deliveries = new Map(cart.filter(x => x.kind === 'supplier').map(x => [x.supplierId || null, x]));
  const name = id => suppliers.find(s => s.id === id)?.name || '';
  const ids = [...new Set(items.map(i => (i.supplierId && suppliers.some(s => s.id === i.supplierId) ? i.supplierId : null)))];
  ids.sort((a, b) => (a === null) - (b === null) || byText(name(a), name(b)));
  return ids.map(id => {
    const list = items.filter(i => (i.supplierId && suppliers.some(s => s.id === i.supplierId) ? i.supplierId : null) === id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
    const sel = list.filter(i => i.selected);
    const known = sel.filter(i => isNum(i.price));
    const goods = known.reduce((s, i) => s + lineSum(i), 0);
    const d = deliveries.get(id); const delivery = d && isNum(d.delivery) ? d.delivery : null;
    return { supplierId: id, supplier: suppliers.find(s => s.id === id) || null, items: list, selected: sel, goods, incomplete: known.length < sel.length, delivery, total: goods + (delivery ?? 0) };
  });
}
/** Підсумок для обраних позицій. Доставка без значення — «не врахована», 0 — безкоштовна. */
export function cartTotals(groups) {
  const active = groups.filter(g => g.selected.length);
  const goods = active.reduce((s, g) => s + g.goods, 0);
  const delivery = active.reduce((s, g) => s + (g.delivery ?? 0), 0);
  return { positions: active.reduce((n, g) => n + g.selected.length, 0), suppliers: active.length, goods, delivery, total: goods + delivery,
    incomplete: active.some(g => g.incomplete), noDelivery: active.filter(g => g.delivery === null), noSupplier: active.some(g => !g.supplierId),
    noPrice: active.flatMap(g => g.selected.filter(i => !isNum(i.price))) };
}

/**
 * Закупівля зі статусом «Заплановано» з обраних позицій групи в чинній моделі розділу «Закупівлі»:
 * qty — у штуках/парах, unitPrice — за одну штуку/пару, сума = qty × unitPrice.
 * Якщо розмір упаковки невідомий, позиція рахується упаковками, щоб не вигадувати кількість.
 */
export function purchaseFromGroup(g, { title, comment = '', now = nowISO() } = {}) {
  const items = g.selected.map(i => {
    const snap = { cartItemId: i.id, sku: i.sku, url: i.url, unit: i.unit, buyBy: i.buyBy, packQty: i.packQty, packs: i.buyBy === 'pack' ? i.qty : null, agreedPrice: i.price, priceFor: i.buyBy === 'pack' ? 'pack' : 'unit' };
    if (i.buyBy === 'pack' && isNum(i.packQty)) return { ...snap, id: uid(), productId: i.productId, name: i.name, qty: i.qty * i.packQty, unitPrice: Calc.unitCost({ priceType: 'pack', purchasePrice: i.price, packQty: i.packQty }), retailPrice: null };
    if (i.buyBy === 'pack') return { ...snap, id: uid(), productId: i.productId, name: `${i.name} (упаковки, кількість ${UNITS[i.unit][2]} уточнити)`, qty: i.qty, unitPrice: i.price, retailPrice: null };
    return { ...snap, id: uid(), productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.price, retailPrice: null };
  });
  return { id: uid(), title, supplierId: g.supplierId, status: 'planned', expectedDate: '', firstPurchase: false, items, deliveryCost: g.delivery, expenseId: null, comment, fromCart: true, createdAt: now, updatedAt: now };
}

/** Текст для постачальника: лише обрані товари, без роздрібних цін, маржі й внутрішніх коментарів. */
export function supplierListText(g) {
  const lines = [`Замовлення${g.supplier ? ` для «${g.supplier.name}»` : ''}`, 'Ціни орієнтовні, потребують підтвердження.', ''];
  g.selected.forEach((i, n) => {
    lines.push(`${n + 1}. ${i.name}${i.sku ? ` (арт. ${i.sku})` : ''}`);
    lines.push(`   Кількість: ${qtyText(i)}`);
    lines.push(isNum(i.price) ? `   Ціна: ${fmtMoney(i.price)} ${perLabel(i)}, сума ${fmtMoney(lineSum(i))}` : '   Ціна: уточнити');
    if (i.url) lines.push(`   ${i.url}`);
  });
  lines.push('', `Разом за товари: ${fmtMoney(g.goods)}${g.incomplete ? ' (без позицій, ціну яких треба уточнити)' : ''}`);
  return lines.join('\n').replace(/[  ]/g, ' ');
}
