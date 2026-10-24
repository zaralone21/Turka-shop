import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/core/checks.js';
import { runTool, planChanges } from '../src/core/aiTools.js';
import { createRepo } from '../src/core/repo.js';
import {
  fitoutSummary, isLeaseConfirmed, monthlySummary, nextPayDate, openingReadiness, premisesBudgetPlan,
  purchaseLink, fitoutLink, simpleAvgMargin, weightedMargin, expenseOrigins,
} from '../src/core/opening.js';
import { Schema } from '../src/core/schema.js';
import { APP_ID, SCHEMA_VERSION, addDaysISO, todayISO } from '../src/core/utils.js';

const clone = x => JSON.parse(JSON.stringify(x));

/** Резервна копія у форматі v2, як її зберігала попередня версія застосунку. */
const v2Backup = () => ({
  app: APP_ID, schemaVersion: 2,
  settings: { totalBudget: 150000, breakeven: { fixed: '30000', margin: '45', extra: '', avgCheck: '400', days: '26' }, sections: [{ name: 'Шкарпетки', subs: ['Махрові'] }], sectionsRev: 3, unknownSetting: 'x' },
  suppliers: [{ id: 's1', name: 'Опт', status: 'contact', futureField: 7 }],
  products: [{ id: 'p1', name: 'Шкарпетки', supplierId: 's1', purchasePrice: 25, retailPrice: 60, category: 'Шкарпетки', subcategory: 'Махрові' }],
  notes: [{ id: 'n1', title: 'Нотатка', body: 'текст' }],
  tasks: [{ id: 't1', title: 'Завдання', status: 'todo' }],
  expenses: [{ id: 'e1', name: 'Ремонт', categoryId: 'repair', planned: 20000, paid: 5000 }],
  purchases: [{ id: 'u1', title: 'Перша партія', status: 'planned', items: [{ qty: 10, unitPrice: 25 }], expenseId: 'e1' }],
  reminders: [{ id: 'r1', title: 'Подзвонити', date: '2026-11-01', time: '10:00', link: { type: 'supplier', id: 's1' } }],
  chats: [],
});

async function repoWith(fill) {
  const repo = createRepo(); const d = Schema.empty(); fill && fill(d);
  await repo.open('real', { kind: 'memory', load: async () => clone(d), save: async () => {} });
  return repo;
}

describe('міграція старих даних до v3', () => {
  it('стара копія v2 імпортується без втрат і отримує нові порожні розділи', () => {
    const src = v2Backup();
    const r = Schema.validateImport(clone(src));
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    const d = r.data;
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
    for (const k of ['suppliers', 'products', 'notes', 'tasks', 'expenses', 'purchases', 'reminders']) expect(d[k].length).toBe(src[k].length);
    expect(d.premises).toEqual([]); expect(d.fitout).toEqual([]); expect(d.monthly).toEqual([]);
    expect(d.suppliers[0].futureField).toBe(7);
    expect(d.settings.unknownSetting).toBe('x');
    expect(d.settings.totalBudget).toBe(150000);
    expect(d.settings.breakeven).toMatchObject({ fixed: '30000', margin: '45', salesPlan: {} });
    expect(d.settings.openingDate).toBe('');
    expect(d.products[0]).toMatchObject({ category: 'Шкарпетки', subcategory: 'Махрові' });
    expect(d.purchases[0].expenseId).toBe('e1');
    expect(d.reminders[0].link).toEqual({ type: 'supplier', id: 's1' });
  });
  it('нові розділи зберігаються й повторно нормалізуються без змін', () => {
    const d = Schema.empty();
    d.premises.push({ id: 'pr1', address: 'вул. Шевченка, 1', status: 'negotiating', rent: '15 000', files: [{ id: 'f1', path: 'u/pr1/f1.jpg', name: 'фасад.jpg', type: 'image/jpeg', kind: 'photo' }, { path: '../../etc' }] });
    d.fitout.push({ id: 'f1', name: 'Стелаж', category: 'shelves', planned: 5000, status: 'ordered' });
    d.monthly.push({ id: 'm1', name: 'Комунальні', kind: 'utilities', amount: 2500, payDay: 40 });
    const once = Schema.normalize(Schema.migrate(clone(d)));
    expect(once.premises[0].rent).toBe(15000);
    expect(once.premises[0].files.length).toBe(1);
    expect(once.monthly[0].payDay).toBe(null);
    const twice = Schema.normalize(Schema.migrate(clone(once)));
    expect(twice.premises).toEqual(once.premises);
    expect(twice.fitout).toEqual(once.fitout);
  });
  it('імпорт перевіряє назви нових записів', () => {
    const r = Schema.validateImport({ app: APP_ID, schemaVersion: 3, fitout: [{ id: 'x' }] });
    expect(r.ok).toBe(false);
  });
});

describe('приміщення', () => {
  it('вибране приміщення не вважається орендованим', () => {
    expect(isLeaseConfirmed({ status: 'selected' })).toBe(false);
    expect(isLeaseConfirmed({ status: 'negotiating' })).toBe(false);
    expect(isLeaseConfirmed({ status: 'signed' })).toBe(true);
    expect(isLeaseConfirmed({ status: 'keys' })).toBe(true);
  });
  it('план внесення в бюджет не створює дублів: create → same → update', () => {
    const d = Schema.normalize(Schema.migrate({ ...Schema.empty(), premises: [{ id: 'pr', address: 'А', rent: 15000, deposit: 15000, otherPayments: [{ id: 'o1', name: 'Ріелтор', amount: 7500 }] }] }));
    const pr = d.premises[0];
    let plan = premisesBudgetPlan(d, pr);
    expect(plan.map(x => x.action)).toEqual(['create', 'create', 'create']);
    plan.forEach((x, i) => d.expenses.push({ id: 'e' + i, name: x.name, categoryId: x.categoryId, planned: x.amount, paid: 0, source: { type: 'premises', id: pr.id, part: x.part } }));
    plan = premisesBudgetPlan(d, pr);
    expect(plan.map(x => x.action)).toEqual(['same', 'same', 'same']);
    pr.rent = 16000;
    plan = premisesBudgetPlan(d, pr);
    expect(plan[0]).toMatchObject({ action: 'update', from: 15000, amount: 16000 });
    expect(plan[1].action).toBe('same');
  });
  it('невідома сума пропускається, а не вигадується', () => {
    const d = Schema.normalize(Schema.migrate({ ...Schema.empty(), premises: [{ id: 'pr', name: 'Точка' }] }));
    expect(premisesBudgetPlan(d, d.premises[0]).map(x => x.action)).toEqual(['skip', 'skip']);
  });
  it('готовність: непідписаний договір — перешкода', () => {
    const d = Schema.normalize(Schema.migrate({ ...Schema.empty(), settings: { openingDate: addDaysISO(todayISO(), 30) }, premises: [{ id: 'pr', name: 'Точка', status: 'selected' }] }));
    const r = openingReadiness(d);
    expect(r.premises.leaseConfirmed).toBe(false);
    expect(r.blockers.some(b => b.ref && b.ref.collection === 'premises')).toBe(true);
    expect(r.daysLeft).toBe(30);
  });
});

describe('закупівлі й облаштування ↔ бюджет', () => {
  const base = () => Schema.normalize(Schema.migrate({ ...Schema.empty(),
    expenses: [{ id: 'e1', name: 'Партія', categoryId: 'first_stock', planned: 250, paid: 100 }, { id: 'e2', name: 'Меблі', categoryId: 'furniture', planned: 9000, paid: 4000 }],
    purchases: [{ id: 'u1', title: 'Партія', items: [{ name: 'Шкарпетки', qty: 10, unitPrice: 25 }], expenseId: 'e1' }],
    fitout: [{ id: 'f1', name: 'Стелаж', planned: 5000, expenseId: 'e2' }, { id: 'f2', name: 'Прилавок', planned: 4000, expenseId: 'e2' }, { id: 'f3', name: 'Дзеркало', planned: 1200 }],
  }));
  it('розбіжність після зміни суми закупівлі', () => {
    const d = base();
    expect(purchaseLink(d, d.purchases[0]).state).toBe('ok');
    d.purchases[0].items[0].qty = 12;
    expect(purchaseLink(d, d.purchases[0])).toMatchObject({ state: 'mismatch', amount: 300, planned: 250 });
    expect(runChecks(d).some(c => c.ref && c.ref.id === 'u1')).toBe(true);
  });
  it('видалена стаття бюджету розпізнається', () => {
    const d = base(); d.expenses = d.expenses.filter(e => e.id !== 'e1');
    expect(purchaseLink(d, d.purchases[0]).state).toBe('missing');
  });
  it('сплачене облаштування береться з бюджету один раз на статтю', () => {
    const d = base(); const s = fitoutSummary(d);
    expect(s.planned).toBe(10200);
    expect(s.paid).toBe(4000);
    expect(s.notInBudget).toBe(1);
    expect(fitoutLink(d, d.fitout[0]).state).toBe('mismatch');
    expect(expenseOrigins(d, d.expenses[1]).map(o => o.id)).toEqual(['f1', 'f2']);
  });
});

describe('щомісячні витрати', () => {
  it('оренда з приміщення не дублюється й рахується окремо від бюджету відкриття', () => {
    const d = Schema.normalize(Schema.migrate({ ...Schema.empty(),
      premises: [{ id: 'pr', name: 'Точка', rent: 15000, deposit: 15000 }],
      monthly: [{ id: 'm1', name: 'Оренда', kind: 'rent', amount: 15000 }, { id: 'm2', name: 'Комунальні', kind: 'utilities', amount: 2500 }, { id: 'm3', name: 'Реклама', kind: 'ads' }],
      expenses: [{ id: 'e1', name: 'Депозит', categoryId: 'deposit', planned: 15000 }] }));
    const s = monthlySummary(d);
    expect(s.total).toBe(17500);
    expect(s.duplicates.map(m => m.id)).toEqual(['m1']);
    expect(s.missing.map(m => m.id)).toEqual(['m3']);
  });
  it('без приміщення рахується власна стаття оренди', () => {
    const d = Schema.normalize(Schema.migrate({ ...Schema.empty(), monthly: [{ id: 'm1', name: 'Оренда', kind: 'rent', amount: 12000 }] }));
    expect(monthlySummary(d).total).toBe(12000);
  });
  it('дата оплати враховує короткі місяці', () => {
    expect(nextPayDate(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextPayDate(5, '2026-02-10')).toBe('2026-03-05');
    expect(nextPayDate(10, '2026-02-10')).toBe('2026-02-10');
    expect(nextPayDate(31, '2026-12-31')).toBe('2026-12-31');
  });
});

describe('маржа', () => {
  const products = [
    { id: 'a', name: 'Шкарпетки', purchasePrice: 20, retailPrice: 50 }, // маржа 60%
    { id: 'b', name: 'Піжама', purchasePrice: 600, retailPrice: 800 },  // маржа 25%
    { id: 'c', name: 'Без ціни', retailPrice: 100 },
  ].map(p => Schema.normalizeRecord('products', p));
  it('просте середнє — довідкове', () => {
    expect(simpleAvgMargin(products).margin).toBeCloseTo(42.5);
  });
  it('зважена маржа = (виручка − собівартість) / виручка', () => {
    const r = weightedMargin(products, { a: 100, b: 10, c: 5 });
    // виручка 5000 + 8000 = 13000; собівартість 2000 + 6000 = 8000
    expect(r.revenue).toBe(13000);
    expect(r.cost).toBe(8000);
    expect(r.margin).toBeCloseTo(5000 / 13000 * 100);
    expect(r.skipped.map(x => x.id)).toEqual(['c']);
  });
  it('без плану маржі немає', () => {
    expect(weightedMargin(products, {}).margin).toBe(null);
    expect(weightedMargin(products, { a: 0 }).margin).toBe(null);
  });
  it('план продажів нормалізується', () => {
    const d = Schema.normalize({ ...Schema.empty(), settings: { breakeven: { salesPlan: { a: '10', b: 5, 'bad key!': '1', c: { x: 1 } } } } });
    expect(d.settings.breakeven.salesPlan).toEqual({ a: '10', b: '5' });
  });
});

describe('AI: дані підготовки до відкриття', () => {
  it('get_opening_status розділяє факти й домовленості', async () => {
    const repo = await repoWith(d => {
      d.premises.push(Schema.normalizeRecord('premises', { id: 'pr', name: 'Точка', status: 'selected', rent: 15000 }));
      d.fitout.push(Schema.normalizeRecord('fitout', { id: 'f1', name: 'Вивіска', category: 'signage', planned: 8000 }));
    });
    const { result } = await runTool('get_opening_status', {}, { repo });
    expect(result.premises.leaseConfirmed).toBe(false);
    expect(result.facts.join(' ')).not.toMatch(/Точка/);
    expect(result.plansAndAgreements.join(' ')).toMatch(/НЕ підтверджена/);
    expect(result.unknown).toContain('Планова дата відкриття не задана');
    expect(result.fitout.stillNeeded[0]).toMatchObject({ id: 'f1', budget: 'не в бюджеті' });
  });
  it('нові колекції доступні для пошуку й нагадувань', async () => {
    const repo = await repoWith(d => { d.premises.push(Schema.normalizeRecord('premises', { id: 'pr', address: 'вул. Сонячна, 5', payDay: 5 })); });
    const s = await runTool('search_records', { query: 'сонячна' }, { repo });
    expect(s.result.premises.count).toBe(1);
    const r = await runTool('create_reminder', { title: 'Оплатити оренду', date: '2026-11-05', time: '10:00', repeat: 'monthly', linkType: 'premises', linkId: 'pr' }, { repo });
    expect(repo.get('reminders', r.result.id).link).toEqual({ type: 'premises', id: 'pr' });
  });
  it('AI не може видалити приміщення чи підмінити файли', async () => {
    const repo = await repoWith(d => { d.premises.push(Schema.normalizeRecord('premises', { id: 'pr', name: 'Точка' })); });
    expect(() => planChanges(repo.data, [{ action: 'delete', collection: 'premises', id: 'pr' }])).toThrow();
    expect(() => planChanges(repo.data, [{ action: 'update', collection: 'premises', id: 'pr', fields: { files: [] } }])).toThrow();
  });
});
