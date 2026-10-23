import { Calc } from './calc.js';
import { byText, isNum } from './utils.js';

/* Розділи товарів: розділ (наприклад, «Шкарпетки») і підрозділи («Махрові», «Стрейч»…).
   У товарі розділ — поле category, підрозділ — subcategory. Постачальник належить до розділів через categories. */
export const DEFAULT_SECTIONS = [
  { name: 'Труси', subs: [] },
  { name: 'Шкарпетки', subs: ['Махрові', 'Стрейч', 'Без резинки'] },
  { name: 'Піжами', subs: [] },
  { name: 'Тапки', subs: [] },
  { name: 'Колготи', subs: [] },
  { name: 'Халати', subs: [] },
];
export const NO_SECTION = '__none';

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export function normalizeSections(v) {
  if (!Array.isArray(v)) return DEFAULT_SECTIONS.map(s => ({ name: s.name, subs: [...s.subs] }));
  const seen = new Set(), out = [];
  for (const x of v) {
    const name = clean(x && typeof x === 'object' ? x.name : x).slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue; seen.add(name.toLowerCase());
    const subs = [...new Set((Array.isArray(x?.subs) ? x.subs : []).map(s => clean(s).slice(0, 60)).filter(Boolean))].slice(0, 30);
    out.push({ name, subs });
  }
  return out.slice(0, 40);
}

/** Текст редактора: рядок на розділ, «Розділ: підрозділ, підрозділ». */
export const sectionsToText = list => list.map(s => s.subs.length ? `${s.name}: ${s.subs.join(', ')}` : s.name).join('\n');
export const textToSections = text => normalizeSections(String(text || '').split('\n').map(line => {
  const [name, rest = ''] = line.split(':');
  return { name, subs: rest.split(',') };
}));

/* Слова, за якими товар упізнається, крім самої назви розділу. */
const SYNONYMS = {
  'труси': ['трус', 'сліп', 'боксер', 'стрінг', 'бразиліан', 'бікіні', 'хіпстер'],
  'шкарпетки': ['шкарпет', 'носк', 'носоч', 'підслід', 'сліди'],
  'піжами': ['піжам', 'пижам'],
  'тапки': ['тапк', 'тапоч', 'тапці', 'капці'],
  'колготи': ['колгот'],
  'халати': ['халат'],
};
const stem = s => { s = s.toLowerCase(); return s.slice(0, Math.max(4, s.length - 2)); };
const keysOf = name => [stem(name), ...(SYNONYMS[name.toLowerCase()] || [])];

/** Вгадує розділ і підрозділ за текстом. Повертає {category, subcategory} або null. */
export function guessSection(text, sections) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  const sec = sections.find(s => keysOf(s.name).some(k => t.includes(k)));
  if (!sec) return null;
  const sub = sec.subs.find(x => t.includes(stem(x)));
  return { category: sec.name, subcategory: sub || '' };
}

/** Зміни, що розкладають товари й постачальників по розділах. Наявні розділи не перезаписуються. */
export function planRegroup(d) {
  const sections = d.settings.sections, names = new Set(sections.map(s => s.name));
  const products = [];
  for (const p of d.products) {
    const inSection = names.has(p.category);
    if (inSection && p.subcategory) continue;
    const g = guessSection(p.name, sections) || guessSection(p.category, sections);
    if (!g) continue;
    if (inSection && g.category !== p.category) { // розділ уже вибрано, шукаємо лише підрозділ
      const sub = guessSection(p.name, sections.filter(s => s.name === p.category))?.subcategory;
      if (sub) products.push({ id: p.id, name: p.name, from: p.category, to: { category: p.category, subcategory: sub } });
      continue;
    }
    const to = { category: g.category, subcategory: p.subcategory || g.subcategory };
    if (to.category !== p.category || to.subcategory !== p.subcategory) products.push({ id: p.id, name: p.name, from: p.category, to });
  }
  const suppliers = [];
  for (const s of d.suppliers) {
    const cats = [...new Set(s.categories.map(c => names.has(c) ? c : guessSection(c, sections)?.category || c))];
    // постачальник без категорій: розділи його товарів
    if (!cats.length) d.products.filter(p => p.supplierId === s.id).forEach(p => {
      const c = names.has(p.category) ? p.category : (guessSection(p.name, sections) || guessSection(p.category, sections))?.category;
      if (c && !cats.includes(c)) cats.push(c);
    });
    if (cats.join('\n') !== s.categories.join('\n')) suppliers.push({ id: s.id, name: s.name, to: { categories: cats } });
  }
  return { products, suppliers };
}

/** Порядок розділів: з налаштувань, потім інші знайдені в товарах, «без розділу» в кінці. */
export function sectionOrder(sections, products) {
  const names = sections.map(s => s.name);
  const extra = [...new Set(products.map(p => p.category).filter(c => c && !names.includes(c)))].sort(byText);
  return [...names, ...extra];
}

export const SORTS = [
  ['name', 'Назва А–Я'], ['retail-asc', 'Роздріб: дешевші'], ['retail-desc', 'Роздріб: дорожчі'],
  ['cost-asc', 'Закупівля: дешевші'], ['margin-desc', 'Маржа: більша'], ['new', 'Нові спочатку'],
];
const last = v => (isNum(v) ? v : null);
const cmpNum = (a, b, dir) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);
export function sortProducts(list, key) {
  const by = {
    'retail-asc': (a, b) => cmpNum(last(a.retailPrice), last(b.retailPrice), 1),
    'retail-desc': (a, b) => cmpNum(last(a.retailPrice), last(b.retailPrice), -1),
    'cost-asc': (a, b) => cmpNum(last(Calc.unitCost(a)), last(Calc.unitCost(b)), 1),
    'margin-desc': (a, b) => cmpNum(last(Calc.margin(Calc.unitCost(a), a.retailPrice)), last(Calc.margin(Calc.unitCost(b), b.retailPrice)), -1),
    'new': (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  }[key];
  return [...list].sort((a, b) => (by && by(a, b)) || byText(a.name, b.name));
}

/** Групи для показу: [{name, items, subs: [{name, items}]}]. Порожні групи пропускаються. */
export function groupProducts(list, sections, sortKey) {
  const order = sectionOrder(sections, list);
  const groups = [...order, ''].map(name => {
    const items = sortProducts(list.filter(p => (p.category || '') === name), sortKey);
    const known = sections.find(s => s.name === name)?.subs || [];
    const subNames = [...known, ...[...new Set(items.map(p => p.subcategory).filter(x => x && !known.includes(x)))].sort(byText), ''];
    const subs = subNames.map(sn => ({ name: sn, items: items.filter(p => (p.subcategory || '') === sn) })).filter(g => g.items.length);
    return { name, items, subs };
  });
  return groups.filter(g => g.items.length);
}
