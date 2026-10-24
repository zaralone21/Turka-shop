import { Calc } from './calc.js';
import { STALE_PRICE_DAYS, STALE_SUPPLIER_DAYS, runChecks } from './checks.js';
import { FITOUT_STATUSES, MONTHLY_KINDS, PREMISES_STATUSES, fitoutCategoryName, fitoutLink, fitoutSummary, isLeaseConfirmed, mainPremises, monthlySummary, nextPayDate, openingReadiness, premisesBudgetPlan, purchaseLink } from './opening.js';
import { fireAt, isDue } from './reminders.js';
import { Schema } from './schema.js';
import { addDaysISO, daysFromToday, isNum, kyivParts } from './utils.js';

/* Інструменти AI-менеджера. Виконуються в браузері над записами користувача.
   Модель отримує лише результат конкретного інструмента, а всі розрахунки
   беруться з перевірених функцій застосунку (Calc, runChecks). */

const DATA = ['suppliers', 'products', 'notes', 'tasks', 'expenses', 'purchases', 'reminders', 'premises', 'fitout', 'monthly'];
const LIST_LIMIT = 50;
const cut = (s, n = 400) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const money = n => (isNum(n) ? Math.round(n * 100) / 100 : null);
const ageDays = iso => (iso ? -daysFromToday(iso) : null);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length)));
const nameOf = (d, col, id) => { const r = id && col && d[col] && d[col].find(x => x.id === id); return r ? (r.name || r.title || r.address) : null; };

export class ToolError extends Error {}
const need = (cond, msg) => { if (!cond) throw new ToolError(msg); };
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00Z'));

/* ---------- Короткі картки записів ---------- */
function brief(d, col, r) {
  switch (col) {
    case 'suppliers': return clean({ id: r.id, name: r.name, status: Schema.SUPPLIER_STATUSES[r.status], city: r.city, categories: r.categories, contacts: [r.phone, r.messenger, r.instagram, r.website].filter(Boolean).join(', ') || null, checkedAt: r.checkedAt || null });
    case 'products': { const c = Calc.unitCost(r); return clean({ id: r.id, name: r.name, category: r.category, subcategory: r.subcategory, supplier: nameOf(d, 'suppliers', r.supplierId), supplierId: r.supplierId, unitCost: money(c), retailPrice: r.retailPrice, priceDate: r.priceDate || null, priceStale: r.priceDate ? ageDays(r.priceDate) > STALE_PRICE_DAYS : null }); }
    case 'notes': return clean({ id: r.id, title: r.title || 'Без заголовка', excerpt: cut(r.body, 200), supplierId: r.supplierId, updatedAt: r.updatedAt.slice(0, 10) });
    case 'tasks': return clean({ id: r.id, title: r.title, status: Schema.TASK_STATUSES[r.status], deadline: r.deadline || null, overdue: r.status !== 'done' && r.deadline ? daysFromToday(r.deadline) < 0 : null, priority: Schema.PRIORITIES[r.priority], openingPrep: r.prep || null });
    case 'expenses': return clean({ id: r.id, name: r.name, category: d.settings.budgetCategories.find(c => c.id === r.categoryId)?.name, planned: r.planned, paid: r.paid });
    case 'purchases': { const t = Calc.purchaseTotal(r); return clean({ id: r.id, title: r.title, status: Schema.PURCHASE_STATUSES[r.status], supplier: nameOf(d, 'suppliers', r.supplierId), supplierId: r.supplierId, expectedDate: r.expectedDate || null, total: money(t.total), itemsWithoutPrice: t.missing.length || null, inBudget: !!r.expenseId }); }
    case 'reminders': { const f = fireAt(r); const p = f ? kyivParts(new Date(f)) : null; return clean({ id: r.id, title: r.title, state: r.status, when: p ? `${p.date} ${p.time}` : null, due: isDue(r), repeat: r.repeat !== 'none' ? r.repeat : null, link: r.link ? { ...r.link, name: nameOf(d, Schema.LINK_COLLECTION[r.link.type], r.link.id) } : null }); }
    case 'premises': return clean({ id: r.id, name: r.name, address: r.address, status: PREMISES_STATUSES[r.status], leaseConfirmed: isLeaseConfirmed(r), rentPerMonth: r.rent, deposit: r.deposit, payDay: r.payDay, leaseStart: r.leaseStart || null, files: r.files.length || null });
    case 'fitout': { const st = fitoutLink(d, r); return clean({ id: r.id, name: r.name, category: fitoutCategoryName(d, r.category), status: FITOUT_STATUSES[r.status], qty: r.qty, planned: r.planned, deadline: r.deadline || null, priority: Schema.PRIORITIES[r.priority], vendor: r.vendor, budget: st.state === 'none' ? 'не в бюджеті' : st.state === 'missing' ? 'статтю бюджету видалено' : { expenseId: st.expense.id, planned: st.expense.planned, paid: st.expense.paid ?? 0, mismatch: st.state === 'mismatch' || null }, taskId: r.taskId }); }
    case 'monthly': return clean({ id: r.id, name: r.name, kind: MONTHLY_KINDS[r.kind], amount: r.amount, payDay: r.payDay, comment: cut(r.comment, 120), reminderId: r.reminderId });
    default: return { id: r.id };
  }
}
const limited = (d, col, list) => ({ count: list.length, items: list.slice(0, LIST_LIMIT).map(r => brief(d, col, r)), ...(list.length > LIST_LIMIT ? { truncated: true } : {}) });

/* ---------- Читання ---------- */
function overview(d, now) {
  const today = kyivParts(now).date; const week = addDaysISO(today, 7);
  const open = d.tasks.filter(t => t.status !== 'done');
  const b = Calc.budget(d); const p = Calc.purchases(d);
  return {
    now: kyivParts(now), counts: Object.fromEntries(DATA.map(k => [k, d[k].length])),
    sections: d.settings.sections,
    tasks: {
      overdue: open.filter(t => t.deadline && t.deadline < today).map(t => brief(d, 'tasks', t)),
      today: open.filter(t => t.deadline === today).map(t => brief(d, 'tasks', t)),
      next7days: open.filter(t => t.deadline > today && t.deadline <= week).map(t => brief(d, 'tasks', t)),
      withoutDeadline: open.filter(t => !t.deadline).length,
    },
    reminders: {
      due: d.reminders.filter(r => isDue(r, now)).map(r => brief(d, 'reminders', r)),
      next7days: d.reminders.filter(r => { const f = fireAt(r); return f && new Date(f) > now && kyivParts(new Date(f)).date <= week; }).map(r => brief(d, 'reminders', r)),
    },
    budget: { total: b.total, needed: money(b.needed), paid: money(b.paid), toPay: money(b.toPay), free: money(b.free) },
    purchases: { plannedSum: money(p.planned), awaitingSum: money(p.awaiting), counts: p.count },
    opening: (() => { const r = openingReadiness(d, now); return { openingDate: r.openingDate, daysLeft: r.daysLeft, premises: r.premises && { id: r.premises.id, title: r.premises.title, status: r.premises.status, leaseConfirmed: r.premises.leaseConfirmed }, prepTasks: r.prep, blockers: r.blockers.length, note: 'Деталі: get_opening_status' }; })(),
    warnings: runChecks(d, now).map(c => ({ level: c.level, text: c.text, ref: c.ref || undefined })),
  };
}

/* ---------- Підготовка до відкриття ---------- */
/** Стан підготовки з чітким поділом: підтверджені факти, плани/домовленості, невідоме. */
function openingStatus(d, now) {
  const r = openingReadiness(d, now); const pr = mainPremises(d); const fs = fitoutSummary(d, r.today); const ms = monthlySummary(d); const b = Calc.budget(d);
  const confirmed = [], plans = [], unknown = [];
  if (!r.openingDate) unknown.push('Планова дата відкриття не задана'); else plans.push(`Планова дата відкриття: ${r.openingDate} (через ${r.daysLeft} дн.)`);
  if (!pr) unknown.push('Приміщення не записане');
  else {
    const t = pr.name || pr.address || 'приміщення';
    (isLeaseConfirmed(pr) ? confirmed : plans).push(`Приміщення «${t}»: статус «${PREMISES_STATUSES[pr.status]}»${isLeaseConfirmed(pr) ? '' : ' — договір не підписано, оренда НЕ підтверджена'}`);
    const where = isLeaseConfirmed(pr) ? confirmed : plans;
    if (isNum(pr.rent)) where.push(`Оренда ${pr.rent} ₴/міс${isLeaseConfirmed(pr) ? ' (за договором)' : ' (домовленість, не підтверджено договором)'}`); else unknown.push('Сума оренди не вказана');
    if (isNum(pr.deposit)) where.push(`Депозит ${pr.deposit} ₴`); else unknown.push('Депозит не вказано');
    if (!pr.leaseStart) unknown.push('Дата початку оренди не вказана');
    if (!pr.payDay) unknown.push('День оплати оренди не вказано');
  }
  return {
    today: r.today, openingDate: r.openingDate, daysLeft: r.daysLeft,
    facts: confirmed, plansAndAgreements: plans, unknown,
    prepProgress: { ...r.prep, note: 'Рахується лише за завданнями, які користувач позначив як підготовку. Не є гарантією готовності.' },
    blockers: r.blockers.map(x => ({ level: x.level, text: x.text, ref: x.ref || undefined })),
    premises: pr ? { id: pr.id, status: PREMISES_STATUSES[pr.status], leaseConfirmed: isLeaseConfirmed(pr), budget: premisesBudgetPlan(d, pr).map(x => ({ part: x.label, amount: x.amount, inBudget: x.action === 'same' ? true : x.action === 'update' ? `так, але в бюджеті ${x.from}` : x.action === 'create' ? false : 'суму не вказано' })), nextRentPayment: pr.payDay ? nextPayDate(pr.payDay, r.today) : null, rentReminderId: pr.rentReminderId } : null,
    fitout: { count: fs.count, byStatus: Object.fromEntries(Object.entries(fs.byStatus).map(([k, v]) => [FITOUT_STATUSES[k], v])), plannedSum: fs.planned, paidFromBudget: fs.paid, withoutPrice: fs.noPrice, notInBudget: fs.notInBudget, overdue: fs.overdue.map(i => ({ id: i.id, name: i.name, deadline: i.deadline })),
      stillNeeded: d.fitout.filter(i => !['received', 'installed'].includes(i.status)).map(i => brief(d, 'fitout', i)).slice(0, LIST_LIMIT) },
    budget: { total: b.total, needed: money(b.needed), paid: money(b.paid), toPay: money(b.toPay), free: money(b.free), note: 'Бюджет відкриття (разові витрати й депозит). Щомісячні витрати — окремо.' },
    monthly: { total: ms.total, rentFromPremises: ms.rent ? { amount: ms.rent.amount, confirmed: ms.rent.confirmed } : null, withoutAmount: ms.missing.map(m => m.name), duplicatesIgnored: ms.duplicates.map(m => m.name) },
    purchases: d.purchases.filter(p => p.status !== 'cancelled').map(p => { const st = purchaseLink(d, p); return st.state === 'mismatch' || st.state === 'missing' ? { id: p.id, title: p.title, budgetIssue: st.state === 'missing' ? 'статтю бюджету видалено' : `сума ${st.amount}, у бюджеті ${st.planned}` } : null; }).filter(Boolean),
  };
}
function listFitout(d, status, category) {
  const list = d.fitout.filter(i => (!status || status === 'all' || i.status === status) && (!category || i.category === category || fitoutCategoryName(d, i.category).toLowerCase() === String(category).toLowerCase()));
  const s = fitoutSummary(d);
  return { summary: { count: s.count, plannedSum: s.planned, paidFromBudget: s.paid, paidNote: 'Сплачене береться з пов’язаних статей бюджету' }, ...limited(d, 'fitout', list) };
}
function monthlyCosts(d) {
  const s = monthlySummary(d); const b = Calc.budget(d);
  return { totalPerMonth: s.total, rentFromPremises: s.rent, items: s.items.map(m => ({ ...brief(d, 'monthly', m), duplicateOfPremisesRent: m.duplicate || undefined })), withoutAmount: s.missing.length,
    oneTimeOpening: money(b.nonRefundable), deposit: money(b.deposit.needed), breakevenFixed: d.settings.breakeven.fixed || null,
    note: 'Щомісячні витрати не входять у бюджет відкриття. Разові витрати відкриття й депозит — окремо.' };
}

function listTasks(d, filter) {
  const today = kyivParts().date; const week = addDaysISO(today, 7);
  const open = d.tasks.filter(t => t.status !== 'done');
  const sets = {
    open, overdue: open.filter(t => t.deadline && t.deadline < today), today: open.filter(t => t.deadline === today),
    week: open.filter(t => t.deadline && t.deadline <= week), done: d.tasks.filter(t => t.status === 'done'), all: d.tasks,
  };
  need(sets[filter], 'Невідомий фільтр');
  return limited(d, 'tasks', [...sets[filter]].sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1));
}
function listReminders(d, filter, now) {
  const active = d.reminders.filter(r => r.status !== 'done');
  const weekEnd = new Date(now.getTime() + 7 * 864e5);
  const sets = { due: active.filter(r => isDue(r, now)), upcoming: active.filter(r => !isDue(r, now)), week: active.filter(r => { const f = fireAt(r); return f && new Date(f) <= weekEnd; }), all: d.reminders };
  need(sets[filter], 'Невідомий фільтр');
  return limited(d, 'reminders', [...sets[filter]].sort((a, b) => (fireAt(a) || 'z') < (fireAt(b) || 'z') ? -1 : 1));
}
function budget(d) {
  const b = Calc.budget(d);
  return {
    total: b.total, totalNote: b.total === null ? 'Загальний бюджет не задано' : undefined,
    needed: money(b.needed), paid: money(b.paid), toPay: money(b.toPay), free: money(b.free), leftAfterPaid: money(b.leftAfterPaid),
    overPlan: money(b.overPlan), refundableDeposit: money(b.deposit.needed),
    formula: 'needed = Σ max(план, сплачено) по кожній витраті; free = total − needed',
    byCategory: d.settings.budgetCategories.filter(c => b.byCat[c.id]).map(c => ({ category: c.name, ...Object.fromEntries(Object.entries(b.byCat[c.id]).map(([k, v]) => [k, money(v)])) })),
    expenses: limited(d, 'expenses', d.expenses),
  };
}
function listPurchases(d, status) {
  const list = status === 'all' ? d.purchases : d.purchases.filter(p => p.status === status);
  const s = Calc.purchases(d);
  return { summary: { plannedSum: money(s.planned), awaitingSum: money(s.awaiting), receivedSum: money(s.received), counts: s.count }, ...limited(d, 'purchases', list) };
}
function search(d, query, collections) {
  const q = String(query || '').toLowerCase().trim(); need(q, 'Порожній запит');
  const words = q.split(/\s+/);
  const cols = Array.isArray(collections) && collections.length ? collections.filter(c => DATA.includes(c)) : DATA;
  const out = {};
  for (const c of cols) {
    const hits = d[c].filter(r => { const hay = JSON.stringify({ ...r, photos: undefined }).toLowerCase(); return words.every(w => hay.includes(w)); });
    if (hits.length) out[c] = limited(d, c, hits);
  }
  return Object.keys(out).length ? out : { found: 0 };
}
function getRecord(d, col, id) {
  need(DATA.includes(col), 'Невідома колекція');
  const r = d[col].find(x => x.id === id); need(r, `Запис ${col}/${id} не знайдено`);
  const rec = { ...r };
  if (col === 'products') { rec.photos = (r.photos || []).length; rec.unitCost = money(Calc.unitCost(r)); rec.priceAgeDays = ageDays(r.priceDate); rec.priceStale = rec.priceAgeDays !== null ? rec.priceAgeDays > STALE_PRICE_DAYS : null; rec.supplier = nameOf(d, 'suppliers', r.supplierId); }
  if (col === 'purchases') { rec.computed = Calc.purchaseTotal(r); const st = purchaseLink(d, r); rec.budgetLink = st.state; }
  if (col === 'premises') { rec.files = r.files.map(f => ({ kind: f.kind, name: f.name })); rec.statusName = PREMISES_STATUSES[r.status]; rec.leaseConfirmed = isLeaseConfirmed(r); rec.budget = premisesBudgetPlan(d, r).map(x => ({ part: x.label, amount: x.amount, action: x.action })); }
  if (col === 'fitout') { rec.categoryName = fitoutCategoryName(d, r.category); rec.budget = brief(d, 'fitout', r).budget; }
  if (col === 'reminders') rec.fireAtKyiv = fireAt(r) ? kyivParts(new Date(fireAt(r))) : null;
  if (col === 'suppliers') {
    rec.infoAgeDays = ageDays(r.checkedAt); rec.infoStale = !r.checkedAt || rec.infoAgeDays > STALE_SUPPLIER_DAYS;
    rec.products = d.products.filter(p => p.supplierId === id).map(p => brief(d, 'products', p));
    rec.purchases = d.purchases.filter(p => p.supplierId === id).map(p => brief(d, 'purchases', p));
    rec.notes = d.notes.filter(n => n.supplierId === id).map(n => brief(d, 'notes', n));
    rec.reminders = d.reminders.filter(x => x.link?.type === 'supplier' && x.link.id === id).map(x => brief(d, 'reminders', x));
  }
  return rec;
}

/** Порівняння пропозицій: ціни за одиницю з Calc.unitCost, давність цін і бракуючі поля. */
export function compareOffers(d, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean); need(words.length, 'Порожній запит');
  const items = d.products.filter(p => { const hay = [p.name, p.category, p.subcategory, p.comment, p.sku].join(' ').toLowerCase(); return words.every(w => hay.includes(w)); }).map(p => {
    const s = d.suppliers.find(x => x.id === p.supplierId) || null; const unit = Calc.unitCost(p);
    const missing = [];
    if (unit === null) missing.push(p.priceType === 'pack' && isNum(p.purchasePrice) ? 'кількість в упаковці' : 'закупівельна ціна');
    if (!p.priceDate) missing.push('дата ціни');
    if (!s) missing.push('постачальник');
    else { if (!s.minOrder) missing.push('мінімальне замовлення'); if (!s.deliveryTerms) missing.push('умови доставки'); }
    const age = ageDays(p.priceDate);
    return clean({
      productId: p.id, product: p.name, supplierId: s?.id, supplier: s?.name, priceType: p.priceType === 'pack' ? 'за упаковку' : 'за одиницю',
      purchasePrice: p.purchasePrice, packQty: p.priceType === 'pack' ? p.packQty : null, unitCost: money(unit), retailPrice: p.retailPrice,
      marginPct: money(Calc.margin(unit, p.retailPrice)), minOrder: s?.minOrder, delivery: s?.deliveryTerms, payment: s?.paymentTerms,
      priceDate: p.priceDate, priceAgeDays: age, priceStale: age !== null ? age > STALE_PRICE_DAYS : true, missing,
    });
  }).sort((a, b) => (a.unitCost ?? Infinity) - (b.unitCost ?? Infinity));
  const priced = items.filter(i => isNum(i.unitCost));
  return { query, found: items.length, cheapestUnitCost: priced[0] ? { productId: priced[0].productId, supplier: priced[0].supplier, unitCost: priced[0].unitCost } : null, offers: items, staleAfterDays: STALE_PRICE_DAYS };
}

/** Перевірка плану закупівлі: вартість за Calc.purchaseTotal, порівняння з вільним бюджетом. */
export function checkPurchasePlan(d, items, deliveryCost) {
  need(Array.isArray(items) && items.length, 'Порожній план');
  const lines = items.map(i => {
    const p = d.products.find(x => x.id === i.productId);
    const qty = Number(i.qty);
    if (!p) return { productId: i.productId, error: 'товар не знайдено' };
    const unit = Calc.unitCost(p);
    return clean({ productId: p.id, product: p.name, supplierId: p.supplierId, qty: isNum(qty) && qty > 0 ? qty : null, unitCost: money(unit), lineTotal: isNum(unit) && qty > 0 ? money(unit * qty) : null, priceStale: p.priceDate ? ageDays(p.priceDate) > STALE_PRICE_DAYS : true, missing: unit === null ? 'ціна' : null });
  });
  const pseudo = { items: lines.filter(l => !l.error).map(l => ({ qty: l.qty ?? null, unitPrice: l.unitCost ?? null })), deliveryCost: isNum(Number(deliveryCost)) ? Number(deliveryCost) : null };
  const t = Calc.purchaseTotal(pseudo);
  const b = Calc.budget(d);
  const supIds = [...new Set(lines.map(l => l.supplierId).filter(Boolean))];
  return {
    lines, itemsTotal: money(t.items), delivery: money(t.delivery), total: money(t.total), deliveryKnown: pseudo.deliveryCost !== null,
    linesWithoutPrice: t.missing.length, budgetFree: money(b.free), fitsBudget: b.free === null ? null : t.total <= b.free, overBy: b.free !== null && t.total > b.free ? money(t.total - b.free) : null,
    budgetNote: b.free === null ? 'Загальний бюджет не задано, тому перевірити вміщення неможливо' : 'free вже враховує всі заплановані витрати бюджету; закупівлі, ще не внесені в бюджет, сюди не входять',
    supplierTerms: supIds.map(id => { const s = d.suppliers.find(x => x.id === id); return clean({ supplierId: id, supplier: s?.name, minOrder: s?.minOrder || 'не вказано', delivery: s?.deliveryTerms || 'не вказано' }); }),
  };
}
function dataQuality(d) {
  const priceIssues = d.products.map(p => { const age = ageDays(p.priceDate); const iss = [];
    if (Calc.unitCost(p) === null) iss.push('немає закупівельної ціни'); if (p.retailPrice === null) iss.push('немає роздрібної ціни');
    if (!p.priceDate) iss.push('невідома дата ціни'); else if (age > STALE_PRICE_DAYS) iss.push(`ціна застаріла (${age} дн.)`);
    return iss.length ? { productId: p.id, product: p.name, issues: iss } : null; }).filter(Boolean);
  const supplierIssues = d.suppliers.filter(s => s.status !== 'rejected').map(s => { const iss = [];
    if (!s.phone && !s.messenger && !s.instagram && !s.website) iss.push('немає контактів'); if (!s.minOrder) iss.push('невідоме мінімальне замовлення');
    if (!s.deliveryTerms) iss.push('невідомі умови доставки'); if (!s.checkedAt) iss.push('інформацію не перевіряли'); else if (ageDays(s.checkedAt) > STALE_SUPPLIER_DAYS) iss.push(`перевірено ${ageDays(s.checkedAt)} дн. тому`);
    return iss.length ? { supplierId: s.id, supplier: s.name, issues: iss } : null; }).filter(Boolean);
  const purchaseIssues = d.purchases.filter(p => p.status !== 'cancelled').map(p => { const t = Calc.purchaseTotal(p); const iss = [];
    if (t.missing.length) iss.push(`${t.missing.length} позицій без ціни чи кількості`); if (!p.expectedDate && p.status !== 'received') iss.push('немає очікуваної дати');
    return iss.length ? { purchaseId: p.id, purchase: p.title, issues: iss } : null; }).filter(Boolean);
  return { products: priceIssues.slice(0, LIST_LIMIT), suppliers: supplierIssues.slice(0, LIST_LIMIT), purchases: purchaseIssues, warnings: runChecks(d).map(c => c.text) };
}

/* ---------- Зміни з підтвердженням ---------- */
const MAX_PHOTOS = 8;
const PROTECTED = new Set(['id', 'createdAt', 'updatedAt', 'fireAt', 'photos', 'files', 'source']);
const show = v => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
/** Перевіряє пропоновані зміни й будує точний перелік «було → стане». Нічого не змінює. */
export function planChanges(d, changes) {
  need(Array.isArray(changes) && changes.length, 'Немає змін');
  need(changes.length <= 30, 'Забагато змін за раз');
  return changes.map(c => {
    need(['create', 'update', 'delete'].includes(c.action), 'Невідома дія');
    if (c.collection === 'settings') {
      need(c.action === 'update', 'Налаштування можна лише змінювати');
      const v = c.fields?.totalBudget; const n = v === null ? null : Number(v);
      need(v === null || (isNum(n) && n >= 0), 'Бюджет має бути невід’ємним числом');
      return { action: 'update', collection: 'settings', id: 'main', title: 'Загальний бюджет', diff: [{ field: 'totalBudget', from: show(d.settings.totalBudget), to: show(n) }], fields: { totalBudget: n } };
    }
    need(DATA.includes(c.collection), 'Невідома колекція');
    const fields = Object.fromEntries(Object.entries(c.fields || {}).filter(([k]) => !PROTECTED.has(k)));
    if (c.action === 'create') {
      const rec = Schema.normalizeRecord(c.collection, { ...fields, id: 'new' });
      const title = rec.name || rec.title || rec.address; need(String(title || '').trim(), 'У нового запису немає назви');
      return { action: 'create', collection: c.collection, title, fields, diff: Object.keys(fields).map(k => ({ field: k, from: '—', to: show(rec[k]) })) };
    }
    const cur = d[c.collection].find(x => x.id === c.id); need(cur, `Запис ${c.collection}/${c.id} не знайдено`);
    const title = cur.name || cur.title || cur.address || cur.id;
    need(!(c.action === 'delete' && c.collection === 'premises'), 'Приміщення з файлами видаляється лише в розділі «Приміщення»');
    if (c.action === 'delete') return { action: 'delete', collection: c.collection, id: cur.id, title, diff: [] };
    const next = Schema.normalizeRecord(c.collection, { ...cur, ...fields });
    const diff = Object.keys(fields).filter(k => JSON.stringify(cur[k]) !== JSON.stringify(next[k])).map(k => ({ field: k, from: show(cur[k]), to: show(next[k]) }));
    need(diff.length, `Зміни для «${title}» нічого не змінюють`);
    return { action: 'update', collection: c.collection, id: cur.id, title, fields, diff };
  });
}
/** Виконує підтверджені зміни. Повертає список для «Скасувати». */
export async function applyChanges(repo, plan) {
  const undo = [];
  for (const c of plan) {
    if (c.collection === 'settings') { undo.push({ settings: { totalBudget: repo.data.settings.totalBudget } }); await repo.setSettings(c.fields); continue; }
    if (c.action === 'create') { const r = await repo.create(c.collection, c.fields); undo.push({ collection: c.collection, id: r.id, prev: null }); }
    else if (c.action === 'update') { undo.push({ collection: c.collection, id: c.id, prev: { ...repo.get(c.collection, c.id) } }); await repo.update(c.collection, c.id, c.fields); }
    else if (c.action === 'delete') { undo.push({ collection: c.collection, id: c.id, prev: { ...repo.get(c.collection, c.id) } }); if (c.collection === 'suppliers') await repo.removeSupplier(c.id); else await repo.remove(c.collection, c.id); }
  }
  return undo;
}
export async function undoChanges(repo, undo) {
  for (const u of [...undo].reverse()) { if (u.settings) await repo.setSettings(u.settings); else await repo.restore(u.collection, u.id, u.prev); }
}

/* ---------- Виконання інструмента ---------- */
/**
 * Повертає {result, effect}. result іде моделі; effect — для інтерфейсу:
 * {type:'created', collection, id, title} | {type:'confirm', summary, plan} | {type:'draft', supplierId, text}.
 */
export async function runTool(name, input, { repo, now = new Date(), importPhoto = null }) {
  const d = repo.data; input = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'get_overview': return { result: overview(d, now) };
    case 'list_tasks': return { result: listTasks(d, input.filter || 'open') };
    case 'list_reminders': return { result: listReminders(d, input.filter || 'upcoming', now) };
    case 'get_budget': return { result: budget(d) };
    case 'list_purchases': return { result: listPurchases(d, input.status || 'all') };
    case 'search_records': return { result: search(d, input.query, input.collections) };
    case 'get_record': return { result: getRecord(d, input.collection, input.id) };
    case 'compare_offers': return { result: compareOffers(d, input.query) };
    case 'check_purchase_plan': return { result: checkPurchasePlan(d, input.items, input.deliveryCost) };
    case 'data_quality': return { result: dataQuality(d) };
    case 'get_opening_status': return { result: openingStatus(d, now) };
    case 'list_fitout': return { result: listFitout(d, input.status || 'all', input.category) };
    case 'get_monthly_costs': return { result: monthlyCosts(d) };
    case 'add_product_photos': {
      need(typeof importPhoto === 'function', 'Фото за посиланням можна додавати лише після входу в обліковий запис');
      const items = (Array.isArray(input.items) ? input.items : []).slice(0, 30);
      need(items.length, 'Потрібен список товарів із посиланнями на фото');
      const source = /^https?:\/\//i.test(String(input.source || '')) ? String(input.source) : '';
      const done = [];
      for (const it of items) {
        const p = repo.data.products.find(x => x.id === it?.productId);
        if (!p) { done.push({ productId: it?.productId || null, name: '', added: [], failed: ['товар не знайдено'] }); continue; }
        const room = MAX_PHOTOS - (p.photos || []).length;
        const urls = [...new Set((Array.isArray(it.urls) ? it.urls : []).map(u => String(u || '').trim()))].filter(u => /^https:\/\/[^\s"'<>]+$/i.test(u) ).slice(0, Math.max(0, Math.min(4, room)));
        const added = [], failed = [];
        if (room <= 0) failed.push(`у товару вже ${MAX_PHOTOS} фото`);
        else if (!urls.length) failed.push('немає коректних посилань https');
        // Завантажуємо паралельно по кілька, щоб великі підбірки не тягнулися довго.
        const results = await Promise.all(urls.map(u => importPhoto(p.id, u).then(x => ({ ok: x }), e => ({ err: String(e?.message || e) }))));
        results.forEach(r => (r.ok ? added.push(r.ok) : failed.push(r.err)));
        if (added.length) { const cur = repo.data.products.find(x => x.id === p.id); await repo.update('products', p.id, { photos: [...(cur.photos || []), ...added].slice(0, MAX_PHOTOS) }); }
        done.push({ productId: p.id, name: p.name, added: added.map(x => x.id), failed });
      }
      const total = done.reduce((s, x) => s + x.added.length, 0);
      return { result: { added: total, products: done.map(x => ({ productId: x.productId, added: x.added.length, failed: x.failed })) },
        effect: total || done.some(x => x.failed.length) ? { type: 'photos', state: 'applied', batch: true, items: done, source } : null };
    }
    case 'create_task': {
      need(String(input.title || '').trim(), 'Потрібна назва завдання');
      need(!input.deadline || isDate(input.deadline), 'Термін має бути у форматі YYYY-MM-DD');
      const fields = { title: input.title.trim(), deadline: input.deadline || '', priority: input.priority || 'medium', description: input.notes || '', prep: input.prep === true };
      if (input.supplierId && d.suppliers.some(s => s.id === input.supplierId)) fields.supplierId = input.supplierId;
      const r = await repo.create('tasks', fields);
      return { result: { created: true, collection: 'tasks', id: r.id, title: r.title, deadline: r.deadline || null }, effect: { type: 'created', collection: 'tasks', id: r.id, title: r.title } };
    }
    case 'create_note': {
      need(String(input.title || input.body || '').trim(), 'Порожня нотатка');
      const fields = { title: String(input.title || '').trim(), body: String(input.body || '') };
      if (input.supplierId && d.suppliers.some(s => s.id === input.supplierId)) fields.supplierId = input.supplierId;
      const r = await repo.create('notes', fields);
      return { result: { created: true, collection: 'notes', id: r.id, title: r.title }, effect: { type: 'created', collection: 'notes', id: r.id, title: r.title || 'Нотатка' } };
    }
    case 'create_reminder': {
      need(String(input.title || '').trim(), 'Потрібен текст нагадування');
      need(isDate(input.date), 'Дата має бути у форматі YYYY-MM-DD');
      need(/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || ''), 'Час має бути у форматі HH:MM');
      let link = null;
      if (input.linkType && input.linkId) { need(d[Schema.LINK_COLLECTION[input.linkType]]?.some(x => x.id === input.linkId), 'Пов’язаний запис не знайдено'); link = { type: input.linkType, id: input.linkId }; }
      const r = await repo.create('reminders', { title: input.title.trim(), date: input.date, time: input.time, repeat: input.repeat || 'none', status: 'planned', link });
      const p = kyivParts(new Date(r.fireAt));
      return { result: { created: true, collection: 'reminders', id: r.id, title: r.title, when: `${p.date} ${p.time} (Київ)`, inPast: new Date(r.fireAt) <= now }, effect: { type: 'created', collection: 'reminders', id: r.id, title: r.title } };
    }
    case 'propose_changes': {
      const plan = planChanges(d, input.changes);
      return { result: { status: 'awaiting_user_confirmation', note: 'Зміни ще НЕ виконано. Користувач бачить перелік і сам підтвердить або відхилить.', changes: plan.map(p => ({ action: p.action, collection: p.collection, id: p.id, title: p.title, diff: p.diff })) },
        effect: { type: 'confirm', summary: String(input.summary || 'Запропоновані зміни'), plan } };
    }
    case 'draft_message': {
      need(String(input.text || '').trim(), 'Порожня чернетка');
      const s = input.supplierId ? d.suppliers.find(x => x.id === input.supplierId) : null;
      return { result: { drafted: true, sent: false, note: 'Чернетку показано користувачу. Надсилає лише користувач.' }, effect: { type: 'draft', supplierId: s?.id || null, supplier: s?.name || null, text: String(input.text) } };
    }
    default: throw new ToolError('Невідомий інструмент: ' + name);
  }
}
