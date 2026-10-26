import { Calc } from './calc.js';
import { byText, isNum } from './utils.js';

/* Розділи товарів: розділ (наприклад, «Шкарпетки») і підрозділи («Махрові», «Стрейч»…).
   У товарі розділ — поле category, підрозділ — subcategory. Постачальник належить до розділів через categories. */
/* Типові розділи. Підрозділ — [назва, слова для розпізнавання за назвою товару, пріоритет].
   При розкладанні береться перший збіг за пріоритетом (менший — раніше, типово — за порядком у списку).
   Підрозділ зі словами null — запасний: його отримує товар розділу, для якого нічого іншого не підійшло. */
const DEFAULTS = [
  ['Труси', [
    ['Сліпи', ['сліп', 'слип', 'бікіні', 'бикини', 'хіпстер']], ['Боксери та шорти', ['боксер', 'транк', 'шорт']],
    ['Стрінги та бразиліана', ['стрінг', 'стринг', 'танга', 'бразил']], ['Високі та моделюючі', ['висок', 'завищ', 'утягу', 'моделю', 'корегу', 'коригу']],
    ['Безшовні', ['безшов', 'лазерн'], 0.5], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1], ['Інші', null],
  ]],
  ['Шкарпетки', [
    ['Класичні', null], ['З принтом', ['принт', 'напис', 'малюнк', 'вишив', 'вишиван', 'новоріч', 'прикол', 'весел', 'патріот', 'з картинк', 'фото']],
    ['Зимові', ['зимов', 'тепл', 'термо', 'вовн', 'шерст', 'махр', 'ангор', 'кашемір', 'альпак'], 0.5],
    ['Спортивні', ['спорт', 'бігов', 'трекінг', 'фітнес'], 0.4], ['Короткі та сліди', ['слід', 'невидим', 'коротк', 'укороч', 'низьк'], 0.6],
    ['Без резинки', ['без резин', 'без гумк', 'медичн', 'діабет'], 0.3], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1],
  ]],
  ['Піжами', [
    ['Зі штанами', ['штан', 'брюк']], ['З шортами', ['шорт', 'капрі', 'бридж'], 0.5], ['Нічні сорочки', ['нічн', 'сорочк', 'пеньюар'], 0.4],
    ['Теплі', ['фліс', 'велюр', 'махр', 'тепл', 'утепл', 'плюш', 'велсофт', 'зимов', 'кігурум', 'кигурум'], -0.5], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1], ['Інші', null],
  ]],
  ['Тапки', [
    ['Закриті', ['закрит', 'з задник']], ['Відкриті', ['відкрит', 'без задника', 'шльоп', 'в’єтнам', "в'єтнам", 'сланц']],
    ['Тапки-іграшки', ['іграшк', 'звір', 'тварин', 'зайч', 'зайц', 'ведмед', 'єдиноріг', 'котик', 'капібар'], -0.5],
    ['Чуні та угги', ['чуні', 'угг', 'валян', 'сапожк', 'чобот'], -0.4], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1], ['Інші', null],
  ]],
  ['Колготи', [
    ['Тонкі (до 20 den)', []], ['Середні (30–40 den)', []], ['Щільні (50+ den)', []],
    ['Теплі', ['тепл', 'термо', 'фліс', 'вовн', 'начос', 'хутр', 'кашемір', 'зимов'], 0.3],
    ['Фантазійні', ['ажур', 'сітк', 'візерун', 'принт', 'моделю', 'корегу', 'панчох'], 0.4], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1], ['Інші', null],
  ]],
  ['Халати', [
    ['Махрові та вафельні', ['махр', 'вафел']], ['Теплі', ['велсофт', 'плюш', 'велюр', 'травк', 'хутр', 'мікрофібр', 'фліс', 'тепл', 'зимов']],
    ['Легкі', ['шовк', 'сатин', 'атлас', 'кімоно', 'кимоно', 'бавовн', 'котон', 'трикотаж', 'літн', 'легк']], ['Дитячі', ['дитяч', 'для хлопч', 'для дівч', 'для дітей'], -1], ['Інші', null],
  ]],
];
export const DEFAULT_SECTIONS = DEFAULTS.map(([name, subs]) => ({ name, subs: subs.map(x => x[0]) }));
const SUB_KEYS = new Map(DEFAULTS.flatMap(([sec, subs]) => subs.map(([n, k, prio], i) => [`${sec.toLowerCase()}|${n.toLowerCase()}`, { keys: k || [], fallback: k === null, rank: prio ?? i }])));
/* Типові підрозділи попередніх версій: при оновленні вони замінюються новими, власні підрозділи лишаються. */
const OLD_SUBS = {
  'труси': ['Менструальні', 'Безшовні', 'Стрінги', 'Бразиліана', 'Боксери', 'Шорти', 'Сліпи', 'Бікіні', 'Хіпстери', 'Високі', 'Дитячі', 'Набори'],
  'шкарпетки': ['Без резинки', 'Махрові', 'Сліди', 'Капронові', 'Термо та вовняні', 'Бамбукові', 'Спортивні', 'Стрейч', 'Високі та гольфи', 'Короткі', 'З принтом', 'Дитячі', 'Бавовняні', 'Набори'],
  'піжами': ['Кігурумі', 'Нічні сорочки', 'Шовкові та сатинові', 'Теплі', 'З шортами', 'Капрі', 'Зі штанами', 'Чоловічі', 'Дитячі', 'Для пар'],
  'тапки': ['Тапки-іграшки', 'Готельні', 'Чуні та угги', 'В’язані', 'Шльопанці', 'Відкриті', 'Закриті', 'Чоловічі', 'Дитячі'],
  'колготи': ['Ажурні та сітка', 'Теплі', 'Моделюючі', 'Панчохи', 'Тонкі (до 20 den)', 'Середні (30–40 den)', 'Щільні (50+ den)', 'Дитячі'],
  'халати': ['Кімоно', 'Вафельні', 'Махрові', 'Шовкові та сатинові', 'Плюшеві та велсофт', 'Флісові', 'Бавовняні', 'Чоловічі', 'Дитячі'],
};
/** Версія типових розділів. Коли вона росте, збережені розділи оновлюються до нових типових. */
export const SECTIONS_REV = 3;
/** Типові розділи отримують нові типові підрозділи (старі типові прибираються, власні лишаються); відсутні типові розділи додаються. */
export function mergeDefaultSections(list) {
  const out = list.map(s => ({ name: s.name, subs: [...s.subs] }));
  for (const d of DEFAULT_SECTIONS) {
    const cur = out.find(s => s.name.toLowerCase() === d.name.toLowerCase());
    if (!cur) { out.push({ name: d.name, subs: [...d.subs] }); continue; }
    const old = new Set((OLD_SUBS[d.name.toLowerCase()] || []).map(x => x.toLowerCase()));
    const fresh = new Set(d.subs.map(x => x.toLowerCase()));
    cur.subs = [...d.subs, ...cur.subs.filter(x => !old.has(x.toLowerCase()) && !fresh.has(x.toLowerCase()))];
  }
  return normalizeSections(out);
}
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
  return { category: sec.name, subcategory: guessSub(t, sec) };
}
/** Підрозділ за текстом: слова типового підрозділу або основа його назви; для колгот — за щільністю den. */
export function guessSub(text, sec) {
  const t = String(text || '').toLowerCase();
  const info = x => SUB_KEYS.get(`${sec.name.toLowerCase()}|${x.toLowerCase()}`);
  const keys = x => [...(info(x)?.keys || []), stem(x.replace(/\s*\(.*\)$/, ''))];
  // типові підрозділи перевіряються у своєму порядку (вужчі раніше), власні — після них
  const order = sec.subs.filter(x => !info(x)?.fallback).sort((a, b) => (info(a)?.rank ?? 999) - (info(b)?.rank ?? 999));
  const hit = order.find(x => keys(x).some(k => t.includes(k)));
  if (hit) return hit;
  const den = /(\d{2,3})\s*(den|ден)/.exec(t);
  if (den && sec.name.toLowerCase() === 'колготи') {
    const n = +den[1], want = n <= 20 ? 'тонкі' : n <= 40 ? 'середні' : 'щільні';
    const d = sec.subs.find(x => x.toLowerCase().startsWith(want)); if (d) return d;
  }
  return sec.subs.find(x => info(x)?.fallback) || '';
}

/** Зміни, що розкладають товари й постачальників по розділах. Наявні розділи й підрозділи зі списку не перезаписуються. */
export function planRegroup(d) {
  const sections = d.settings.sections, names = new Set(sections.map(s => s.name));
  const products = [];
  for (const p of d.products) {
    if (names.has(p.category)) { // розділ уже вибрано, шукаємо лише підрозділ
      const sec = sections.find(s => s.name === p.category);
      // підрозділ лишається, якщо він є в списку розділу; інакше (порожній чи застарілий) підбирається заново
      const sub = sec.subs.includes(p.subcategory) ? '' : guessSub(p.name, sec);
      if (sub) products.push({ id: p.id, name: p.name, from: [p.category, p.subcategory].filter(Boolean).join(' › '), to: { category: p.category, subcategory: sub } });
      continue;
    }
    const g = guessSection(p.name, sections) || guessSection(p.category, sections);
    if (!g) continue;
    const sec = sections.find(s => s.name === g.category);
    const to = { category: g.category, subcategory: sec.subs.includes(p.subcategory) ? p.subcategory : guessSub(`${p.name} ${p.category}`, sec) };
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
  ['name', 'Назва: А–Я'], ['name-desc', 'Назва: Я–А'],
  ['cost-asc', 'Закупівля: від дешевих'], ['cost-desc', 'Закупівля: від дорогих'],
  ['retail-asc', 'Роздріб: від дешевих'], ['retail-desc', 'Роздріб: від дорогих'],
  ['diff-desc', 'Різниця / од.: від більшої'], ['diff-asc', 'Різниця / од.: від меншої'],
  ['margin-desc', 'Маржа: від більшої'], ['margin-asc', 'Маржа: від меншої'],
  ['new', 'Нещодавно додані'], ['updated', 'Нещодавно оновлені'],
];
const num = v => (isNum(v) ? v : null);
const time = v => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
/** Порівняння з відсутніми значеннями завжди в кінці, незалежно від напрямку. */
const cmpNum = (a, b, dir) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);
const metric = {
  cost: p => num(Calc.unitCost(p)),
  retail: p => num(p.retailPrice),
  diff: p => num(Calc.diff(Calc.unitCost(p), p.retailPrice)),
  margin: p => num(Calc.margin(Calc.unitCost(p), p.retailPrice)),
  new: p => time(p.createdAt),
  updated: p => time(p.updatedAt || p.createdAt),
};
const nm = p => String(p.name || '');
const tie = (a, b) => byText(nm(a), nm(b)) || String(a.id).localeCompare(String(b.id));
export function sortProducts(list, key) {
  if (key === 'name-desc') return [...list].sort((a, b) => byText(nm(b), nm(a)) || tie(a, b));
  const [m, d] = key === 'new' || key === 'updated' ? [key, 'desc'] : String(key).split('-');
  const f = metric[m], dir = d === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => (f ? cmpNum(f(a), f(b), dir) : 0) || tie(a, b));
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
