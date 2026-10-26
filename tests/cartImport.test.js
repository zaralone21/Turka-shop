import { describe, expect, it } from 'vitest';
import { planCartImport } from '../src/core/cartImport.js';
import { lineSum } from '../src/core/cart.js';
import { Schema } from '../src/core/schema.js';

const base = () => Schema.normalize({ ...Schema.empty(), suppliers: [{ id: 's1', name: 'JUBI', website: 'https://jubi.ua/' }], products: [{ id: 'p1', name: 'Шкарпетки А', supplierId: 's1', purchasePrice: 40 }] });
const file = items => ({ format: 'komfort-cart-import', suppliers: [{ key: 'j', name: 'Jubi', website: 'jubi.ua' }, { key: 'p', name: 'Parad', website: 'paradobuvi.ua' }], items });

describe('імпорт у кошик', () => {
  it('знаходить наявних постачальника й товар, не дублює', () => {
    const r = planCartImport(file([{ supplier: 'j', name: 'Шкарпетки  а', purchasePrice: 45, qty: 10 }, { supplier: 'p', name: 'Тапочки F200', priceType: 'pack', packQty: 12, purchasePrice: 2280, qty: 1, unit: 'pair' }]), base());
    expect(r.ok).toBe(true);
    expect(r.plan.suppliers.map(s => s.name)).toEqual(['Parad']);
    expect(r.plan.products.map(p => p.name)).toEqual(['Тапочки F200']);
    expect(r.plan.cart[0]).toMatchObject({ productId: 'p1', qty: 10, price: 45 });
    expect(r.plan.lines[0].catalogPrice).toBe(40);
    expect(lineSum(r.plan.cart[1])).toBe(2280);
    expect(r.plan.cart[1]).toMatchObject({ buyBy: 'pack', packQty: 12, unit: 'pair' });
  });
  it('пропускає те, що вже в кошику', () => {
    const d = base(); d.cart = [{ id: 'c1', kind: 'item', productId: 'p1', qty: 3 }];
    const r = planCartImport(file([{ supplier: 'j', name: 'Шкарпетки А', purchasePrice: 40, qty: 10 }]), d);
    expect(r.plan.cart.length).toBe(0); expect(r.plan.lines[0].inCart).toBe(true);
  });
  it('відхиляє некоректні рядки й чужі файли', () => {
    expect(planCartImport({ app: 'x' }, base()).ok).toBe(false);
    const r = planCartImport(file([{ supplier: 'j', name: 'X', purchasePrice: -1, qty: 1 }, { supplier: 'j', name: 'Y', qty: 0 }, { supplier: 'zz', name: 'Z', qty: 1 }]), base());
    expect(r.ok).toBe(false); expect(r.errors.length).toBe(3);
  });
});
