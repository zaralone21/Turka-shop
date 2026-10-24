import { REMINDER_STATUSES, REPEATS, fireAt } from './reminders.js';
import { FITOUT_STATUSES, MONTHLY_KINDS, PREMISES_STATUSES } from './opening.js';
import { SECTIONS_REV, mergeDefaultSections, normalizeSections } from './sections.js';
import { APP_ID, SCHEMA_VERSION, isNum, nowISO, parseNum, splitList, uid } from './utils.js';

/* =====================================================================
   2. СХЕМА ДАНИХ: версія, порожній стан, міграції, нормалізація, перевірка
   Тут описано форму даних. Інтерфейс і сховище про неї знають лише через ці функції.
   ===================================================================== */
export const Schema = (() => {
  const BUDGET_CATEGORIES = [
    ['rent', 'Оренда'], ['deposit', 'Депозит (поворотний)'], ['repair', 'Ремонт'], ['furniture', 'Меблі'],
    ['equipment', 'Обладнання'], ['signage', 'Вивіска'], ['first_stock', 'Перша закупівля'],
    ['packaging', 'Пакування'], ['ads', 'Реклама'], ['other', 'Інше'],
  ].map(([id, name]) => ({ id, name, builtin: true, refundable: id === 'deposit' }));
  const PRODUCT_CATEGORIES = ['Білизна', 'Шкарпетки', 'Домашні тапки', 'Колготки', 'Піжами та домашній одяг', 'Аксесуари', 'Супутні товари'];
  const SUPPLIER_STATUSES = { interested: 'Цікавий', contact: 'Зв’язатися', working: 'Працюємо', rejected: 'Не підійшов' };
  const TASK_STATUSES = { planned: 'Заплановано', in_progress: 'У роботі', done: 'Виконано' };
  const PRIORITIES = { high: 'Високий', medium: 'Середній', low: 'Низький' };
  const PURCHASE_STATUSES = { planned: 'Заплановано', ordered: 'Замовлено', awaiting: 'Очікується доставка', received: 'Отримано', cancelled: 'Скасовано' };
  const LINK_TYPES = { task: 'Завдання', supplier: 'Постачальник', purchase: 'Закупівля', premises: 'Приміщення', fitout: 'Облаштування', monthly: 'Щомісячна витрата' };
  /** Колекція записів для кожного типу прив'язки нагадування. */
  const LINK_COLLECTION = { task: 'tasks', supplier: 'suppliers', purchase: 'purchases', premises: 'premises', fitout: 'fitout', monthly: 'monthly' };
  const COLLECTIONS = ['suppliers', 'products', 'notes', 'tasks', 'expenses', 'purchases', 'reminders', 'premises', 'fitout', 'monthly', 'chats'];
  /* Колекції, що є частиною робочих даних магазину (чати AI сюди не входять). */
  const DATA_COLLECTIONS = COLLECTIONS.filter(k => k !== 'chats');
  const LABELS = { suppliers: 'постачальники', products: 'товари', notes: 'нотатки', tasks: 'завдання', expenses: 'витрати', purchases: 'закупівлі', reminders: 'нагадування', premises: 'приміщення', fitout: 'облаштування', monthly: 'щомісячні витрати', chats: 'чати AI' };

  function empty() {
    const t = nowISO();
    return {
      app: APP_ID, schemaVersion: SCHEMA_VERSION,
      meta: { createdAt: t, updatedAt: t },
      settings: {
        totalBudget: null,
        budgetCategories: BUDGET_CATEGORIES.map(c => ({ ...c })),
        productCategories: [...PRODUCT_CATEGORIES],
        sections: normalizeSections(),
        sectionsRev: SECTIONS_REV,
        breakeven: { fixed: '', margin: '', extra: '', avgCheck: '', days: '26', salesPlan: {} },
        ui: { showDoneTasks: false },
        openingDate: '',
        fitoutCategories: [],
      },
      suppliers: [], products: [], notes: [], tasks: [], expenses: [], purchases: [], reminders: [], premises: [], fitout: [], monthly: [], chats: [],
    };
  }

  /* Міграції: ключ — версія, ДО якої мігруємо. Додавайте нові записи при зміні схеми. */
  const MIGRATIONS = {
    // v2: додано закупівлі, нагадування й чати AI. Старі дані не змінюються, нові списки порожні.
    2: d => ({ ...d, purchases: d.purchases || [], reminders: d.reminders || [], chats: d.chats || [] }),
    // v3: приміщення, облаштування, щомісячні витрати. Старі записи не змінюються.
    3: d => ({ ...d, premises: d.premises || [], fitout: d.fitout || [], monthly: d.monthly || [] }),
  };
  function migrate(d) {
    let v = Number(d.schemaVersion) || 1;
    while (v < SCHEMA_VERSION) { v++; if (MIGRATIONS[v]) d = MIGRATIONS[v](d); d.schemaVersion = v; }
    return d;
  }

  const str = v => (v === null || v === undefined) ? '' : String(v);
  const numOrNull = v => { const n = parseNum(v); return isNum(n) ? n : null; };
  const date = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
  const ts = v => (typeof v === 'string' && !isNaN(new Date(v))) ? v : nowISO();
  const strArr = v => Array.isArray(v) ? v.map(str).map(s => s.trim()).filter(Boolean) : splitList(v);
  /* Фото товару: шлях у сховищі сервера або зменшене зображення data:image/… у самому записі. */
  const PHOTO_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  const photos = v => Array.isArray(v) ? v.filter(p => p && typeof p === 'object').map(p => {
    const id = str(p.id) || uid();
    if (typeof p.path === 'string' && /^[\w-]+\/[\w-]+\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(p.path)) return { id, path: p.path };
    if (typeof p.data === 'string' && p.data.length < 3_000_000 && PHOTO_DATA.test(p.data)) return { id, data: p.data };
    return null;
  }).filter(Boolean).slice(0, 8) : [];
  const day = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; };
  const idOrNull = v => (v ? str(v) : null);
  const link = v => (v && typeof v === 'object' && ['premises', 'fitout', 'purchase'].includes(v.type) && v.id ? { type: v.type, id: str(v.id), part: str(v.part) } : null);
  /** План продажів: {id товару: кількість як введено}. Сміття відкидається. */
const salesPlan = v => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.entries(v).filter(([k, x]) => /^[\w-]{1,64}$/.test(k) && (typeof x === 'string' || typeof x === 'number')).slice(0, 2000).map(([k, x]) => [k, String(x).slice(0, 12)]))
  : {};
const FILE_PATH = /^[\w-]+\/[\w-]+\/[\w-]+\.(jpg|jpeg|png|webp|pdf|heic)$/;
  const files = v => Array.isArray(v) ? v.filter(f => f && typeof f === 'object' && typeof f.path === 'string' && FILE_PATH.test(f.path))
    .map(f => ({ id: str(f.id) || uid(), path: f.path, name: str(f.name).slice(0, 200) || 'файл', type: str(f.type).slice(0, 100), size: numOrNull(f.size), kind: f.kind === 'doc' ? 'doc' : f.kind === 'measure' ? 'measure' : 'photo' })).slice(0, 60) : [];
  const pick = (v, map, def) => Object.prototype.hasOwnProperty.call(map, v) ? v : def;

  /* Нормалізатори зберігають невідомі поля (...x), щоб нові версії не втрачали дані. */
  const N = {
    suppliers: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), categories: strArr(x.categories), instagram: str(x.instagram), website: str(x.website), phone: str(x.phone), messenger: str(x.messenger), contactPerson: str(x.contactPerson), city: str(x.city), minOrder: str(x.minOrder), paymentTerms: str(x.paymentTerms), deliveryTerms: str(x.deliveryTerms), defectTerms: str(x.defectTerms), notes: str(x.notes), status: pick(x.status, SUPPLIER_STATUSES, 'interested'), checkedAt: date(x.checkedAt), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    products: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), category: str(x.category), subcategory: str(x.subcategory), sku: str(x.sku), supplierId: x.supplierId ? str(x.supplierId) : null, url: str(x.url), sizes: str(x.sizes), colors: str(x.colors), priceType: x.priceType === 'pack' ? 'pack' : 'unit', purchasePrice: numOrNull(x.purchasePrice), packQty: numOrNull(x.packQty), retailPrice: numOrNull(x.retailPrice), priceDate: date(x.priceDate), comment: str(x.comment), photos: photos(x.photos), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    notes: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title), body: str(x.body), tags: strArr(x.tags), pinned: !!x.pinned, supplierId: x.supplierId ? str(x.supplierId) : null, createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    tasks: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title), description: str(x.description), prep: !!x.prep, deadline: date(x.deadline), priority: pick(x.priority, PRIORITIES, 'medium'), status: pick(x.status, TASK_STATUSES, 'planned'), checklist: Array.isArray(x.checklist) ? x.checklist.filter(i => i && typeof i === 'object').map(i => ({ id: str(i.id) || uid(), text: str(i.text), done: !!i.done })).filter(i => i.text) : [], createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    expenses: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), categoryId: str(x.categoryId) || 'other', planned: numOrNull(x.planned), paid: numOrNull(x.paid), comment: str(x.comment), source: link(x.source), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    premises: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), address: str(x.address), area: numOrNull(x.area), mapUrl: str(x.mapUrl),
      landlordName: str(x.landlordName), landlordPhone: str(x.landlordPhone), landlordContact: str(x.landlordContact), status: pick(x.status, PREMISES_STATUSES, 'selected'),
      rent: numOrNull(x.rent), deposit: numOrNull(x.deposit),
      otherPayments: Array.isArray(x.otherPayments) ? x.otherPayments.filter(o => o && typeof o === 'object').map(o => ({ id: str(o.id) || uid(), name: str(o.name), amount: numOrNull(o.amount) })).filter(o => o.name || o.amount !== null) : [],
      payDay: day(x.payDay), leaseStart: date(x.leaseStart), leaseEnd: date(x.leaseEnd), holidayFrom: date(x.holidayFrom), holidayTo: date(x.holidayTo), holidayTerms: str(x.holidayTerms),
      utilitiesIncluded: str(x.utilitiesIncluded), utilitiesSeparate: str(x.utilitiesSeparate), measurements: str(x.measurements), notes: str(x.notes), files: files(x.files),
      rentReminderId: idOrNull(x.rentReminderId), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    fitout: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), category: str(x.category) || 'equipment', qty: numOrNull(x.qty), size: str(x.size), url: str(x.url), vendor: str(x.vendor),
      planned: numOrNull(x.planned), status: pick(x.status, FITOUT_STATUSES, 'undecided'), deadline: date(x.deadline), priority: pick(x.priority, PRIORITIES, 'medium'), comment: str(x.comment),
      taskId: idOrNull(x.taskId), expenseId: idOrNull(x.expenseId), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    monthly: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), kind: pick(x.kind, MONTHLY_KINDS, 'other'), amount: numOrNull(x.amount), payDay: day(x.payDay), comment: str(x.comment),
      reminderId: idOrNull(x.reminderId), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    purchases: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title), supplierId: x.supplierId ? str(x.supplierId) : null, status: pick(x.status, PURCHASE_STATUSES, 'planned'), expectedDate: date(x.expectedDate),
      items: Array.isArray(x.items) ? x.items.filter(i => i && typeof i === 'object').map(i => ({ id: str(i.id) || uid(), productId: i.productId ? str(i.productId) : null, name: str(i.name), qty: numOrNull(i.qty), unitPrice: numOrNull(i.unitPrice) })).filter(i => i.name || i.productId) : [],
      deliveryCost: numOrNull(x.deliveryCost), expenseId: x.expenseId ? str(x.expenseId) : null, comment: str(x.comment), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    reminders: x => { const r = { ...x, id: str(x.id) || uid(), title: str(x.title), note: str(x.note), date: date(x.date), time: /^\d{2}:\d{2}$/.test(x.time || '') ? x.time : '09:00', repeat: pick(x.repeat, REPEATS, 'none'), status: pick(x.status, REMINDER_STATUSES, 'planned'),
      snoozedUntil: x.snoozedUntil && !isNaN(new Date(x.snoozedUntil)) ? x.snoozedUntil : null, link: x.link && LINK_TYPES[x.link.type] && x.link.id ? { type: x.link.type, id: str(x.link.id) } : null, createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) };
      r.fireAt = fireAt(r); return r; },
    chats: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title) || 'Розмова', messages: Array.isArray(x.messages) ? x.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')) : [], createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
  };

  function normalize(d) {
    const base = empty();
    const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
    const cats = Array.isArray(s.budgetCategories) && s.budgetCategories.length ? s.budgetCategories : base.settings.budgetCategories;
    const out = {
      ...d, app: APP_ID, schemaVersion: SCHEMA_VERSION,
      meta: { ...base.meta, ...(d.meta || {}) },
      settings: {
        ...base.settings, ...s,
        totalBudget: numOrNull(s.totalBudget),
        budgetCategories: cats.filter(c => c && c.id && c.name).map(c => ({ ...c, id: str(c.id), name: str(c.name), builtin: !!c.builtin, refundable: !!c.refundable })),
        productCategories: Array.isArray(s.productCategories) ? strArr(s.productCategories) : base.settings.productCategories,
        // Збережені розділи доповнюються новими типовими підрозділами один раз на версію
        sections: Array.isArray(s.sections) && (Number(s.sectionsRev) || 1) < SECTIONS_REV ? mergeDefaultSections(normalizeSections(s.sections)) : normalizeSections(s.sections),
        sectionsRev: SECTIONS_REV,
        breakeven: { ...base.settings.breakeven, ...(s.breakeven || {}), salesPlan: salesPlan(s.breakeven && s.breakeven.salesPlan) },
        ui: { ...base.settings.ui, ...(s.ui || {}) },
      },
    };
    // Обов'язкові вбудовані категорії бюджету не можуть зникнути
    for (const c of base.settings.budgetCategories) if (!out.settings.budgetCategories.some(x => x.id === c.id)) out.settings.budgetCategories.push({ ...c });
    for (const k of COLLECTIONS) out[k] = Array.isArray(d[k]) ? d[k].filter(x => x && typeof x === 'object').map(N[k]) : [];
    const catIds = new Set(out.settings.budgetCategories.map(c => c.id));
    out.expenses.forEach(e => { if (!catIds.has(e.categoryId)) e.categoryId = 'other'; });
    const supIds = new Set(out.suppliers.map(s => s.id));
    [...out.products, ...out.notes, ...out.purchases].forEach(r => { if (r.supplierId && !supIds.has(r.supplierId)) r.supplierId = null; });
    return out;
  }

  /** Перевірка файлу перед імпортом. Повертає {ok, errors, data, counts}. */
  function validateImport(obj) {
    const errors = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Файл не містить об’єкта даних.'] };
    if (obj.app !== APP_ID) errors.push('Це не резервна копія цього дашборду (немає позначки застосунку).');
    const v = Number(obj.schemaVersion);
    if (!Number.isInteger(v) || v < 1) errors.push('У файлі немає коректної версії структури даних.');
    else if (v > SCHEMA_VERSION) errors.push(`Файл створено новішою версією застосунку (структура v${v}, а ця версія підтримує до v${SCHEMA_VERSION}).`);
    const required = { suppliers: 'name', products: 'name', tasks: 'title', expenses: 'name', purchases: 'title', reminders: 'title', fitout: 'name', monthly: 'name' };
    const labels = LABELS;
    for (const k of COLLECTIONS) {
      if (obj[k] === undefined) continue;
      if (!Array.isArray(obj[k])) { errors.push(`Розділ «${labels[k]}» має бути списком.`); continue; }
      obj[k].forEach((x, i) => {
        if (!x || typeof x !== 'object') errors.push(`${labels[k]}: запис №${i + 1} пошкоджений.`);
        else if (required[k] && !String(x[required[k]] ?? '').trim()) errors.push(`${labels[k]}: у записі №${i + 1} немає назви.`);
      });
    }
    if (obj.settings !== undefined && (typeof obj.settings !== 'object' || obj.settings === null)) errors.push('Розділ налаштувань пошкоджений.');
    if (errors.length) return { ok: false, errors };
    const data = normalize(migrate(JSON.parse(JSON.stringify(obj))));
    const counts = Object.fromEntries(COLLECTIONS.map(k => [k, data[k].length]));
    return { ok: true, errors: [], data, counts, version: v };
  }

  /** Нормалізує один запис колекції (для синхронізації з сервером). */
  const normalizeRecord = (k, x) => N[k](x);
  return { empty, migrate, normalize, normalizeRecord, validateImport, PREMISES_STATUSES, FITOUT_STATUSES, MONTHLY_KINDS, SUPPLIER_STATUSES, TASK_STATUSES, PRIORITIES, PURCHASE_STATUSES, LINK_TYPES, LINK_COLLECTION, COLLECTIONS, DATA_COLLECTIONS, LABELS };
})();
