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
    const s1 = add('suppliers', { name: 'Приклад: Трикотажна фабрика', categories: ['Шкарпетки', 'Колготки'], instagram: '@demo_socks', website: 'https://example.com', phone: '+380 00 000 00 00', messenger: 'Telegram', contactPerson: 'Менеджер (приклад)', city: 'Харків', minOrder: 'від 5 000 ₴', paymentTerms: '50% передоплата', deliveryTerms: 'Нова пошта за рахунок покупця', defectTerms: 'Обмін браку протягом 14 днів', notes: 'Демонстраційний запис', status: 'working', checkedAt: off(-10) });
    const s2 = add('suppliers', { name: 'Приклад: Домашнє взуття', categories: ['Домашні тапки'], instagram: '@demo_slippers', website: '', phone: '', messenger: 'Viber', contactPerson: '', city: 'Хмельницький', minOrder: '20 пар', paymentTerms: 'Повна оплата', deliveryTerms: '', defectTerms: '', notes: '', status: 'contact', checkedAt: off(-120) });
    add('products', { name: 'Шкарпетки бавовняні (приклад)', category: 'Шкарпетки', sku: 'DEMO-01', supplierId: s1.id, url: '', sizes: '36–40, 41–45', colors: 'чорний, сірий', priceType: 'pack', purchasePrice: 360, packQty: 12, retailPrice: 65, priceDate: off(-10), comment: '' });
    add('products', { name: 'Тапки флісові (приклад)', category: 'Домашні тапки', sku: 'DEMO-02', supplierId: s2.id, url: '', sizes: '36–41', colors: 'бежевий', priceType: 'unit', purchasePrice: 140, packQty: null, retailPrice: 279, priceDate: off(-40), comment: '' });
    add('notes', { title: 'Ідеї для вітрини (приклад)', body: 'Сезонна викладка тапок біля входу.\nШкарпетки — на стійці біля каси.', tags: ['вітрина'], pinned: true, supplierId: null });
    add('tasks', { title: 'Підписати договір оренди (приклад)', description: '', deadline: off(-2), priority: 'high', status: 'in_progress', checklist: [{ id: uid(), text: 'Перевірити договір', done: true }, { id: uid(), text: 'Узгодити дату заїзду', done: false }] });
    add('tasks', { title: 'Замовити вивіску (приклад)', description: '', deadline: off(7), priority: 'medium', status: 'planned', checklist: [] });
    add('expenses', { name: 'Оренда за перший місяць (приклад)', categoryId: 'rent', planned: 30000, paid: 30000, comment: '' });
    add('expenses', { name: 'Депозит орендодавцю (приклад)', categoryId: 'deposit', planned: 30000, paid: 30000, comment: 'Повертається при виїзді' });
    add('expenses', { name: 'Стелажі та прилавок (приклад)', categoryId: 'furniture', planned: 60000, paid: 25000, comment: '' });
    add('expenses', { name: 'Перша партія товару (приклад)', categoryId: 'first_stock', planned: 180000, paid: 0, comment: '' });
    const p1 = d.products[0];
    add('purchases', { title: 'Шкарпетки на відкриття (приклад)', supplierId: s1.id, status: 'awaiting', expectedDate: off(4), deliveryCost: 150, items: [{ id: uid(), productId: p1.id, name: p1.name, qty: 120, unitPrice: 30 }] });
    add('purchases', { title: 'Тапки на зиму (приклад)', supplierId: s2.id, status: 'planned', expectedDate: off(20), deliveryCost: null, items: [{ id: uid(), productId: d.products[1].id, name: d.products[1].name, qty: 20, unitPrice: 140 }] });
    add('reminders', { title: 'Написати постачальнику про доставку (приклад)', date: off(0), time: '10:00', repeat: 'none', status: 'planned', link: { type: 'supplier', id: s1.id } });
    add('reminders', { title: 'Оплатити оренду (приклад)', date: off(3), time: '09:00', repeat: 'monthly', status: 'planned', link: null });
    return Schema.normalize(d);
  },
};
