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
  const COLLECTIONS = ['suppliers', 'products', 'notes', 'tasks', 'expenses'];

  function empty() {
    const t = nowISO();
    return {
      app: APP_ID, schemaVersion: SCHEMA_VERSION,
      meta: { createdAt: t, updatedAt: t },
      settings: {
        totalBudget: null,
        budgetCategories: BUDGET_CATEGORIES.map(c => ({ ...c })),
        productCategories: [...PRODUCT_CATEGORIES],
        breakeven: { fixed: '', margin: '', extra: '', avgCheck: '', days: '26' },
        ui: { showDoneTasks: false },
      },
      suppliers: [], products: [], notes: [], tasks: [], expenses: [],
    };
  }

  /* Міграції: ключ — версія, ДО якої мігруємо. Додавайте нові записи при зміні схеми. */
  const MIGRATIONS = {
    // 2: d => { ...; d.schemaVersion = 2; return d; },
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
  const pick = (v, map, def) => Object.prototype.hasOwnProperty.call(map, v) ? v : def;

  /* Нормалізатори зберігають невідомі поля (...x), щоб нові версії не втрачали дані. */
  const N = {
    suppliers: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), categories: strArr(x.categories), instagram: str(x.instagram), website: str(x.website), phone: str(x.phone), messenger: str(x.messenger), contactPerson: str(x.contactPerson), city: str(x.city), minOrder: str(x.minOrder), paymentTerms: str(x.paymentTerms), deliveryTerms: str(x.deliveryTerms), defectTerms: str(x.defectTerms), notes: str(x.notes), status: pick(x.status, SUPPLIER_STATUSES, 'interested'), checkedAt: date(x.checkedAt), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    products: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), category: str(x.category), sku: str(x.sku), supplierId: x.supplierId ? str(x.supplierId) : null, url: str(x.url), sizes: str(x.sizes), colors: str(x.colors), priceType: x.priceType === 'pack' ? 'pack' : 'unit', purchasePrice: numOrNull(x.purchasePrice), packQty: numOrNull(x.packQty), retailPrice: numOrNull(x.retailPrice), priceDate: date(x.priceDate), comment: str(x.comment), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    notes: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title), body: str(x.body), tags: strArr(x.tags), pinned: !!x.pinned, supplierId: x.supplierId ? str(x.supplierId) : null, createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    tasks: x => ({ ...x, id: str(x.id) || uid(), title: str(x.title), description: str(x.description), deadline: date(x.deadline), priority: pick(x.priority, PRIORITIES, 'medium'), status: pick(x.status, TASK_STATUSES, 'planned'), checklist: Array.isArray(x.checklist) ? x.checklist.filter(i => i && typeof i === 'object').map(i => ({ id: str(i.id) || uid(), text: str(i.text), done: !!i.done })).filter(i => i.text) : [], createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
    expenses: x => ({ ...x, id: str(x.id) || uid(), name: str(x.name), categoryId: str(x.categoryId) || 'other', planned: numOrNull(x.planned), paid: numOrNull(x.paid), comment: str(x.comment), createdAt: ts(x.createdAt), updatedAt: ts(x.updatedAt) }),
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
        breakeven: { ...base.settings.breakeven, ...(s.breakeven || {}) },
        ui: { ...base.settings.ui, ...(s.ui || {}) },
      },
    };
    // Обов'язкові вбудовані категорії бюджету не можуть зникнути
    for (const c of base.settings.budgetCategories) if (!out.settings.budgetCategories.some(x => x.id === c.id)) out.settings.budgetCategories.push({ ...c });
    for (const k of COLLECTIONS) out[k] = Array.isArray(d[k]) ? d[k].filter(x => x && typeof x === 'object').map(N[k]) : [];
    const catIds = new Set(out.settings.budgetCategories.map(c => c.id));
    out.expenses.forEach(e => { if (!catIds.has(e.categoryId)) e.categoryId = 'other'; });
    const supIds = new Set(out.suppliers.map(s => s.id));
    [...out.products, ...out.notes].forEach(r => { if (r.supplierId && !supIds.has(r.supplierId)) r.supplierId = null; });
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
    const required = { suppliers: 'name', products: 'name', notes: 'title', tasks: 'title', expenses: 'name' };
    const labels = { suppliers: 'постачальники', products: 'товари', notes: 'нотатки', tasks: 'завдання', expenses: 'витрати' };
    for (const k of COLLECTIONS) {
      if (obj[k] === undefined) continue;
      if (!Array.isArray(obj[k])) { errors.push(`Розділ «${labels[k]}» має бути списком.`); continue; }
      obj[k].forEach((x, i) => {
        if (!x || typeof x !== 'object') errors.push(`${labels[k]}: запис №${i + 1} пошкоджений.`);
        else if (k !== 'notes' && !String(x[required[k]] ?? '').trim()) errors.push(`${labels[k]}: у записі №${i + 1} немає назви.`);
      });
    }
    if (obj.settings !== undefined && (typeof obj.settings !== 'object' || obj.settings === null)) errors.push('Розділ налаштувань пошкоджений.');
    if (errors.length) return { ok: false, errors };
    const data = normalize(migrate(JSON.parse(JSON.stringify(obj))));
    const counts = Object.fromEntries(COLLECTIONS.map(k => [k, data[k].length]));
    return { ok: true, errors: [], data, counts, version: v };
  }

  return { empty, migrate, normalize, validateImport, SUPPLIER_STATUSES, TASK_STATUSES, PRIORITIES, COLLECTIONS };
})();
