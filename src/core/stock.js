import { Calc } from './calc.js';
import { isNum } from './utils.js';

/* =====================================================================
   ЗАЛИШКИ ТОВАРІВ
   Залишок не зберігається окремим списком — він щоразу рахується з операцій:
   • надходження: позиції закупівель зі статусом «Отримано» (кожна закупівля — рівно один раз,
     тож повторне збереження не оприбутковує вдруге, а зміна чи скасування автоматично перераховує);
   • рух товару (колекція moves): продаж, повернення від покупця, списання, повернення постачальнику, коригування.
   Собівартість — середньозважена собівартість залишку (ковзна середня) за цінами після знижки постачальника.
   ===================================================================== */
export const MOVE_TYPES = {
  sale: 'Продаж', return: 'Повернення від покупця', writeoff: 'Списання', supplier_return: 'Повернення постачальнику', adjust: 'Коригування',
};
/** Чи збільшує операція залишок. Повернення непридатного товару залишок не змінює. */
export const moveSign = m => {
  if (m.type === 'return') return m.resellable === false ? 0 : 1;
  if (m.type === 'adjust') return m.direction === 'out' ? -1 : 1;
  return MOVE_TYPES[m.type] ? -1 : 0;
};
export const DEFAULT_MIN = 3;

const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ');
export const variantKey = (size, color) => `${norm(size).toLowerCase()}|${norm(color).toLowerCase()}`;
export const variantLabel = v => [norm(v.size), norm(v.color)].filter(Boolean).join(' · ');

/** Закупівля входить у залишки: отримана й не позначена як облікована до запуску обліку. */
export const countsInStock = p => p.status === 'received' && p.stockMode !== 'legacy';
export const receivedDateOf = p => p.receivedDate || p.expectedDate || String(p.updatedAt || p.createdAt || '').slice(0, 10);

/**
 * Рахує залишки з операцій. Повертає {products: Map(id → стан), unlinked, legacy, problems}.
 * Стан товару: qty, avgCost, variants[{key,size,color,qty}], batches (надходження), moves, suppliers.
 */
export function stockLedger(d) {
  const products = new Map(), prodIds = new Set(d.products.map(p => p.id));
  const st = id => {
    if (!products.has(id)) products.set(id, { qty: 0, avgCost: null, variants: new Map(), batches: [], moves: [], suppliers: [], received: 0 });
    return products.get(id);
  };
  const events = [], unlinked = [], legacy = [];
  for (const pu of d.purchases || []) {
    if (pu.status === 'received' && pu.stockMode === 'legacy') { legacy.push(pu); continue; }
    if (!countsInStock(pu)) continue;
    const lines = new Map(Calc.purchaseLines(pu).lines.map(l => [l.id, l]));
    for (const i of pu.items || []) {
      if (!i.productId || !prodIds.has(i.productId)) { unlinked.push({ purchase: pu, item: i }); continue; }
      if (!isNum(i.qty) || i.qty <= 0) continue;
      const l = lines.get(i.id);
      events.push({ sign: 1, src: 'purchase', productId: i.productId, size: i.size, color: i.color, qty: i.qty, unitCost: l ? l.unitNet : null, unitPrice: i.unitPrice,
        date: receivedDateOf(pu), order: 0, at: pu.createdAt || '', seq: events.length, id: pu.id + ':' + i.id, purchase: pu, supplierId: pu.supplierId || null });
    }
  }
  for (const m of d.moves || []) {
    if (!m.productId || !prodIds.has(m.productId) || !isNum(m.qty) || m.qty <= 0) continue;
    events.push({ sign: moveSign(m), src: 'move', productId: m.productId, size: m.size, color: m.color, qty: m.qty, unitCost: m.type === 'adjust' && isNum(m.unitCost) ? m.unitCost : null,
      date: m.date || String(m.createdAt || '').slice(0, 10), order: 1, at: m.createdAt || '', seq: events.length, id: m.id, move: m });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.at.localeCompare(b.at) || a.seq - b.seq);
  for (const e of events) {
    const s = st(e.productId), key = variantKey(e.size, e.color);
    const v = s.variants.get(key) || { key, size: norm(e.size), color: norm(e.color), qty: 0 };
    s.variants.set(key, v);
    if (e.sign > 0) {
      // Нова партія змінює середню собівартість; повернення без ціни — за поточною середньою.
      if (isNum(e.unitCost)) s.avgCost = s.qty > 0 && isNum(s.avgCost) ? (s.qty * s.avgCost + e.qty * e.unitCost) / (s.qty + e.qty) : e.unitCost;
      s.qty += e.qty; v.qty += e.qty;
    } else if (e.sign < 0) { s.qty -= e.qty; v.qty -= e.qty; }
    if (e.src === 'purchase') {
      s.received += e.qty;
      s.batches.push({ purchaseId: e.purchase.id, title: e.purchase.title, supplierId: e.supplierId, date: e.date, size: v.size, color: v.color, qty: e.qty, unitPrice: e.unitPrice, unitCost: e.unitCost, discountPct: Calc.discountPct(e.purchase) });
      if (e.supplierId && !s.suppliers.includes(e.supplierId)) s.suppliers.push(e.supplierId);
    } else s.moves.push({ ...e.move, sign: e.sign, variant: variantLabel(v) });
  }
  const problems = [];
  for (const [id, s] of products) {
    s.variants = [...s.variants.values()].filter(v => v.qty !== 0 || s.batches.some(b => variantKey(b.size, b.color) === v.key))
      .sort((a, b) => a.size.localeCompare(b.size, 'uk', { numeric: true }) || a.color.localeCompare(b.color, 'uk'));
    for (const v of s.variants) if (v.qty < 0) problems.push({ productId: id, size: v.size, color: v.color, qty: v.qty });
  }
  return { products, unlinked, legacy, problems };
}

/** Від’ємні залишки, які з’являться після зміни даних (лише ті, яких не було до неї). */
export function newProblems(before, after) {
  const was = new Set(stockLedger(before).problems.map(p => p.productId + variantKey(p.size, p.color)));
  return stockLedger(after).problems.filter(p => !was.has(p.productId + variantKey(p.size, p.color)));
}
export function problemText(d, list) {
  return list.map(p => { const pr = d.products.find(x => x.id === p.productId); const v = variantLabel(p); return `«${pr ? pr.name : 'товар'}${v ? ' · ' + v : ''}»: залишок став би ${String(p.qty).replace('-', '−')}`; }).join('; ');
}

/** Націнка = (роздрібна − собівартість) ÷ собівартість × 100. Не плутати з маржею. */
export const markupOf = (cost, retail) => Calc.markup(cost, retail);
/** Роздрібна ціна з націнки, до копійок. */
export const retailFromMarkup = (cost, pct) => (isNum(cost) && isNum(pct) ? Math.round(cost * (1 + pct / 100) * 100) / 100 : null);

/** Рядки розділу «Товари в наявності»: товар + стан залишку + ціни. */
export function stockRows(d, ledger = stockLedger(d)) {
  const min = isNum(d.settings.stockMin) ? d.settings.stockMin : DEFAULT_MIN;
  return d.products.map(p => {
    const s = ledger.products.get(p.id);
    const qty = s ? s.qty : 0;
    const known = s && isNum(s.avgCost);
    const cost = known ? s.avgCost : null;
    const lim = isNum(p.minStock) ? p.minStock : min;
    const state = qty <= 0 ? 'out' : qty < lim ? 'low' : 'in';
    const retail = isNum(p.retailPrice) ? p.retailPrice : null;
    const suppliers = [...new Set([...(p.supplierId ? [p.supplierId] : []), ...(s ? s.suppliers : [])])];
    return { p, s, qty, cost, catalogCost: Calc.unitCost(p), retail, min: lim, state, tracked: !!s, markup: markupOf(cost, retail), profit: isNum(cost) && isNum(retail) ? retail - cost : null, suppliers,
      variants: s ? s.variants : [] };
  });
}
/** Підсумки за відфільтрованими рядками. Товари без роздрібної ціни рахуються окремо. */
export function stockTotals(rows) {
  const t = { positions: 0, units: 0, costValue: 0, costMissing: 0, retailValue: 0, gross: 0, noRetail: { positions: 0, units: 0 } };
  for (const r of rows) {
    if (r.qty <= 0) continue;
    t.positions++; t.units += r.qty;
    if (isNum(r.cost)) t.costValue += r.qty * r.cost; else t.costMissing += r.qty;
    if (isNum(r.retail)) { t.retailValue += r.qty * r.retail; if (isNum(r.cost)) t.gross += r.qty * (r.retail - r.cost); }
    else { t.noRetail.positions++; t.noRetail.units += r.qty; }
  }
  const r2 = n => Math.round(n * 100) / 100;
  return { ...t, costValue: r2(t.costValue), retailValue: r2(t.retailValue), gross: r2(t.gross) };
}

/* ---------- Перевірка змін до збереження ---------- */
/**
 * Застосовує зміни до копії даних (без збереження), щоб заздалегідь порахувати залишки.
 * ops — [{collection, action: 'create'|'update'|'remove', id, fields}].
 */
export function applyOps(d, ops) {
  const out = { ...d };
  for (const o of ops) {
    const list = [...(out[o.collection] || [])];
    const i = list.findIndex(x => x.id === o.id);
    if (o.action === 'remove') { if (i >= 0) list.splice(i, 1); }
    else if (o.action === 'create') list.push({ ...o.fields, id: o.id });
    else if (i >= 0) list[i] = { ...list[i], ...o.fields };
    out[o.collection] = list;
  }
  return out;
}
/** Кидає помилку, якщо після змін залишок якогось товару чи варіанта став би від’ємним. */
export function assertStock(d, ops) {
  const bad = newProblems(d, applyOps(d, ops));
  if (bad.length) throw new Error(`залишок не може бути від’ємним — ${problemText(d, bad)}. Спершу виправте продажі чи списання цього товару або зробіть коригування`);
}

/* ---------- Оприбуткування закупівлі ---------- */
const nameKey = s => norm(s).toLowerCase();
/**
 * Вільні позиції отриманої закупівлі прив’язуються до товарів: до наявного товару з такою самою назвою
 * (того ж постачальника або без постачальника) чи до нового товару в каталозі. Товар без постачальника
 * отримує постачальника закупівлі. Повертає {purchase, ops, created} — ops для товарів, purchase з prodId.
 */
export function planReceipt(d, purchase, makeId) {
  if (!countsInStock(purchase)) return { purchase, ops: [], created: [] };
  const ops = [], created = [], products = [...d.products];
  const items = (purchase.items || []).map(i => {
    if (i.productId && products.some(p => p.id === i.productId)) return i;
    if (!norm(i.name)) return i;
    const same = products.filter(p => nameKey(p.name) === nameKey(i.name) && (!p.supplierId || !purchase.supplierId || p.supplierId === purchase.supplierId));
    const hit = same.find(p => p.supplierId && p.supplierId === purchase.supplierId) || same[0];
    if (hit) return { ...i, productId: hit.id };
    const fields = { name: norm(i.name), category: '', supplierId: purchase.supplierId || null, priceType: 'unit', purchasePrice: isNum(i.unitPrice) ? i.unitPrice : null,
      retailPrice: isNum(i.retailPrice) ? i.retailPrice : null, priceDate: receivedDateOf(purchase), sizes: norm(i.size), colors: norm(i.color), comment: `Створено під час отримання закупівлі «${purchase.title}».` };
    const id = makeId(); products.push({ ...fields, id }); ops.push({ collection: 'products', action: 'create', id, fields }); created.push(fields.name);
    return { ...i, productId: id };
  });
  if (purchase.supplierId) {
    const fixed = new Set();
    for (const i of items) {
      const p = i.productId && d.products.find(x => x.id === i.productId);
      if (p && !p.supplierId && !fixed.has(p.id)) { fixed.add(p.id); ops.push({ collection: 'products', action: 'update', id: p.id, fields: { supplierId: purchase.supplierId } }); }
    }
  }
  return { purchase: { ...purchase, items }, ops, created };
}
