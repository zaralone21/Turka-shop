import { describe, it, expect } from 'vitest';
import { Calc } from '../src/core/calc.js';
import { Schema } from '../src/core/schema.js';

describe('ціни товарів', () => {
  it('рахує ціну одиниці з упаковки', () => {
    expect(Calc.unitCost({ priceType: 'pack', purchasePrice: 360, packQty: 12 })).toBe(30);
    expect(Calc.unitCost({ priceType: 'unit', purchasePrice: 140 })).toBe(140);
    expect(Calc.unitCost({ priceType: 'pack', purchasePrice: 360, packQty: 0 })).toBeNull();
  });
  it('рахує націнку й маржу', () => {
    expect(Calc.markup(30, 65)).toBeCloseTo(116.667, 2);
    expect(Calc.margin(30, 65)).toBeCloseTo(53.846, 2);
    expect(Calc.markup(0, 65)).toBeNull();
    expect(Calc.margin(30, 0)).toBeNull();
  });
});

describe('бюджет відкриття', () => {
  const data = () => {
    const d = Schema.empty();
    d.settings.totalBudget = 100000;
    d.expenses = [
      { categoryId: 'deposit', planned: 20000, paid: 20000 },
      { categoryId: 'rent', planned: 30000, paid: 35000 },
      { categoryId: 'furniture', planned: 40000, paid: 10000 },
    ];
    return d;
  };
  it('не рахує витрату двічі', () => {
    const b = Calc.budget(data());
    expect(b.planned).toBe(90000);
    expect(b.paid).toBe(65000);
    expect(b.toPay).toBe(30000);
    expect(b.needed).toBe(95000); // 20000 + 35000 (фактично більше плану) + 40000
    expect(b.free).toBe(5000);
    expect(b.overPlan).toBe(5000);
  });
  it('показує депозит окремо, але враховує в потрібній сумі', () => {
    const b = Calc.budget(data());
    expect(b.deposit.needed).toBe(20000);
    expect(b.nonRefundable).toBe(75000);
  });
  it('показує перевищення як від’ємний вільний бюджет', () => {
    const d = data(); d.settings.totalBudget = 90000;
    expect(Calc.budget(d).free).toBe(-5000);
  });
});

describe('беззбитковість', () => {
  const ok = { fixed: '40000', margin: '45', extra: '5', avgCheck: '400', days: '26' };
  it('рахує за формулою', () => {
    const r = Calc.breakeven(ok);
    expect(r.ok).toBe(true);
    expect(r.monthly).toBeCloseTo(100000, 6);
    expect(r.daily).toBeCloseTo(3846.15, 2);
    expect(r.purchases).toBe(10);
  });
  it('приймає кому в числах', () => {
    expect(Calc.breakeven({ ...ok, margin: '45,0' }).ok).toBe(true);
  });
  it('не округлює вгору через похибку обчислень', () => {
    expect(Calc.breakeven({ fixed: '1000', margin: '50', extra: '0', avgCheck: '100', days: '10' }).purchases).toBe(2);
  });
  it('відмовляє, коли змінні витрати ≥ маржі', () => {
    const r = Calc.breakeven({ ...ok, margin: '5', extra: '5' });
    expect(r.ok).toBe(false);
    expect(r.general).toMatch(/більшою/);
  });
  it('пояснює некоректні поля', () => {
    const r = Calc.breakeven({ fixed: '', margin: 'abc', extra: '120', avgCheck: '0', days: '2.5' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['avgCheck', 'days', 'extra', 'fixed', 'margin']);
  });
});
