import { describe, it, expect } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { createRepo } from '../src/core/repo.js';
import { createMemoryAdapter } from '../src/core/storage.js';
import { applyOps, assertStock, markupOf, planReceipt, retailFromMarkup, stockLedger, stockRows, stockTotals } from '../src/core/stock.js';
import { Calc } from '../src/core/calc.js';

const base = (extra = {}) => Schema.normalize({ ...Schema.empty(), suppliers: [{ id: 's1', name: 'Опт А' }, { id: 's2', name: 'Опт Б' }], products: [{ id: 'p1', name: 'Тапки', retailPrice: 160 }, { id: 'p2', name: 'Шкарпетки' }], ...extra });
const pur = (id, fields) => ({ id, title: 'Закупівля ' + id, status: 'received', stockMode: 'auto', receivedDate: '2026-10-01', supplierId: 's1', ...fields });
const qtyOf = (d, id) => stockLedger(d).products.get(id)?.qty ?? 0;
const costOf = (d, id) => stockLedger(d).products.get(id)?.avgCost;

describe('залишки: надходження, собівартість і рух товару', () => {
  it('закупівля зі знижкою: собівартість — ціна після знижки, знижка не застосовується двічі', () => {
    const d = base({ purchases: [pur('a', { discountPct: 10, items: [{ id: 'i1', productId: 'p1', qty: 10, unitPrice: 100 }] })] });
    expect(qtyOf(d, 'p1')).toBe(10);
    expect(costOf(d, 'p1')).toBeCloseTo(90, 6);
    // Повторне збереження тієї самої закупівлі не оприбутковує її вдруге.
    const again = applyOps(d, [{ collection: 'purchases', action: 'update', id: 'a', fields: { comment: 'ще раз' } }]);
    expect(qtyOf(again, 'p1')).toBe(10);
  });
  it('повторна партія за іншою ціною: середньозважена собівартість, роздрібна ціна не змінюється', () => {
    const d = base({ purchases: [
      pur('a', { discountPct: 10, items: [{ id: 'i1', productId: 'p1', qty: 10, unitPrice: 100 }] }),
      pur('b', { supplierId: 's2', receivedDate: '2026-10-05', items: [{ id: 'i2', productId: 'p1', qty: 10, unitPrice: 120 }] }),
    ] });
    expect(qtyOf(d, 'p1')).toBe(20);
    expect(costOf(d, 'p1')).toBeCloseTo(105, 6); // (10×90 + 10×120) ÷ 20
    const st = stockLedger(d).products.get('p1');
    expect(st.suppliers).toEqual(['s1', 's2']);
    expect(st.batches.map(b => [b.supplierId, b.qty, b.unitCost])).toEqual([['s1', 10, 90], ['s2', 10, 120]]);
    const row = stockRows(d).find(r => r.p.id === 'p1');
    expect(row.retail).toBe(160);
    expect(row.profit).toBeCloseTo(55, 6);
  });
  it('продаж зменшує, повернення придатного товару збільшує, непридатного — ні', () => {
    const d = base({
      purchases: [pur('a', { items: [{ id: 'i1', productId: 'p1', qty: 10, unitPrice: 100 }] })],
      moves: [
        { id: 'm1', type: 'sale', productId: 'p1', qty: 4, unitPrice: 160, date: '2026-10-02' },
        { id: 'm2', type: 'return', productId: 'p1', qty: 1, resellable: true, date: '2026-10-03' },
        { id: 'm3', type: 'return', productId: 'p1', qty: 1, resellable: false, date: '2026-10-03' },
      ],
    });
    expect(qtyOf(d, 'p1')).toBe(7);
    expect(costOf(d, 'p1')).toBeCloseTo(100, 6);
  });
  it('списання, повернення постачальнику й коригування з причиною', () => {
    const d = base({
      purchases: [pur('a', { items: [{ id: 'i1', productId: 'p1', qty: 10, unitPrice: 100 }] })],
      moves: [
        { id: 'm1', type: 'writeoff', productId: 'p1', qty: 1, date: '2026-10-02' },
        { id: 'm2', type: 'supplier_return', productId: 'p1', qty: 2, supplierId: 's1', date: '2026-10-02' },
        { id: 'm3', type: 'adjust', direction: 'in', productId: 'p1', qty: 3, unitCost: 140, reason: 'Інвентаризація', date: '2026-10-03' },
        { id: 'm4', type: 'adjust', direction: 'out', productId: 'p1', qty: 1, reason: 'Пересорт', date: '2026-10-04' },
      ],
    });
    expect(qtyOf(d, 'p1')).toBe(9);
    expect(costOf(d, 'p1')).toBeCloseTo((7 * 100 + 3 * 140) / 10, 6);
  });
  it('заплановані, замовлені, скасовані й облікові до запуску закупівлі не входять у залишок', () => {
    const items = [{ id: 'i1', productId: 'p1', qty: 5, unitPrice: 100 }];
    const d = base({ purchases: [pur('a', { status: 'planned', items }), pur('b', { status: 'ordered', items }), pur('c', { status: 'cancelled', items }), pur('e', { stockMode: 'legacy', items })] });
    expect(qtyOf(d, 'p1')).toBe(0);
    expect(stockLedger(d).legacy.map(p => p.id)).toEqual(['e']);
  });
  it('варіанти: розмір і колір мають окремі залишки; повторна партія того ж варіанта не дублює його', () => {
    const d = base({ purchases: [
      pur('a', { items: [{ id: 'i1', productId: 'p1', qty: 3, unitPrice: 100, size: '38', color: 'Сірий' }, { id: 'i2', productId: 'p1', qty: 2, unitPrice: 100, size: '40', color: 'сірий' }] }),
      pur('b', { items: [{ id: 'i3', productId: 'p1', qty: 4, unitPrice: 100, size: ' 38 ', color: 'сірий' }] }),
    ] });
    const v = stockLedger(d).products.get('p1').variants;
    expect(v.map(x => [x.size, x.qty])).toEqual([['38', 7], ['40', 2]]);
    expect(() => assertStock(d, [{ collection: 'moves', action: 'create', id: 'm', fields: { type: 'sale', productId: 'p1', size: '40', color: 'Сірий', qty: 3 } }])).toThrow(/від’ємним/);
    expect(() => assertStock(d, [{ collection: 'moves', action: 'create', id: 'm', fields: { type: 'sale', productId: 'p1', size: '40', color: 'Сірий', qty: 2 } }])).not.toThrow();
  });
  it('не можна продати більше, ніж є, чи скасувати отриману закупівлю, з якої вже продано', () => {
    const d = base({ purchases: [pur('a', { items: [{ id: 'i1', productId: 'p1', qty: 5, unitPrice: 100 }] })], moves: [{ id: 'm1', type: 'sale', productId: 'p1', qty: 4, date: '2026-10-02' }] });
    expect(() => assertStock(d, [{ collection: 'moves', action: 'create', id: 'm2', fields: { type: 'sale', productId: 'p1', qty: 2 } }])).toThrow();
    expect(() => assertStock(d, [{ collection: 'purchases', action: 'update', id: 'a', fields: { status: 'cancelled' } }])).toThrow();
    expect(() => assertStock(d, [{ collection: 'purchases', action: 'remove', id: 'a' }])).toThrow();
    // Редагування операції враховує вже внесене: продаж 4 → 5 можливий, 4 → 6 ні.
    expect(() => assertStock(d, [{ collection: 'moves', action: 'update', id: 'm1', fields: { qty: 5 } }])).not.toThrow();
    expect(() => assertStock(d, [{ collection: 'moves', action: 'update', id: 'm1', fields: { qty: 6 } }])).toThrow();
    // Скасування продажу повертає товар.
    expect(qtyOf(applyOps(d, [{ collection: 'moves', action: 'remove', id: 'm1' }]), 'p1')).toBe(5);
  });
});

describe('націнка й роздрібна ціна', () => {
  it('собівартість 100, націнка 60% → роздріб 160, прибуток 60; маржа — не націнка', () => {
    expect(retailFromMarkup(100, 60)).toBe(160);
    expect(markupOf(100, 160)).toBeCloseTo(60, 6);
    expect(Calc.margin(100, 160)).toBeCloseTo(37.5, 6);
  });
});

describe('рядки й підсумки розділу', () => {
  it('стан наявності, мінімальний залишок і товари без роздрібної ціни', () => {
    const d = base({ settings: { stockMin: 3 }, purchases: [pur('a', { items: [{ id: 'i1', productId: 'p1', qty: 2, unitPrice: 100 }, { id: 'i2', productId: 'p2', qty: 10, unitPrice: 20 }] })] });
    const rows = stockRows(d);
    expect(rows.find(r => r.p.id === 'p1').state).toBe('low');
    expect(rows.find(r => r.p.id === 'p2').state).toBe('in');
    const t = stockTotals(rows);
    expect(t).toMatchObject({ positions: 2, units: 12, costValue: 400, retailValue: 320, gross: 120, noRetail: { positions: 1, units: 10 } });
  });
});

describe('оприбуткування вільних позицій', () => {
  it('вільна позиція прив’язується до товару з такою ж назвою, нова — створює товар; постачальник підставляється', () => {
    const d = base();
    let n = 0;
    const plan = planReceipt(d, pur('a', { supplierId: 's2', items: [{ id: 'i1', name: ' тапки ', qty: 2, unitPrice: 90 }, { id: 'i2', name: 'Піжама', qty: 1, unitPrice: 300, retailPrice: 550, size: 'M' }] }), () => 'new' + ++n);
    expect(plan.purchase.items.map(i => i.productId)).toEqual(['p1', 'new1']);
    expect(plan.created).toEqual(['Піжама']);
    expect(plan.ops).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection: 'products', action: 'create', id: 'new1', fields: expect.objectContaining({ supplierId: 's2', retailPrice: 550, sizes: 'M' }) }),
      { collection: 'products', action: 'update', id: 'p1', fields: { supplierId: 's2' } },
    ]));
    // Не отримана закупівля нічого не створює.
    expect(planReceipt(d, pur('b', { status: 'ordered', items: [{ id: 'x', name: 'Нове' }] }), () => 'z').ops).toEqual([]);
  });
});

describe('міграція v4', () => {
  it('уже отримані закупівлі не стають поточним залишком, інші оприбуткуються після отримання', () => {
    const items = [{ id: 'i1', productId: 'p1', qty: 5, unitPrice: 100 }];
    const d = Schema.normalize(Schema.migrate({ app: 'turka-shop', schemaVersion: 3, products: [{ id: 'p1', name: 'Тапки' }], purchases: [{ id: 'a', title: 'Стара', status: 'received', items }, { id: 'b', title: 'В дорозі', status: 'awaiting', items }] }));
    expect(d.schemaVersion).toBe(4);
    expect(d.moves).toEqual([]);
    expect(d.purchases.map(p => p.stockMode)).toEqual(['legacy', 'auto']);
    expect(qtyOf(d, 'p1')).toBe(0);
    const later = applyOps(d, [{ collection: 'purchases', action: 'update', id: 'b', fields: { status: 'received' } }]);
    expect(qtyOf(later, 'p1')).toBe(5);
  });
  it('repo.commit зберігає кілька змін одним записом', async () => {
    const repo = createRepo(); await repo.open('real', createMemoryAdapter());
    await repo.commit([{ collection: 'products', action: 'create', id: 'x1', fields: { name: 'Новий' } }, { collection: 'moves', action: 'create', id: 'm1', fields: { type: 'adjust', productId: 'x1', qty: 2, reason: 'Інвентаризація' } }]);
    expect(repo.get('products', 'x1').name).toBe('Новий');
    expect(repo.get('moves', 'm1')).toMatchObject({ type: 'adjust', direction: 'in', qty: 2, reason: 'Інвентаризація' });
    expect(stockLedger(repo.data).products.get('x1').qty).toBe(2);
  });
});
