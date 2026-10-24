import { Calc } from './calc.js';
import { addDaysISO, daysFromToday, isNum, kyivParts } from './utils.js';

/* =====================================================================
   ПІДГОТОВКА ТОЧКИ ДО ВІДКРИТТЯ: приміщення, облаштування, щомісячні витрати.
   Лише чисті функції над даними; інтерфейс і AI-менеджер беруть розрахунки звідси.
   ===================================================================== */
export const PREMISES_STATUSES = { selected: 'Вибрано', negotiating: 'Умови погоджуються', signed: 'Договір підписано', keys: 'Отримали ключі' };
/** Підтверджена оренда — лише підписаний договір або отримані ключі. «Вибрано» ще нічого не гарантує. */
export const isLeaseConfirmed = p => !!p && (p.status === 'signed' || p.status === 'keys');
export const FITOUT_STATUSES = { undecided: 'Потрібно визначитися', chosen: 'Вибрано', ordered: 'Замовлено', received: 'Отримано', installed: 'Встановлено' };
/* Вбудовані категорії облаштування: [id, назва, стаття бюджету за замовчуванням]. */
export const FITOUT_CATEGORIES = [
  ['repair', 'Ремонт', 'repair'], ['lighting', 'Освітлення', 'equipment'], ['shelves', 'Стелажі', 'furniture'], ['counter', 'Прилавок', 'furniture'],
  ['fitting', 'Примірочна', 'furniture'], ['mirrors', 'Дзеркала', 'furniture'], ['signage', 'Вивіска', 'signage'], ['equipment', 'Обладнання', 'equipment'],
];
export const MONTHLY_KINDS = { rent: 'Оренда', utilities: 'Комунальні', salary: 'Зарплата', telecom: 'Зв’язок та інтернет', accounting: 'Облік, програми, бухгалтерія', ads: 'Реклама', other: 'Інші постійні витрати' };

const r2 = n => Math.round(n * 100) / 100;
const sameMoney = (a, b) => isNum(a) && isNum(b) && Math.abs(r2(a) - r2(b)) < 0.005;

/** Усі категорії облаштування: вбудовані й власні з налаштувань. */
export function fitoutCategories(d) {
  return [...FITOUT_CATEGORIES.map(([id, name, budget]) => ({ id, name, budget, builtin: true })),
    ...(d.settings.fitoutCategories || []).map(c => ({ id: c.id, name: c.name, budget: 'other', builtin: false }))];
}
/** Категорія бюджету з запасним варіантом, якщо користувач видалив стандартну. */
export const budgetCat = (d, id) => { const c = d.settings.budgetCategories; return c.some(x => x.id === id) ? id : c.some(x => x.id === 'other') ? 'other' : (c[0]?.id || id); };
export const fitoutCategoryName = (d, id) => fitoutCategories(d).find(c => c.id === id)?.name || 'Інше';

/** Основне приміщення: те, що далі просунулося (ключі → договір → погодження → вибрано), серед рівних — раніше додане. */
export function mainPremises(d) {
  const rank = { keys: 3, signed: 2, negotiating: 1, selected: 0 };
  return [...d.premises].sort((a, b) => (rank[b.status] - rank[a.status]) || String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
}
export const premisesTitle = p => p ? (p.name || p.address || 'Приміщення') : '';

/* ---------- Зв'язок із бюджетом ---------- */
/**
 * Стан зв'язку запису (закупівлі чи позиції облаштування) зі статтею бюджету.
 * none — не пов'язано; missing — статтю видалено; mismatch — планова сума статті інша; ok — збігається.
 * Фактичну оплату не порівнюємо: її записує користувач у бюджеті.
 */
export function linkState(d, expenseId, amount) {
  if (!expenseId) return { state: 'none', expense: null, amount };
  const expense = d.expenses.find(e => e.id === expenseId) || null;
  if (!expense) return { state: 'missing', expense: null, amount };
  if (!isNum(amount)) return { state: 'ok', expense, amount };
  return { state: sameMoney(expense.planned ?? 0, amount) ? 'ok' : 'mismatch', expense, amount: r2(amount), planned: expense.planned ?? 0 };
}
export const purchaseAmount = p => r2(Calc.purchaseTotal(p).total);
export const purchaseLink = (d, p) => linkState(d, p.expenseId, purchaseAmount(p));
export const fitoutLink = (d, item) => linkState(d, item.expenseId, item.planned);
/** Статті, до яких можна прив'язати запис: ще не прив'язані до інших закупівель (для закупівель) чи будь-які (облаштування). */
export function freeExpensesForPurchase(d, purchaseId) {
  const used = new Set(d.purchases.filter(p => p.id !== purchaseId && p.expenseId).map(p => p.expenseId));
  return d.expenses.filter(e => !used.has(e.id));
}

/**
 * План внесення платежів приміщення в бюджет. Для кожної суми: create — створити статтю,
 * update — планова сума статті відрізняється (було → стане), same — уже внесено, skip — суму не вказано.
 * Статті шукаються за позначкою source, тож повторне натискання не створює дублів.
 */
export function premisesBudgetPlan(d, pr) {
  const where = pr.address || pr.name || 'приміщення';
  const parts = [
    { part: 'rent', label: 'Оренда за перший місяць', name: `Оренда за перший місяць: ${where}`, categoryId: 'rent', amount: pr.rent },
    { part: 'deposit', label: 'Депозит', name: `Депозит за оренду: ${where}`, categoryId: 'deposit', amount: pr.deposit },
    ...(pr.otherPayments || []).map(o => ({ part: 'other:' + o.id, label: o.name || 'Інший платіж', name: `${o.name || 'Інший платіж'}: ${where}`, categoryId: 'other', amount: o.amount })),
  ];
  return parts.map(x => {
    const expense = d.expenses.find(e => e.source && e.source.type === 'premises' && e.source.id === pr.id && e.source.part === x.part) || null;
    const amount = isNum(x.amount) ? r2(x.amount) : null;
    const action = amount === null ? 'skip' : !expense ? 'create' : sameMoney(expense.planned ?? 0, amount) ? 'same' : 'update';
    return { ...x, amount, expense, action, from: expense ? expense.planned ?? 0 : null };
  });
}

/** Звідки стаття бюджету: пов'язані закупівлі, позиції облаштування, приміщення. */
export function expenseOrigins(d, e) {
  const out = [];
  d.purchases.filter(p => p.expenseId === e.id).forEach(p => out.push({ collection: 'purchases', id: p.id, label: 'Закупівля: ' + p.title }));
  d.fitout.filter(i => i.expenseId === e.id).forEach(i => out.push({ collection: 'fitout', id: i.id, label: 'Облаштування: ' + i.name }));
  if (e.source && e.source.type === 'premises') { const pr = d.premises.find(x => x.id === e.source.id); if (pr) out.push({ collection: 'premises', id: pr.id, label: 'Приміщення: ' + premisesTitle(pr) }); }
  return out;
}

/* ---------- Облаштування ---------- */
export function fitoutSummary(d, today = kyivParts().date) {
  const items = d.fitout;
  const byStatus = Object.fromEntries(Object.keys(FITOUT_STATUSES).map(k => [k, items.filter(i => i.status === k).length]));
  const planned = items.reduce((s, i) => s + (isNum(i.planned) ? i.planned : 0), 0);
  // сплачене — з пов'язаних статей бюджету, кожна стаття рахується один раз, навіть якщо до неї прив'язано кілька позицій
  const linked = new Map(); items.forEach(i => { const e = i.expenseId && d.expenses.find(x => x.id === i.expenseId); if (e) linked.set(e.id, e); });
  const paid = [...linked.values()].reduce((s, e) => s + (isNum(e.paid) ? e.paid : 0), 0);
  const done = items.filter(i => i.status === 'installed' || i.status === 'received').length;
  return {
    count: items.length, byStatus, planned: r2(planned), paid: r2(paid), done,
    noPrice: items.filter(i => !isNum(i.planned)).length,
    notInBudget: items.filter(i => fitoutLink(d, i).state !== 'ok' && fitoutLink(d, i).state !== 'mismatch').length,
    overdue: items.filter(i => i.deadline && i.deadline < today && i.status !== 'installed' && i.status !== 'received'),
  };
}

/* ---------- Щомісячні витрати ---------- */
/**
 * Підсумок постійних витрат на місяць. Оренда береться з основного приміщення, а власні статті «Оренда»
 * в такому разі позначаються як дубль і не додаються до суми.
 */
export function monthlySummary(d) {
  const pr = mainPremises(d);
  const rent = pr && isNum(pr.rent) ? { name: 'Оренда (з приміщення)', amount: pr.rent, payDay: pr.payDay, premisesId: pr.id, confirmed: isLeaseConfirmed(pr) } : null;
  const items = d.monthly.map(m => ({ ...m, duplicate: !!rent && m.kind === 'rent' }));
  const counted = items.filter(m => !m.duplicate && isNum(m.amount));
  const total = r2((rent ? rent.amount : 0) + counted.reduce((s, m) => s + m.amount, 0));
  return { rent, items, total, missing: items.filter(m => !m.duplicate && !isNum(m.amount)), duplicates: items.filter(m => m.duplicate) };
}
/** Найближча дата оплати з днем місяця `day` від дати `from` (якщо в місяці менше днів — останній день). */
export function nextPayDate(day, from = kyivParts().date) {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const [y, m, dd] = from.split('-').map(Number);
  const at = (yy, mm) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`; };
  const cur = at(y, m);
  if (Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate()) >= dd) return cur;
  return m === 12 ? at(y + 1, 1) : at(y, m + 1);
}

/* ---------- Маржа ---------- */
/** Просте середнє маржі товарів — довідковий показник: не враховує, яких товарів продається більше. */
export function simpleAvgMargin(products) {
  const m = products.map(p => Calc.margin(Calc.unitCost(p), p.retailPrice)).filter(isNum);
  return m.length ? { margin: m.reduce((a, x) => a + x, 0) / m.length, count: m.length } : null;
}
/**
 * Зважена маржа за планом продажів: (сумарна виручка − сумарна собівартість) / сумарна виручка × 100.
 * plan — {productId: кількість на місяць}. Товари без ціни закупівлі чи роздрібу не враховуються й повертаються в skipped.
 */
export function weightedMargin(products, plan) {
  let revenue = 0, cost = 0; const lines = [], skipped = [];
  for (const [id, raw] of Object.entries(plan || {})) {
    const qty = Number(raw); if (!isNum(qty) || qty <= 0) continue;
    const p = products.find(x => x.id === id); if (!p) continue;
    const c = Calc.unitCost(p);
    if (!isNum(c) || !isNum(p.retailPrice) || p.retailPrice <= 0) { skipped.push({ id, name: p.name, qty }); continue; }
    revenue += qty * p.retailPrice; cost += qty * c;
    lines.push({ id, name: p.name, qty, revenue: r2(qty * p.retailPrice), cost: r2(qty * c) });
  }
  if (!(revenue > 0)) return { margin: null, revenue: 0, cost: 0, lines, skipped };
  return { margin: (revenue - cost) / revenue * 100, revenue: r2(revenue), cost: r2(cost), lines, skipped };
}

/* ---------- Готовність ---------- */
/** Прогрес лише за завданнями, які користувач позначив як підготовку до відкриття. */
export function prepProgress(d) {
  const prep = d.tasks.filter(t => t.prep);
  const done = prep.filter(t => t.status === 'done').length;
  return { total: prep.length, done, pct: prep.length ? Math.round(done / prep.length * 100) : null };
}
export const criticalTasks = d => d.tasks.filter(t => t.status !== 'done' && t.priority === 'high')
  .sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1);

/**
 * Що відомо про готовність до дати відкриття. Розділяє підтверджені факти й плани:
 * приміщення вважається орендованим лише з підписаним договором або ключами.
 */
export function openingReadiness(d, now = new Date()) {
  const today = kyivParts(now).date; const date = d.settings.openingDate || null;
  const pr = mainPremises(d); const b = Calc.budget(d); const fs = fitoutSummary(d, today); const prep = prepProgress(d);
  const blockers = [];
  const add = (level, text, ref = null) => blockers.push({ level, text, ref });
  if (!pr) add('bad', 'Приміщення ще не записане');
  else if (!isLeaseConfirmed(pr)) add('bad', `Оренда не підтверджена: статус «${PREMISES_STATUSES[pr.status]}», договір не підписано`, { collection: 'premises', id: pr.id });
  if (pr && pr.leaseStart && date && pr.leaseStart > date) add('bad', `Оренда починається ${pr.leaseStart}, пізніше за дату відкриття`, { collection: 'premises', id: pr.id });
  const open = d.tasks.filter(t => t.status !== 'done');
  open.filter(t => t.prep && date && t.deadline && t.deadline > date).forEach(t => add('warn', `Завдання підготовки з терміном після відкриття: ${t.title}`, { collection: 'tasks', id: t.id }));
  open.filter(t => t.deadline && t.deadline < today && (t.prep || t.priority === 'high')).forEach(t => add('bad', `Прострочене завдання: ${t.title}`, { collection: 'tasks', id: t.id }));
  d.fitout.filter(i => i.status !== 'installed' && i.status !== 'received' && (i.priority === 'high' || (date && i.deadline && i.deadline > date))).forEach(i => add('warn', `Облаштування не готове: ${i.name} (${FITOUT_STATUSES[i.status]})`, { collection: 'fitout', id: i.id }));
  fs.overdue.forEach(i => add('bad', `Минув термін облаштування: ${i.name}`, { collection: 'fitout', id: i.id }));
  if (b.free !== null && b.free < 0) add('bad', `Не вистачає бюджету: ${r2(-b.free)} ₴`);
  if (b.total === null) add('warn', 'Не задано загальний бюджет відкриття');
  d.purchases.filter(p => ['planned', 'ordered', 'awaiting'].includes(p.status) && date && p.expectedDate && p.expectedDate > date).forEach(p => add('warn', `Закупівля очікується після відкриття: ${p.title}`, { collection: 'purchases', id: p.id }));
  return {
    today, openingDate: date, daysLeft: date ? daysFromToday(date) : null,
    premises: pr ? { id: pr.id, title: premisesTitle(pr), status: PREMISES_STATUSES[pr.status], leaseConfirmed: isLeaseConfirmed(pr), leaseStart: pr.leaseStart || null, rent: pr.rent, deposit: pr.deposit } : null,
    prep, fitout: { count: fs.count, done: fs.done, byStatus: fs.byStatus }, blockers,
    weekAhead: addDaysISO(today, 7),
  };
}
