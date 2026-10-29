import { uid } from './utils.js';

/* =====================================================================
   РОЗДІЛИ ТОВАРІВ УСЕРЕДИНІ ПОСТАЧАЛЬНИКА
   У кожного постачальника власний список розділів (supplier.sections: [{id, name}]),
   товар посилається на розділ полем supplierSectionId. Немає розділу — «Без розділу».
   ===================================================================== */
export const SEC_ALL = '';
export const SEC_NONE = '__none';

export const sectionsOf = s => (s && Array.isArray(s.sections) ? s.sections : []);
/** Розділ товару в межах його постачальника або null («Без розділу»), якщо розділу вже немає. */
export function sectionIdOf(p, s) {
  const id = p && p.supplierSectionId;
  return id && s && p.supplierId === s.id && sectionsOf(s).some(x => x.id === id) ? id : null;
}
/** Кількість товарів: усього, у кожному розділі та без розділу. */
export function sectionCounts(products, s) {
  const out = { [SEC_ALL]: products.length, [SEC_NONE]: 0 };
  for (const x of sectionsOf(s)) out[x.id] = 0;
  for (const p of products) { const id = sectionIdOf(p, s); out[id === null ? SEC_NONE : id]++; }
  return out;
}
const hay = p => [p.name, p.sku, p.comment, p.colors, p.sizes, p.category, p.subcategory].join(' ').toLowerCase();
/** Товари вибраного розділу з пошуком. «Усі товари» — пошук по всьому асортименту постачальника. */
export function filterBySection(products, s, key, query = '') {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter(p => {
    if (key === SEC_NONE ? sectionIdOf(p, s) !== null : key && sectionIdOf(p, s) !== key) return false;
    if (!words.length) return true;
    const h = hay(p); return words.every(w => h.includes(w));
  });
}
/** Ключ вибраного розділу, якщо він ще існує; інакше «Усі товари». */
export const validKey = (s, key) => (key === SEC_NONE || sectionsOf(s).some(x => x.id === key) ? key : SEC_ALL);

/**
 * Перевіряє зміни списку розділів. rows — [{id?, name}] у новому порядку.
 * Повертає {ok, sections, errors, removed}: removed — розділи, що зникнуть (їхні товари перейдуть у «Без розділу»).
 */
export function planSections(current, rows) {
  const errors = [], seen = new Map(), sections = [];
  rows.forEach((r, i) => {
    const name = String(r.name || '').trim().replace(/\s+/g, ' ');
    if (!name) { errors.push(`Рядок ${i + 1}: вкажіть назву розділу.`); return; }
    if (name.length > 60) { errors.push(`«${name.slice(0, 20)}…»: назва довша за 60 символів.`); return; }
    const k = name.toLowerCase();
    if (seen.has(k)) { errors.push(`Розділ «${name}» уже є.`); return; }
    seen.set(k, true);
    sections.push({ id: r.id && current.some(x => x.id === r.id) ? r.id : 'ss-' + uid().slice(0, 8), name });
  });
  if (sections.length > 100) errors.push('Не більше 100 розділів у постачальника.');
  const keep = new Set(sections.map(x => x.id));
  return { ok: !errors.length, errors, sections, removed: current.filter(x => !keep.has(x.id)) };
}

/** Постачальники, чиї товари приховано з вибору товару (операції, закупівлі). Каталог і залишки їх показують. */
export const hiddenSuppliers = d => new Set(d.suppliers.filter(s => s.productsHidden).map(s => s.id));
/** Товари для вибору: без прихованих постачальників; keep — id, які лишаються завжди (вже вибрані, свій постачальник). */
export function pickableProducts(d, { keep = [], supplierId = null } = {}) {
  const hid = hiddenSuppliers(d), k = new Set(keep.filter(Boolean));
  return d.products.filter(p => k.has(p.id) || !p.supplierId || !hid.has(p.supplierId) || p.supplierId === supplierId);
}
