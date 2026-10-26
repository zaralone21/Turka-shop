import { describe, expect, it } from 'vitest';
import { cartGroups, cartTotals, itemFromProduct, lineSum, lineUnits, minOrderProgress, purchaseFromGroup, qtyText, sourceChanges, supplierListText, withCatalogLinks } from '../src/core/cart.js';
import { Calc } from '../src/core/calc.js';
import { Schema } from '../src/core/schema.js';

const nb = s => s.replace(/[  ]/g, ' ');
const S = [{ id: 's1', name: 'Фабрика', minOrderQty: 150, minOrderUnit: 'pair' }, { id: 's2', name: 'Взуття', minOrderSum: 3000 }];
const pack = { id: 'p1', name: 'Шкарпетки', unit: 'pair', supplierId: 's1', priceType: 'pack', purchasePrice: 360, packQty: 12, sku: 'A1', url: 'x.com/a' };
const unit = { id: 'p2', name: 'Тапки', unit: 'pair', supplierId: 's2', priceType: 'unit', purchasePrice: 250 };
const noPack = { id: 'p3', name: 'Колготки', supplierId: 's1', priceType: 'pack', purchasePrice: 500, packQty: null };
const noPrice = { id: 'p4', name: 'Без ціни', unit: 'pair', supplierId: 's2', priceType: 'unit', purchasePrice: null };

describe('кошик закупівель', () => {
  it('упаковка: ціна за упаковку не множиться на пари повторно', () => {
    const it = { ...itemFromProduct(pack), qty: 3 };
    expect(lineUnits(it)).toBe(36); expect(lineSum(it)).toBe(1080);
    expect(nb(qtyText(it))).toBe('3 упаковки × 12 пар = 36 пар');
  });
  it('невідомий розмір упаковки не вигадується', () => {
    const it = itemFromProduct(noPack);
    expect(lineUnits(it)).toBeNull(); expect(lineSum(it)).toBe(500);
    expect(qtyText(it)).toMatch(/потребує уточнення/);
  });
  it('відсутня ціна не дорівнює нулю, сума неповна', () => {
    const cart = [itemFromProduct(unit), itemFromProduct(noPrice)].map(x => Schema.normalizeRecord('cart', x));
    const g = cartGroups(cart, S); const t = cartTotals(g);
    expect(lineSum(cart[1])).toBeNull(); expect(t.goods).toBe(250); expect(t.incomplete).toBe(true); expect(t.noPrice.length).toBe(1);
  });
  it('доставка: порожня — не врахована, 0 — безкоштовна', () => {
    const cart = [itemFromProduct(unit), itemFromProduct(pack), { id: 'delivery-s2', kind: 'supplier', supplierId: 's2', delivery: 0 }].map(x => Schema.normalizeRecord('cart', x));
    const t = cartTotals(cartGroups(cart, S));
    expect(t.suppliers).toBe(2); expect(t.delivery).toBe(0); expect(t.noDelivery.map(g => g.supplierId)).toEqual(['s1']);
  });
  it('частковий вибір: необрані не рахуються', () => {
    const a = itemFromProduct(unit), b = { ...itemFromProduct(noPrice), selected: false };
    const t = cartTotals(cartGroups([a, b], S));
    expect(t.positions).toBe(1); expect(t.incomplete).toBe(false);
  });
  it('мінімальне замовлення: пари не додаються до штук, упаковки враховуються', () => {
    const items = [{ ...itemFromProduct(pack), qty: 10 }, itemFromProduct(noPack)];
    const [q] = minOrderProgress({ qty: 150, unit: 'pair' }, items);
    expect(q.text).toBe('Обрано 120 із мінімальних 150 пар'); expect(q.ok).toBe(false); expect(q.note).toMatch(/1 позицію/);
    const [s] = minOrderProgress({ sum: 3000 }, [itemFromProduct(unit), { ...itemFromProduct(unit), qty: 9 }]);
    expect(nb(s.text)).toMatch(/^До мінімального замовлення залишилось 500 ₴/);
  });
  it('закупівля: модель «Закупівель», знімок цін, статус «Заплановано»', () => {
    const it = { ...itemFromProduct(pack), qty: 3, price: 330 };
    const [g] = cartGroups([it, { id: 'delivery-s1', kind: 'supplier', supplierId: 's1', delivery: 150 }].map(x => Schema.normalizeRecord('cart', x)), S);
    const p = Schema.normalizeRecord('purchases', purchaseFromGroup(g, { title: 'T' }));
    expect(p.status).toBe('planned'); expect(p.supplierId).toBe('s1'); expect(p.deliveryCost).toBe(150);
    expect(p.items[0]).toMatchObject({ productId: 'p1', qty: 36, unitPrice: 27.5, packs: 3, packQty: 12, agreedPrice: 330, priceFor: 'pack', sku: 'A1' });
    expect(Calc.purchaseTotal(p).total).toBeCloseTo(1140);
  });
  it('зміни в каталозі показуються, а не застосовуються мовчки', () => {
    const it = itemFromProduct(pack);
    expect(sourceChanges(it, pack)).toEqual([]);
    expect(sourceChanges(it, { ...pack, purchasePrice: 400 })).toEqual(['закупівельна ціна']);
    expect(sourceChanges(it, null)).toEqual(['deleted']);
    // Перше посилання в каталозі — не зміна; позиція бере його з товару.
    const noUrl = { ...it, url: '', src: { ...it.src, url: '' } };
    expect(sourceChanges(noUrl, { ...pack, url: 'https://x.ua/p' })).toEqual([]);
    expect(withCatalogLinks([noUrl], [{ ...pack, url: 'https://x.ua/p' }])[0].url).toBe('https://x.ua/p');
    expect(sourceChanges({ ...it, url: 'https://a.ua', src: { ...it.src, url: 'https://a.ua' } }, { ...pack, url: 'https://b.ua' })).toEqual(['посилання']);
  });
  it('список для постачальника без роздробу й маржі', () => {
    const p = { ...pack, retailPrice: 99, comment: 'секрет' };
    const [g] = cartGroups([{ ...itemFromProduct(p), qty: 2 }], S);
    const t = supplierListText(g);
    expect(t).toMatch(/орієнтовні/); expect(t).toMatch(/арт\. A1/); expect(t).toMatch(/2 упаковки × 12 пар = 24 пар/); expect(t).toMatch(/720 ₴/);
    expect(t).not.toMatch(/99|секрет|маржа/i);
  });
});
