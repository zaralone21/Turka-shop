import { Calc } from './calc.js';
import { byText, isNum } from './utils.js';

/* Розділи товарів: розділ (наприклад, «Шкарпетки») і підрозділи («Махрові», «Стрейч»…).
   У товарі розділ — поле category, підрозділ — subcategory. Постачальник належить до розділів через categories. */
/* Типові розділи. Підрозділ — [назва, слова для розпізнавання за назвою товару].
   Порядок важливий: при розкладанні береться перший збіг, тож вужчі підрозділи стоять раніше. */
const DEFAULTS = [
  ['Труси', [
    ['Менструальні', ['менстру']], ['Безшовні', ['безшов', 'лазерн']], ['Стрінги', ['стрінг', 'стринг', 'танга']],
    ['Бразиліана', ['бразил']], ['Боксери', ['боксер', 'транк']], ['Шорти', ['шорт']], ['Сліпи', ['сліп', 'слип']],
    ['Бікіні', ['бікіні', 'бикини']], ['Хіпстери', ['хіпстер', 'хипстер']], ['Високі', ['висок', 'завищ', 'утягу', 'моделю', 'корегу', 'коригу']],
    ['Дитячі', ['дитяч', 'для хлопч', 'для дівч']], ['Набори', ['набір', 'набор', 'комплект']],
  ]],
  ['Шкарпетки', [
    ['Без резинки', ['без резин', 'без гумк', 'медичн', 'діабет']], ['Махрові', ['махр']], ['Сліди', ['слід', 'невидим', 'підслід']],
    ['Капронові', ['капрон', 'den']], ['Термо та вовняні', ['термо', 'вовн', 'шерст', 'ангор', 'кашемір', 'альпак', 'тепл']],
    ['Бамбукові', ['бамбук']], ['Спортивні', ['спорт', 'бігов', 'трекінг']], ['Стрейч', ['стрейч', 'стреч', 'еластан']],
    ['Високі та гольфи', ['висок', 'гольф', 'гетр', 'панчіш']], ['Короткі', ['коротк', 'укороч', 'низьк', 'ультракоротк']],
    ['З принтом', ['принт', 'малюнк', 'новоріч', 'прикол', 'весел', 'яскрав']], ['Дитячі', ['дитяч']],
    ['Бавовняні', ['бавовн', 'котон', 'хлопок']], ['Набори', ['набір', 'набор', 'комплект']],
  ]],
  ['Піжами', [
    ['Кігурумі', ['кігурум', 'кигурум', 'комбінезон']], ['Нічні сорочки', ['нічн', 'сорочк', 'пеньюар']],
    ['Шовкові та сатинові', ['шовк', 'сатин', 'атлас']], ['Теплі', ['фліс', 'велюр', 'махр', 'тепл', 'утепл', 'плюш', 'велсофт']],
    ['З шортами', ['шорт']], ['Капрі', ['капрі', 'бридж']], ['Зі штанами', ['штан', 'брюк']],
    ['Чоловічі', ['чолов']], ['Дитячі', ['дитяч']], ['Для пар', ['для пар', 'парн', 'family']],
  ]],
  ['Тапки', [
    ['Тапки-іграшки', ['іграшк', 'звір', 'тварин', 'зайч', 'зайц', 'ведмед', 'єдиноріг', 'котик', 'капібар']],
    ['Готельні', ['готел', 'одноразов']], ['Чуні та угги', ['чуні', 'угг', 'валян', 'сапожк', 'чобот']],
    ['В’язані', ['в\'яз', 'в’яз', 'вяз']], ['Шльопанці', ['шльоп', 'в\'єтнам', 'в’єтнам', 'сланц']],
    ['Відкриті', ['відкрит', 'без задника']], ['Закриті', ['закрит', 'з задник']],
    ['Чоловічі', ['чолов']], ['Дитячі', ['дитяч']],
  ]],
  ['Колготи', [
    ['Ажурні та сітка', ['ажур', 'сітк', 'візерун']], ['Теплі', ['тепл', 'термо', 'фліс', 'вовн', 'начос', 'хутр', 'кашемір']],
    ['Моделюючі', ['моделю', 'корегу', 'коригу', 'push', 'пуш']], ['Панчохи', ['панчох', 'чулк']],
    ['Тонкі (до 20 den)', []], ['Середні (30–40 den)', []], ['Щільні (50+ den)', []],
    ['Дитячі', ['дитяч']],
  ]],
  ['Халати', [
    ['Кімоно', ['кімоно', 'кимоно']], ['Вафельні', ['вафел']], ['Махрові', ['махр']], ['Шовкові та сатинові', ['шовк', 'сатин', 'атлас']],
    ['Плюшеві та велсофт', ['велсофт', 'плюш', 'велюр', 'травк', 'хутр', 'мікрофібр']], ['Флісові', ['фліс']],
    ['Бавовняні', ['бавовн', 'котон', 'трикотаж']], ['Чоловічі', ['чолов']], ['Дитячі', ['дитяч']],
  ]],
];
export const DEFAULT_SECTIONS = DEFAULTS.map(([name, subs]) => ({ name, subs: subs.map(x => x[0]) }));
const SUB_KEYS = new Map(DEFAULTS.flatMap(([sec, subs]) => subs.map(([n, k], i) => [`${sec.toLowerCase()}|${n.toLowerCase()}`, { keys: k, rank: i }])));
/** Версія типових розділів. Коли вона росте, нові типові підрозділи додаються до збережених. */
export const SECTIONS_REV = 2;
/** Додає до збережених розділів типові розділи й підрозділи, яких там ще немає. */
export function mergeDefaultSections(list) {
  const out = list.map(s => ({ name: s.name, subs: [...s.subs] }));
  for (const d of DEFAULT_SECTIONS) {
    const cur = out.find(s => s.name.toLowerCase() === d.name.toLowerCase());
    if (!cur) { out.push({ name: d.name, subs: [...d.subs] }); continue; }
    const have = new Set(cur.subs.map(x => x.toLowerCase()));
    cur.subs.push(...d.subs.filter(x => !have.has(x.toLowerCase())));
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
  const order = [...sec.subs].sort((a, b) => (info(a)?.rank ?? 999) - (info(b)?.rank ?? 999));
  const hit = order.find(x => keys(x).some(k => t.includes(k)));
  if (hit) return hit;
  const den = /(\d{2,3})\s*(den|ден)/.exec(t);
  if (den && sec.name.toLowerCase() === 'колготи') {
    const n = +den[1], want = n <= 20 ? 'тонкі' : n <= 40 ? 'середні' : 'щільні';
    return sec.subs.find(x => x.toLowerCase().startsWith(want)) || '';
  }
  return '';
}

/** Зміни, що розкладають товари й постачальників по розділах. Наявні розділи не перезаписуються. */
export function planRegroup(d) {
  const sections = d.settings.sections, names = new Set(sections.map(s => s.name));
  const products = [];
  for (const p of d.products) {
    if (names.has(p.category)) { // розділ уже вибрано, шукаємо лише підрозділ
      const sub = p.subcategory ? '' : guessSub(p.name, sections.find(s => s.name === p.category));
      if (sub) products.push({ id: p.id, name: p.name, from: p.category, to: { category: p.category, subcategory: sub } });
      continue;
    }
    const g = guessSection(p.name, sections) || guessSection(p.category, sections);
    if (!g) continue;
    const to = { category: g.category, subcategory: p.subcategory || g.subcategory || guessSub(p.name, sections.find(s => s.name === g.category)) };
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
