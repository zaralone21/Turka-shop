import { describe, it, expect } from 'vitest';
import { runTurn, sanitizeAssistant } from '../src/core/aiAgent.js';
import { applyChanges, checkPurchasePlan, compareOffers, planChanges, runTool, undoChanges } from '../src/core/aiTools.js';
import { Calc } from '../src/core/calc.js';
import { createRepo } from '../src/core/repo.js';
import { Schema } from '../src/core/schema.js';
import { addDaysISO, todayISO } from '../src/core/utils.js';

async function repoWith(fill) {
  const repo = createRepo(); const d = Schema.empty(); fill && fill(d);
  await repo.open('real', { kind: 'memory', load: async () => JSON.parse(JSON.stringify(d)), save: async () => {} });
  return repo;
}
const sample = d => {
  d.settings.totalBudget = 100000;
  d.suppliers.push({ id: 's1', name: 'Опт Шкарпетки', minOrder: 'від 3000 ₴', deliveryTerms: 'Нова пошта', phone: '+380' }, { id: 's2', name: 'Тапки Ко' });
  d.products.push(
    { id: 'p1', name: 'Шкарпетки бамбук', supplierId: 's1', priceType: 'pack', purchasePrice: 300, packQty: 10, retailPrice: 70, priceDate: todayISO() },
    { id: 'p2', name: 'Шкарпетки бамбук преміум', supplierId: 's2', purchasePrice: 25, retailPrice: 80, priceDate: addDaysISO(todayISO(), -100) },
    { id: 'p3', name: 'Шкарпетки бамбук дитячі', supplierId: 's2' });
  d.expenses.push({ id: 'e1', name: 'Оренда', categoryId: 'rent', planned: 20000, paid: 20000 }, { id: 'e2', name: 'Ремонт', categoryId: 'repair', planned: 30000, paid: 10000 });
  d.tasks.push({ id: 't1', title: 'Прострочене', deadline: addDaysISO(todayISO(), -2) });
};

describe('інструменти AI: розрахунки з перевірених функцій', () => {
  it('порівняння пропозицій: ціна за одиницю, застарілі й бракуючі дані', async () => {
    const repo = await repoWith(sample);
    const r = compareOffers(repo.data, 'шкарпетки бамбук');
    expect(r.found).toBe(3);
    expect(r.cheapestUnitCost).toMatchObject({ productId: 'p2', unitCost: 25 });
    const p1 = r.offers.find(o => o.productId === 'p1');
    expect(p1.unitCost).toBe(Calc.unitCost(repo.get('products', 'p1')));
    expect(p1.priceStale).toBe(false);
    expect(r.offers.find(o => o.productId === 'p2').priceStale).toBe(true);
    expect(r.offers.find(o => o.productId === 'p3').missing).toContain('закупівельна ціна');
    expect(r.offers.find(o => o.productId === 'p2').missing).toContain('мінімальне замовлення');
  });
  it('план закупівлі: сума за Calc.purchaseTotal і перевірка вільного бюджету', async () => {
    const repo = await repoWith(sample);
    const r = checkPurchasePlan(repo.data, [{ productId: 'p1', qty: 100 }, { productId: 'p3', qty: 10 }], 500);
    expect(r.itemsTotal).toBe(3000); expect(r.total).toBe(3500); expect(r.linesWithoutPrice).toBe(1);
    const b = Calc.budget(repo.data); expect(r.budgetFree).toBe(b.free); expect(b.free).toBe(50000);
    expect(r.fitsBudget).toBe(true);
    const big = checkPurchasePlan(repo.data, [{ productId: 'p2', qty: 3000 }]);
    expect(big.fitsBudget).toBe(false); expect(big.overBy).toBe(25000);
  });
  it('кошик закупівель видно менеджеру: id товарів, посилання, фото й фільтри', async () => {
    const repo = await repoWith(d => {
      sample(d);
      d.suppliers[0].website = 'opt.ua';
      d.products[0].url = 'https://opt.ua/p1'; d.products[0].photos = [{ id: 'f1', path: 'u1/p1/f1.jpg' }];
      d.cart.push({ id: 'c1', kind: 'item', productId: 'p1', supplierId: 's1', name: 'Шкарпетки бамбук', sku: 'A1', url: '', buyBy: 'pack', packQty: 10, qty: 2, price: 300 },
        { id: 'c2', kind: 'item', productId: 'p3', supplierId: 's2', name: 'Шкарпетки бамбук дитячі', qty: 5, price: 20 });
    });
    const all = (await runTool('list_cart', { filter: 'all' }, { repo })).result;
    expect(all.summary).toMatchObject({ positions: 2, suppliers: 2, goodsSum: 700, withoutUrl: 1, withoutPhotos: 1 });
    const g1 = all.groups.find(g => g.supplierId === 's1');
    expect(g1.website).toBe('opt.ua');
    expect(g1.items[0]).toMatchObject({ productId: 'p1', url: 'https://opt.ua/p1', photos: 1, units: 20, sum: 600 });
    const noUrl = (await runTool('list_cart', { filter: 'no_url' }, { repo })).result;
    expect(noUrl.groups.flatMap(g => g.items).map(i => i.productId)).toEqual(['p3']);
    expect((await runTool('get_overview', {}, { repo })).result.cart.positions).toBe(2);
  });
  it('огляд показує прострочене й бюджет', async () => {
    const repo = await repoWith(sample);
    const { result } = await runTool('get_overview', {}, { repo });
    expect(result.tasks.overdue[0].id).toBe('t1');
    expect(result.budget).toMatchObject({ total: 100000, paid: 30000, needed: 50000, free: 50000 });
  });
  it('створює завдання й нагадування одразу і дає скасувати', async () => {
    const repo = await repoWith(sample);
    const t = await runTool('create_task', { title: 'Подзвонити в Тапки Ко', deadline: '2026-11-01', priority: 'high' }, { repo });
    expect(repo.get('tasks', t.result.id)).toMatchObject({ title: 'Подзвонити в Тапки Ко', deadline: '2026-11-01', priority: 'high' });
    const r = await runTool('create_reminder', { title: 'Нагадати про оплату', date: '2026-11-02', time: '10:30', linkType: 'supplier', linkId: 's1' }, { repo });
    const rem = repo.get('reminders', r.result.id);
    expect(rem.fireAt).toBe('2026-11-02T08:30:00.000Z');
    expect(rem.link).toEqual({ type: 'supplier', id: 's1' });
    await repo.restore('reminders', rem.id, null);
    expect(repo.get('reminders', rem.id)).toBeNull();
  });
  it('відхиляє некоректні дані', async () => {
    const repo = await repoWith(sample);
    await expect(runTool('create_reminder', { title: 'x', date: 'завтра', time: '10:00' }, { repo })).rejects.toThrow('YYYY-MM-DD');
    await expect(runTool('create_reminder', { title: 'x', date: '2026-11-02', time: '25:00' }, { repo })).rejects.toThrow('HH:MM');
    await expect(runTool('get_record', { collection: 'suppliers', id: 'nope' }, { repo })).rejects.toThrow('не знайдено');
  });
  it('зміни й видалення лише пропонуються з точним переліком, виконуються після підтвердження і скасовуються', async () => {
    const repo = await repoWith(sample);
    const before = JSON.stringify(repo.data);
    const { result, effect } = await runTool('propose_changes', { summary: 'Оновити ціну й видалити дубль', changes: [
      { action: 'update', collection: 'products', id: 'p2', fields: { purchasePrice: 27, priceDate: todayISO() } },
      { action: 'delete', collection: 'products', id: 'p3' },
      { action: 'update', collection: 'settings', fields: { totalBudget: 120000 } },
    ] }, { repo });
    expect(JSON.stringify(repo.data)).toBe(before);           // нічого не змінилось
    expect(result.status).toBe('awaiting_user_confirmation');
    expect(effect.plan[0].diff).toContainEqual({ field: 'purchasePrice', from: '25', to: '27' });
    expect(effect.plan[2].diff[0]).toMatchObject({ from: '100000', to: '120000' });
    const undo = await applyChanges(repo, effect.plan);
    expect(repo.get('products', 'p2').purchasePrice).toBe(27);
    expect(repo.get('products', 'p3')).toBeNull();
    expect(repo.data.settings.totalBudget).toBe(120000);
    await undoChanges(repo, undo);
    expect(repo.get('products', 'p2').purchasePrice).toBe(25);
    expect(repo.get('products', 'p3')).not.toBeNull();
    expect(repo.data.settings.totalBudget).toBe(100000);
  });
  it('зміна, що нічого не змінює, або неіснуючий запис — помилка', async () => {
    const repo = await repoWith(sample);
    expect(() => planChanges(repo.data, [{ action: 'update', collection: 'products', id: 'p2', fields: { purchasePrice: 25 } }])).toThrow('нічого не змінюють');
    expect(() => planChanges(repo.data, [{ action: 'delete', collection: 'tasks', id: 'zzz' }])).toThrow('не знайдено');
  });
  it('чернетка повідомлення нічого не надсилає', async () => {
    const repo = await repoWith(sample);
    const { result, effect } = await runTool('draft_message', { supplierId: 's1', text: 'Добрий день!' }, { repo });
    expect(result.sent).toBe(false); expect(effect).toMatchObject({ type: 'draft', supplier: 'Опт Шкарпетки' });
  });
});

describe('цикл розмови з моделлю (імітація)', () => {
  const scripted = steps => { let i = 0; const seen = []; const fn = async messages => { seen.push(JSON.parse(JSON.stringify(messages))); return steps[i++](messages); }; fn.seen = seen; return fn; };
  it('модель створює завдання й нагадування з повідомлення', async () => {
    const repo = await repoWith(sample);
    const callModel = scripted([
      () => ({ stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'Замовити тапки', deadline: '2026-11-05' } }, { type: 'tool_use', id: 'tu2', name: 'create_reminder', input: { title: 'Перевірити замовлення', date: '2026-11-04', time: '09:00' } }] }),
      msgs => { const last = msgs[msgs.length - 1]; const id = JSON.parse(last.content[0].content).id; return { stop_reason: 'end_turn', content: [{ type: 'text', text: `Створив [завдання](app://tasks/${id}).` }] }; },
    ]);
    const chat = await runTurn({ chat: { messages: [], log: [] }, text: 'Нагадай 4 листопада перевірити замовлення і додай задачу замовити тапки до 5-го', repo, callModel });
    expect(repo.data.tasks.some(t => t.title === 'Замовити тапки')).toBe(true);
    expect(repo.data.reminders.some(r => r.title === 'Перевірити замовлення' && r.date === '2026-11-04')).toBe(true);
    expect(chat.log.filter(l => l.type === 'created')).toHaveLength(2);
    // обидва результати інструментів в одному повідомленні, блоки thinking повернуто без змін
    const second = callModel.seen[1];
    expect(second[1].content[0]).toEqual({ type: 'thinking', thinking: '', signature: 'sig' });
    expect(second[2].content.map(b => b.tool_use_id)).toEqual(['tu1', 'tu2']);
    expect(second[0].content[0].text).toMatch(/^\[Зараз: \d{4}-\d{2}-\d{2} \d{2}:\d{2}, Київ\]/);
  });
  it('помилка інструмента повертається моделі як is_error, а не ламає розмову', async () => {
    const repo = await repoWith(sample);
    const callModel = scripted([
      () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'get_record', input: { collection: 'suppliers', id: 'nope' } }] }),
      () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Такого постачальника немає.' }] }),
    ]);
    await runTurn({ chat: { messages: [], log: [] }, text: '?', repo, callModel });
    expect(callModel.seen[1][2].content[0].is_error).toBe(true);
  });
  it('без сервера AI — чесна помилка, без вигаданої відповіді', async () => {
    const repo = await repoWith(sample);
    const chat = await runTurn({ chat: { messages: [], log: [] }, text: 'привіт', repo, callModel: async () => { throw Object.assign(new Error('Потрібне підключення AI'), { code: 'not_configured' }); } });
    expect(chat.log.at(-1)).toMatchObject({ type: 'error', code: 'not_configured' });
    expect(chat.log.some(l => l.role === 'assistant')).toBe(false);
  });
  it('новий хід після обірваного виклику інструмента додає відповіді на всі виклики', async () => {
    const repo = await repoWith(sample);
    const chat = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'get_overview', input: {} }] }], log: [] };
    const callModel = scripted([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })]);
    await runTurn({ chat, text: 'далі', repo, callModel });
    expect(callModel.seen[0][2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'z' });
  });
  it('після переходу на резервну модель блоки до позначки не повертаються', () => {
    expect(sanitizeAssistant([{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'fallback' }, { type: 'thinking' }, { type: 'text', text: 'b' }]).map(b => b.type)).toEqual(['text', 'fallback', 'thinking', 'text']);
  });
});
