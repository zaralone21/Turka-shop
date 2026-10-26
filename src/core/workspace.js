import { Calc } from './calc.js';
import { todayISO } from './utils.js';
import { monthlySummary } from './opening.js';

export function parseQuick(text, today = todayISO()) {
  const raw = text.trim(); let title = raw, date = '', amount = null;
  const relative = /(?<!\p{L})(післязавтра|сьогодні|завтра)(?!\p{L})/iu.exec(title);
  if (relative) {
    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + ({ сьогодні: 0, завтра: 1, післязавтра: 2 })[relative[0].toLowerCase()]);
    date = d.toISOString().slice(0, 10); title = title.replace(relative[0], '').trim();
  }
  const dated = /(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?=\s|$)/u.exec(title);
  if (dated) {
    const iso = `${dated[3] || today.slice(0, 4)}-${dated[2].padStart(2, '0')}-${dated[1].padStart(2, '0')}`;
    const dt = new Date(iso + 'T12:00:00Z');
    if (!isNaN(dt) && dt.toISOString().slice(0, 10) === iso) { date = iso; title = title.replace(dated[0], ' ').trim(); }
  }
  const money = /(?:^|\s|[—–:])(-?\d[\d \u00a0]*(?:[.,]\d{1,2})?)\s*(?:грн\.?|₴)(?=\s|$)/iu.exec(title)
    || /(?:\s[—–-]\s*|:\s*)(-?\d[\d \u00a0]*(?:[.,]\d{1,2})?)\s*$/u.exec(title);
  if (money) { const n = Number(money[1].replace(/[\s\u00a0]/g, '').replace(',', '.')); if (n >= 0 && Number.isFinite(n)) { amount = n; title = title.replace(money[0], ' ').replace(/[—–:-]\s*$/, '').trim(); } }
  return { type: amount !== null ? 'expense' : date ? 'task' : 'note', title: title || raw, date, amount, body: raw };
}

export const SEARCH_COLLECTIONS = { suppliers: 'Постачальник', products: 'Товар', tasks: 'Завдання', notes: 'Нотатка', purchases: 'Закупівля', expenses: 'Витрата', monthly: 'Щомісячна витрата', premises: 'Приміщення', fitout: 'Облаштування', reminders: 'Нагадування' };
export function searchWorkspace(data, query) {
  const words = query.toLocaleLowerCase('uk-UA').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const [collection, label] of Object.entries(SEARCH_COLLECTIONS)) {
    for (const r of data[collection] || []) {
      const title = r.name || r.title || r.address || 'Без назви';
      const detail = [r.body, r.description, r.comment, r.notes, r.sku, r.instagram, r.website, r.phone, r.address, r.city, ...(r.tags || [])].filter(Boolean).join(' ');
      const haystack = (title + ' ' + detail).toLocaleLowerCase('uk-UA');
      if (words.every(w => haystack.includes(w))) found.push({ collection, label, id: r.id, title, detail: detail.slice(0, 130) });
    }
  }
  return found.slice(0, 60);
}

const monthDate = (month, day) => {
  const [y, m] = month.split('-').map(Number), max = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, max)).padStart(2, '0')}`;
};
function nextMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }
export function paymentSchedule(d, today = todayISO()) {
  const current = today.slice(0, 7), list = [];
  for (const e of d.expenses) {
    const amount = e.planned === null ? null : Math.max(0, e.planned - (e.paid || 0));
    if (amount === 0) continue;
    list.push({ id: e.id, collection: 'expenses', title: e.name, amount, date: e.dueDate || '', kind: 'Разова витрата' });
  }
  const monthly = monthlySummary(d);
  const recurring = monthly.items.filter(m => !m.duplicate).map(m => ({ ...m, collection: 'monthly', paidMonth: m.paidMonth }));
  if (monthly.rent) { const p = d.premises.find(x => x.id === monthly.rent.premisesId); recurring.push({ id: p.id, name: 'Оренда · ' + p.name, amount: p.rent, payDay: p.payDay, paidMonth: p.rentPaidMonth, collection: 'premises' }); }
  for (const m of recurring) {
    const month = m.paidMonth && m.paidMonth >= current ? nextMonth(m.paidMonth) : current;
    list.push({ id: m.id, collection: m.collection, title: m.name, amount: m.amount, date: m.payDay ? monthDate(month, m.payDay) : '', kind: 'Щомісяця', month, paidMonth: m.paidMonth || '' });
  }
  return list.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.title.localeCompare(b.title));
}

export function firstBuySummary(d) {
  const orders = d.purchases.filter(p => p.firstPurchase && p.status !== 'cancelled');
  let cost = 0, revenue = 0, missing = 0, qty = 0, costIncomplete = 0;
  for (const p of orders) {
    cost += Calc.purchaseTotal(p).total;
    costIncomplete += Calc.purchaseTotal(p).missing.length;
    if (!p.items.length) missing++;
    for (const i of p.items) {
      if (i.qty !== null && i.qty > 0) qty += i.qty;
      if (i.qty === null || i.qty <= 0 || i.unitPrice === null || i.retailPrice == null) { missing++; continue; }
      revenue += i.qty * i.retailPrice;
    }
  }
  return { orders, cost, revenue: missing ? null : revenue, gross: missing ? null : revenue - cost, missing, qty, costIncomplete };
}
