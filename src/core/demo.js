import { Schema } from './schema.js';
import { addDaysISO, nowISO, todayISO, uid } from './utils.js';

/* =====================================================================
   5. ДЕМО-ДАНІ (лише в окремому режимі, ніколи не змішуються з вашими)
   ===================================================================== */
export const Demo = {
  build() {
    const d = Schema.empty(); const t = nowISO();
    const add = (k, x) => { const r = { id: uid(), createdAt: t, updatedAt: t, ...x }; d[k].push(r); return r; };
    const off = n => addDaysISO(todayISO(), n);
    d.settings.totalBudget = 450000;
    d.settings.breakeven = { fixed: '42000', margin: '45', extra: '3', avgCheck: '420', days: '26' };
    const s1 = add('suppliers', { name: 'Приклад: Трикотажна фабрика', categories: ['Шкарпетки', 'Колготи'], instagram: '@demo_socks', website: 'https://example.com', phone: '+380 00 000 00 00', messenger: 'Telegram', contactPerson: 'Менеджер (приклад)', city: 'Харків', minOrder: 'від 5 000 ₴', paymentTerms: '50% передоплата', deliveryTerms: 'Нова пошта за рахунок покупця', defectTerms: 'Обмін браку протягом 14 днів', notes: 'Демонстраційний запис', status: 'working', checkedAt: off(-10) });
    const s2 = add('suppliers', { name: 'Приклад: Домашнє взуття', categories: ['Тапки'], instagram: '@demo_slippers', website: '', phone: '', messenger: 'Viber', contactPerson: '', city: 'Хмельницький', minOrder: '20 пар', paymentTerms: 'Повна оплата', deliveryTerms: '', defectTerms: '', notes: '', status: 'contact', checkedAt: off(-120) });
    add('products', { name: 'Шкарпетки бавовняні (приклад)', category: 'Шкарпетки', subcategory: 'Стрейч', sku: 'DEMO-01', supplierId: s1.id, url: '', sizes: '36–40, 41–45', colors: 'чорний, сірий', priceType: 'pack', purchasePrice: 360, packQty: 12, retailPrice: 65, priceDate: off(-10), comment: '' });
    add('products', { name: 'Тапки флісові (приклад)', category: 'Тапки', sku: 'DEMO-02', supplierId: s2.id, url: '', sizes: '36–41', colors: 'бежевий', priceType: 'unit', purchasePrice: 140, packQty: null, retailPrice: 279, priceDate: off(-40), comment: '' });
    add('notes', { title: 'Ідеї для вітрини (приклад)', body: 'Сезонна викладка тапок біля входу.\nШкарпетки — на стійці біля каси.', tags: ['вітрина'], pinned: true, supplierId: null });
    d.settings.openingDate = off(45);
    add('premises', { name: 'Приклад: ТЦ «Центральний», 1 поверх', address: 'вул. Прикладна, 1', area: 38, status: 'negotiating', landlordName: 'Орендодавець (приклад)', rent: 30000, deposit: 30000, payDay: 5, utilitiesSeparate: 'Електроенергія за лічильником', notes: 'Умови ще погоджуються (приклад).', files: [] });
    add('tasks', { title: 'Підписати договір оренди (приклад)', prep: true, description: '', deadline: off(-2), priority: 'high', status: 'in_progress', checklist: [{ id: uid(), text: 'Перевірити договір', done: true }, { id: uid(), text: 'Узгодити дату заїзду', done: false }] });
    const t1 = add('tasks', { title: 'Замовити вивіску (приклад)', prep: true, description: '', deadline: off(7), priority: 'medium', status: 'planned', checklist: [] });
    add('tasks', { title: 'Обрати касовий апарат (приклад)', prep: true, description: '', deadline: off(14), priority: 'high', status: 'done', checklist: [] });
    add('expenses', { name: 'Оренда за перший місяць (приклад)', categoryId: 'rent', planned: 30000, paid: 30000, comment: '' });
    add('expenses', { name: 'Депозит орендодавцю (приклад)', categoryId: 'deposit', planned: 30000, paid: 30000, comment: 'Повертається при виїзді' });
    add('expenses', { name: 'Стелажі та прилавок (приклад)', categoryId: 'furniture', planned: 60000, paid: 25000, comment: '' });
    add('expenses', { name: 'Перша партія товару (приклад)', categoryId: 'first_stock', planned: 180000, paid: 0, comment: '' });
    const furn = d.expenses.find(e => e.categoryId === 'furniture');
    add('fitout', { name: 'Стелажі пристінні (приклад)', category: 'shelves', qty: 4, size: '200×90 см', planned: 40000, status: 'ordered', deadline: off(20), priority: 'high', expenseId: furn.id });
    add('fitout', { name: 'Прилавок (приклад)', category: 'counter', qty: 1, planned: 20000, status: 'chosen', deadline: off(25), priority: 'medium', expenseId: furn.id });
    add('fitout', { name: 'Вивіска (приклад)', category: 'signage', qty: 1, planned: 15000, status: 'undecided', deadline: off(30), priority: 'medium', taskId: t1.id });
    add('fitout', { name: 'Дзеркало в примірочну (приклад)', category: 'mirrors', qty: 1, planned: null, status: 'undecided', priority: 'low' });
    add('monthly', { name: 'Комунальні', kind: 'utilities', amount: 3500, payDay: 10, comment: 'приклад' });
    add('monthly', { name: 'Зарплата продавця', kind: 'salary', amount: 18000, payDay: 1, comment: 'приклад' });
    add('monthly', { name: 'Зв’язок та інтернет', kind: 'telecom', amount: 500, comment: 'приклад' });
    add('monthly', { name: 'Реклама', kind: 'ads', amount: null, comment: 'приклад' });
    const p1 = d.products[0];
    add('purchases', { title: 'Шкарпетки на відкриття (приклад)', supplierId: s1.id, status: 'awaiting', expectedDate: off(4), deliveryCost: 150, items: [{ id: uid(), productId: p1.id, name: p1.name, qty: 120, unitPrice: 30 }] });
    add('purchases', { title: 'Тапки на зиму (приклад)', supplierId: s2.id, status: 'planned', expectedDate: off(20), deliveryCost: null, items: [{ id: uid(), productId: d.products[1].id, name: d.products[1].name, qty: 20, unitPrice: 140 }] });
    // Отримані закупівлі й рух товару — для розділу «Товари в наявності».
    const p2 = d.products[1];
    add('purchases', { title: 'Тапки на осінь (приклад)', supplierId: s2.id, status: 'received', stockMode: 'auto', receivedDate: off(-12), discountPct: 10, deliveryCost: null,
      items: [{ id: uid(), productId: p2.id, name: p2.name, qty: 8, unitPrice: 140, size: '36–38' }, { id: uid(), productId: p2.id, name: p2.name, qty: 6, unitPrice: 140, size: '39–41' }] });
    add('purchases', { title: 'Шкарпетки, дозамовлення (приклад)', supplierId: s1.id, status: 'received', stockMode: 'auto', receivedDate: off(-5), deliveryCost: 120,
      items: [{ id: uid(), productId: p1.id, name: p1.name, qty: 24, unitPrice: 32, color: 'чорний' }, { id: uid(), productId: p1.id, name: p1.name, qty: 2, unitPrice: 32, color: 'сірий' }] });
    add('moves', { type: 'sale', productId: p2.id, size: '36–38', qty: 6, unitPrice: 279, date: off(-3) });
    add('moves', { type: 'return', productId: p2.id, size: '36–38', qty: 1, resellable: true, date: off(-1) });
    add('reminders', { title: 'Написати постачальнику про доставку (приклад)', date: off(0), time: '10:00', repeat: 'none', status: 'planned', link: { type: 'supplier', id: s1.id } });
    add('reminders', { title: 'Оплатити оренду (приклад)', date: off(3), time: '09:00', repeat: 'monthly', status: 'planned', link: null });
    return Schema.normalize(d);
  },
};
