import { itemFromProduct } from './cart.js';
import { guessSection } from './sections.js';
import { isNum, nowISO, todayISO, uid } from './utils.js';

/* =====================================================================
   ІМПОРТ У КОШИК: список товарів із кошиків оптовиків (файл komfort-cart-import).
   Лише додає: наявні постачальники й товари не змінюються і не дублюються,
   позиції, що вже лежать у кошику, пропускаються.
   ===================================================================== */
export const IMPORT_FORMAT = 'komfort-cart-import';
const MAX_ITEMS = 500;
const s = (v, n = 300) => String(v ?? '').trim().slice(0, n);
const key = v => s(v).toLowerCase().replace(/[«»"'`’]/g, '').replace(/\s+/g, ' ');
const domain = v => s(v).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

/** Перевіряє файл і готує план. Повертає {ok, errors} або {ok, plan}. */
export function planCartImport(obj, data, now = nowISO()) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || obj.format !== IMPORT_FORMAT) return { ok: false, errors: ['Це не файл імпорту в кошик.'] };
  const sups = Array.isArray(obj.suppliers) ? obj.suppliers : [];
  const rows = Array.isArray(obj.items) ? obj.items : [];
  if (!rows.length) errors.push('У файлі немає товарів.');
  if (rows.length > MAX_ITEMS) errors.push(`Забагато товарів (${rows.length}), максимум ${MAX_ITEMS}.`);
  const supByKey = new Map();
  const suppliers = [];
  for (const x of sups) {
    const name = s(x.name, 120); if (!name || !x.key) continue;
    const found = data.suppliers.find(y => (x.website && domain(y.website) && domain(y.website) === domain(x.website)) || key(y.name) === key(name));
    const rec = found || { id: uid(), name, website: s(x.website, 200), status: 'contact', categories: [], createdAt: now, updatedAt: now };
    supByKey.set(s(x.key, 60), { rec, isNew: !found });
    if (!found) suppliers.push(rec);
  }
  const products = [], cart = [], lines = [];
  rows.forEach((r, i) => {
    const n = i + 1, name = s(r.name, 200), sup = supByKey.get(s(r.supplier, 60));
    const qty = Number(r.qty), price = r.purchasePrice === null || r.purchasePrice === '' ? null : Number(r.purchasePrice);
    const pack = r.priceType === 'pack', packQty = pack && isNum(Number(r.packQty)) && Number(r.packQty) > 0 ? Number(r.packQty) : null;
    if (!name) return errors.push(`Рядок ${n}: немає назви.`);
    if (!sup) return errors.push(`Рядок ${n} («${name}»): невідомий постачальник.`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return errors.push(`Рядок ${n} («${name}»): кількість має бути цілим числом від 1.`);
    if (price !== null && (!isNum(price) || price < 0)) return errors.push(`Рядок ${n} («${name}»): некоректна ціна.`);
    const supplierId = sup.rec.id;
    let product = data.products.find(p => p.supplierId === supplierId && key(p.name) === key(name)) || products.find(p => p.supplierId === supplierId && key(p.name) === key(name));
    const isNewProduct = !product;
    if (!product) {
      const sec = guessSection(name, data.settings.sections) || { category: '', subcategory: '' };
      product = { id: uid(), name, supplierId, sku: s(r.sku, 60), url: s(r.url, 300), sizes: s(r.sizes, 60), colors: '', unit: r.unit === 'pair' ? 'pair' : 'pcs',
        priceType: pack ? 'pack' : 'unit', purchasePrice: price, packQty, retailPrice: null, priceDate: todayISO(), comment: s(r.comment, 500), photos: [], category: sec.category, subcategory: sec.subcategory, createdAt: now, updatedAt: now };
      products.push(product);
    }
    const inCart = data.cart.some(c => c.kind === 'item' && c.productId === product.id) || cart.some(c => c.productId === product.id);
    const line = { name, supplier: sup.rec.name, qty, price, pack, packQty: product.packQty, unit: product.unit, isNewProduct, inCart, catalogPrice: isNewProduct ? null : product.purchasePrice };
    lines.push(line);
    if (inCart) return;
    cart.push({ ...itemFromProduct(product, now), qty, price, buyBy: pack ? 'pack' : 'unit', packQty: pack ? packQty : null });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, plan: { suppliers, products, cart, lines, newSuppliers: [...supByKey.values()].filter(x => x.isNew).length } };
}
