import { describe, it, expect } from 'vitest';
import { Calc } from '../src/core/calc.js';
import { createRepo } from '../src/core/repo.js';
import { Schema } from '../src/core/schema.js';
import { SEC_ALL, SEC_NONE, filterBySection, planSections, sectionCounts, sectionIdOf, validKey } from '../src/core/supplierSections.js';
import { purchaseAmount } from '../src/core/opening.js';
import { firstBuySummary } from '../src/core/workspace.js';

const cents = n => Math.round(n * 100);

describe('знижка постачальника на закупівлю', () => {
  it('приклад: товари 10 000 ₴, знижка 10% → знижка 1 000 ₴, до оплати 9 000 ₴', () => {
    const t = Calc.purchaseTotal({ items: [{ qty: 100, unitPrice: 100 }], discountPct: 10 });
    expect(t).toMatchObject({ goods: 10000, discountPct: 10, discount: 1000, items: 9000, delivery: 0, total: 9000 });
  });
  it('доставка додається після знижки й не знижується', () => {
    const t = Calc.purchaseTotal({ items: [{ qty: 10, unitPrice: 50 }], discountPct: 20, deliveryCost: 150 });
    expect(t).toMatchObject({ goods: 500, discount: 100, items: 400, delivery: 150, total: 550 });
    expect(purchaseAmount({ items: [{ qty: 10, unitPrice: 50 }], discountPct: 20, deliveryCost: 150 })).toBe(550);
  });
  it('дробовий відсоток і копійки; позиції після знижки в сумі дорівнюють підсумку', () => {
    const p = { discountPct: 7.5, deliveryCost: 99.9, items: [{ id: 'a', qty: 3, unitPrice: 33.33 }, { id: 'b', qty: 7, unitPrice: 12.47 }, { id: 'c', qty: 1, unitPrice: 0.01 }, { id: 'd', qty: 2.5, unitPrice: 19.99 }] };
    const t = Calc.purchaseLines(p);
    expect(t.goods).toBe(237.27);
    expect(t.discount).toBe(17.8);
    expect(t.items).toBe(219.47);
    expect(t.lines.reduce((a, l) => a + cents(l.net), 0)).toBe(cents(t.items));
    expect(t.lines.reduce((a, l) => a + cents(l.discount), 0)).toBe(cents(t.goods) - cents(t.items));
    // початкові ціни збережено, фактична собівартість одиниці нижча
    const a = t.lines.find(l => l.id === 'a');
    expect(a.unitPrice).toBe(33.33); expect(a.unitNet).toBeCloseTo(33.33 * 0.925, 1);
    expect(cents(t.total)).toBe(cents(219.47 + 99.9));
  });
  it('маржа й прибуток позиції рахуються від ціни після знижки', () => {
    const t = Calc.purchaseLines({ discountPct: 10, items: [{ id: 'x', qty: 10, unitPrice: 100, retailPrice: 150 }] });
    const l = t.lines[0];
    expect(l.unitNet).toBe(90); expect(l.net).toBe(900); expect(l.profit).toBe(600);
    expect(l.margin).toBeCloseTo(40, 6);
  });
  it('стара закупівля без поля знижки рахується як раніше (0%)', () => {
    const old = { items: [{ qty: 3, unitPrice: 33.333 }, { qty: 2, unitPrice: 10 }], deliveryCost: 50 };
    const t = Calc.purchaseTotal(old);
    expect(t.discountPct).toBe(0); expect(t.discount).toBe(0);
    expect(t.total).toBe(3 * 33.333 + 20 + 50);
    const n = Schema.normalizeRecord('purchases', { title: 'Стара', items: old.items.map((i, k) => ({ ...i, name: 'п' + k })) });
    expect(n.discountPct).toBe(0);
  });
  it('знижка 100% — товари безкоштовні, доставка лишається', () => {
    expect(Calc.purchaseTotal({ items: [{ qty: 2, unitPrice: 75 }], discountPct: 100, deliveryCost: 40 })).toMatchObject({ discount: 150, items: 0, total: 40 });
  });
  it('нормалізація: некоректна або від’ємна знижка → 0, більша за 100 → 100, рядок із комою → число', () => {
    const n = v => Schema.normalizeRecord('purchases', { title: 't', discountPct: v }).discountPct;
    expect(n('abc')).toBe(0); expect(n(-5)).toBe(0); expect(n(150)).toBe(100); expect(n('7,5')).toBe(7.5); expect(n(undefined)).toBe(0);
  });
  it('собівартість стартової закупівлі враховує знижку', () => {
    const d = Schema.empty();
    d.purchases.push(Schema.normalizeRecord('purchases', { title: 'Старт', firstPurchase: true, discountPct: 10, deliveryCost: 100, items: [{ name: 'Шкарпетки', qty: 10, unitPrice: 100, retailPrice: 150 }] }));
    const s = firstBuySummary(d);
    expect(s.cost).toBe(1000); // 900 товари після знижки + 100 доставка
    expect(s.gross).toBe(500);
  });
});

describe('розділи товарів у постачальника', () => {
  const sup = { id: 's1', sections: [{ id: 'ss-a', name: 'Шкарпетки' }, { id: 'ss-b', name: 'Піжами' }] };
  const prods = [
    { id: 'p1', supplierId: 's1', supplierSectionId: 'ss-a', name: 'Шкарпетки бамбук', sku: 'A1' },
    { id: 'p2', supplierId: 's1', supplierSectionId: 'ss-b', name: 'Піжама атласна' },
    { id: 'p3', supplierId: 's1', supplierSectionId: null, name: 'Шкарпетки махрові' },
    { id: 'p4', supplierId: 's1', supplierSectionId: 'ss-gone', name: 'Халат' },
  ];
  it('кількість товарів по розділах; неіснуючий розділ — «Без розділу»', () => {
    expect(sectionCounts(prods, sup)).toEqual({ [SEC_ALL]: 4, [SEC_NONE]: 2, 'ss-a': 1, 'ss-b': 1 });
    expect(sectionIdOf(prods[3], sup)).toBe(null);
  });
  it('пошук працює в межах розділу, а в «Усі товари» — по всьому асортименту', () => {
    expect(filterBySection(prods, sup, SEC_ALL, 'шкарпетки').map(p => p.id)).toEqual(['p1', 'p3']);
    expect(filterBySection(prods, sup, 'ss-a', 'шкарпетки').map(p => p.id)).toEqual(['p1']);
    expect(filterBySection(prods, sup, SEC_NONE, '').map(p => p.id)).toEqual(['p3', 'p4']);
    expect(filterBySection(prods, sup, 'ss-a', 'a1').map(p => p.id)).toEqual(['p1']);
    expect(validKey(sup, 'ss-gone')).toBe(SEC_ALL);
  });
  it('перевірка змін: порожні назви й дублікати відхиляються, видалені розділи повертаються', () => {
    expect(planSections(sup.sections, [{ id: 'ss-a', name: 'Шкарпетки' }, { name: 'шкарпетки' }]).ok).toBe(false);
    expect(planSections(sup.sections, [{ name: '  ' }]).ok).toBe(false);
    const p = planSections(sup.sections, [{ id: 'ss-b', name: 'Піжами й халати' }, { name: 'Рушники' }]);
    expect(p.ok).toBe(true);
    expect(p.sections[0]).toEqual({ id: 'ss-b', name: 'Піжами й халати' });
    expect(p.sections[1].id).toMatch(/^ss-/);
    expect(p.removed.map(x => x.id)).toEqual(['ss-a']);
  });
  it('видалення розділу: товари переходять у «Без розділу», товари й закупівлі зберігаються', async () => {
    const repo = createRepo(); const d = Schema.empty();
    d.suppliers.push({ id: 's1', name: 'Опт', sections: sup.sections }, { id: 's2', name: 'Інший', sections: [{ id: 'ss-a', name: 'Шкарпетки' }] });
    d.products.push(...prods.slice(0, 3), { id: 'p9', supplierId: 's2', supplierSectionId: 'ss-a', name: 'Чужий товар' });
    d.purchases.push({ id: 'u1', title: 'Закупівля', supplierId: 's1', items: [{ id: 'i1', productId: 'p1', name: 'Шкарпетки бамбук', qty: 5, unitPrice: 20 }] });
    await repo.open('real', { kind: 'memory', load: async () => JSON.parse(JSON.stringify(d)), save: async () => {} });
    await repo.setSupplierSections('s1', [{ id: 'ss-b', name: 'Піжами' }]);
    expect(repo.get('suppliers', 's1').sections).toEqual([{ id: 'ss-b', name: 'Піжами' }]);
    expect(repo.get('products', 'p1').supplierSectionId).toBe(null);
    expect(repo.get('products', 'p2').supplierSectionId).toBe('ss-b');
    expect(repo.data.products).toHaveLength(4);
    expect(repo.get('products', 'p9').supplierSectionId).toBe('ss-a'); // розділи іншого постачальника незалежні
    expect(repo.get('purchases', 'u1').items[0].productId).toBe('p1');
  });
  it('старі дані без розділів: постачальник отримує порожній список, товари — «Без розділу»', () => {
    const out = Schema.normalize(Schema.migrate({ app: 'turka-shop', schemaVersion: 3, suppliers: [{ id: 's1', name: 'Опт' }], products: [{ id: 'p1', name: 'Товар', supplierId: 's1' }, { id: 'p2', name: 'Інший', supplierId: 's1', supplierSectionId: 'nope' }] }));
    expect(out.suppliers[0].sections).toEqual([]);
    expect(out.products.map(p => p.supplierSectionId)).toEqual([null, null]);
    expect(out.products).toHaveLength(2);
  });
});
