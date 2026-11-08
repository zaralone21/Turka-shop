import { describe, expect, it } from 'vitest';
import { Calc } from '../src/core/calc.js';

describe('Calc.packEconomics', () => {
  it('приклад: 40 ₴/од., 12 у пачці, роздріб 70 ₴', () => {
    expect(Calc.packEconomics({ priceType: 'unit', purchasePrice: 40, packQty: 12, retailPrice: 70 }))
      .toEqual({ packQty: 12, unitCost: 40, packCost: 480, revenue: 840, packProfit: 360, unitProfit: 30 });
  });
  it('ціна за пачку не множиться вдруге', () => {
    const e = Calc.packEconomics({ priceType: 'pack', purchasePrice: 480, packQty: 12, retailPrice: 70 });
    expect(e).toMatchObject({ unitCost: 40, packCost: 480, revenue: 840, packProfit: 360, unitProfit: 30 });
  });
  it('копійки й від’ємний прибуток', () => {
    const e = Calc.packEconomics({ priceType: 'unit', purchasePrice: 33.33, packQty: 3, retailPrice: 30.1 });
    expect(e).toMatchObject({ packCost: 99.99, revenue: 90.3, packProfit: -9.69, unitProfit: -3.23 });
    expect(Calc.packEconomics({ priceType: 'pack', purchasePrice: 100, packQty: 3, retailPrice: 40 })).toMatchObject({ unitCost: 33.33, packCost: 100, packProfit: 20 });
  });
  it('без даних — null, а не нуль', () => {
    const e = Calc.packEconomics({ priceType: 'unit', purchasePrice: 40, packQty: 12, retailPrice: null });
    expect(e).toMatchObject({ packCost: 480, revenue: null, packProfit: null, unitProfit: null });
    expect(Calc.packEconomics({ priceType: 'unit', purchasePrice: 40, packQty: null, retailPrice: 70 })).toMatchObject({ packCost: null, revenue: null, packProfit: null, unitProfit: 30 });
    for (const packQty of [0, -2, 1.5]) expect(Calc.packEconomics({ priceType: 'unit', purchasePrice: 40, packQty, retailPrice: 70 }).packCost).toBeNull();
    expect(Calc.packEconomics({ priceType: 'unit', purchasePrice: -1, packQty: 12, retailPrice: 70 }).packCost).toBeNull();
  });
  it('фактична собівартість після знижки замінює ціну з картки й не знижується вдруге', () => {
    const e = Calc.packEconomics({ priceType: 'pack', purchasePrice: 480, packQty: 12, retailPrice: 70, cost: 36 });
    expect(e).toMatchObject({ unitCost: 36, packCost: 432, revenue: 840, packProfit: 408, unitProfit: 34 });
  });
});
