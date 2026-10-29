import { describe, it, expect } from 'vitest';
import { Calc } from '../src/core/calc.js';
import { Schema } from '../src/core/schema.js';
import { stockLedger } from '../src/core/stock.js';

describe('кількість одиниць в упаковці', () => {
  it('2 упаковки по 12 пар, упаковка 240 ₴ → 24 пари, 20 ₴/пара, сума 480 ₴', () => {
    expect(Calc.packLine({ packs: 2, packQty: 12, price: 240, priceFor: 'pack' })).toEqual({ qty: 24, unitPrice: 20, sum: 480, packQty: 12 });
    expect(Calc.packLine({ packs: 3, packQty: 12, price: 20, priceFor: 'unit' })).toMatchObject({ qty: 36, unitPrice: 20, sum: 720 });
    expect(Calc.packLine({ packs: 5, packQty: 1, price: 140, priceFor: 'unit' })).toMatchObject({ qty: 5, unitPrice: 140, sum: 700 });
  });
  it('за замовчуванням 1 для наявних товарів; збережені значення не змінюються', () => {
    const d = Schema.normalize({ ...Schema.empty(), products: [{ id: 'a', name: 'Тапки' }, { id: 'b', name: 'Шкарпетки', priceType: 'pack', purchasePrice: 240, packQty: 12, unit: 'pair' }, { id: 'c', name: 'Без розміру', priceType: 'pack', purchasePrice: 100 }] });
    expect(d.products.map(p => p.packQty)).toEqual([1, 12, null]);
    expect(Calc.unitCost(d.products[1])).toBe(20);
    expect(Calc.unitCost(d.products[2])).toBeNull(); // розмір упаковки невідомий — ціну одиниці не вигадуємо
  });
  it('старі позиції закупівель не перераховуються, нові зберігають власний розмір упаковки', () => {
    const d = Schema.normalize({ ...Schema.empty(), products: [{ id: 'b', name: 'Шкарпетки', unit: 'pair' }], purchases: [
      { id: 'old', title: 'Стара', items: [{ id: 'i1', productId: 'b', name: 'Шкарпетки', qty: 30, unitPrice: 21 }] },
      { id: 'new', title: 'Нова', status: 'received', stockMode: 'auto', receivedDate: '2026-10-29', discountPct: 10, items: [{ id: 'i2', productId: 'b', name: 'Шкарпетки', packs: 2, packQty: 12, priceFor: 'pack', agreedPrice: 240, qty: 24, unitPrice: 20 }] },
    ] });
    expect(d.purchases[0].items[0]).toMatchObject({ qty: 30, unitPrice: 21, packQty: 1, priceFor: 'unit' });
    expect(d.purchases[1].items[0]).toMatchObject({ qty: 24, unitPrice: 20, packs: 2, packQty: 12, priceFor: 'pack' });
    expect(Calc.purchaseTotal(d.purchases[1])).toMatchObject({ goods: 480, discount: 48, total: 432 });
    // У залишку — пари, собівартість пари після знижки 18 ₴: можна продавати поштучно.
    const s = stockLedger(d).products.get('b');
    expect(s.qty).toBe(24);
    expect(s.avgCost).toBeCloseTo(18, 6);
  });
});
