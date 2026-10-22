import { Calc } from './calc.js';
import { isDue } from './reminders.js';
import { daysFromToday, fmtMoney, plural } from './utils.js';

export const STALE_PRICE_DAYS = 60;
export const STALE_SUPPLIER_DAYS = 90;

/* Автоматичні перевірки даних: прострочене, застаріле, неповне.
   Працюють без AI і використовуються на головній та як інструмент для AI-менеджера. */
export function runChecks(d, now = new Date()) {
  const out = [];
  const add = (level, text, page, ref = null) => out.push({ level, text, page, ref });
  const openTasks = d.tasks.filter(t => t.status !== 'done');
  const overdue = openTasks.filter(t => t.deadline && daysFromToday(t.deadline) < 0);
  if (overdue.length) add('bad', `Прострочено ${overdue.length} ${plural(overdue.length, 'завдання', 'завдання', 'завдань')}`, 'planner', overdue.length === 1 ? { collection: 'tasks', id: overdue[0].id } : null);
  const dueRem = d.reminders.filter(r => isDue(r, now));
  if (dueRem.length) add('bad', `${dueRem.length} ${plural(dueRem.length, 'нагадування чекає', 'нагадування чекають', 'нагадувань чекають')} на дію`, 'reminders');
  const b = Calc.budget(d);
  if (b.free !== null && b.free < 0) add('bad', `Заплановані витрати перевищують бюджет на ${fmtMoney(-b.free)}`, 'budget');
  if (b.total === null && d.expenses.length) add('warn', 'Не задано загальний бюджет відкриття', 'budget');
  const stale = d.products.filter(p => p.priceDate && -daysFromToday(p.priceDate) > STALE_PRICE_DAYS);
  if (stale.length) add('warn', `${stale.length} ${plural(stale.length, 'ціна застаріла', 'ціни застаріли', 'цін застаріли')} (старші за ${STALE_PRICE_DAYS} днів)`, 'products');
  const noPrice = d.products.filter(p => Calc.unitCost(p) === null || p.retailPrice === null);
  if (noPrice.length) add('warn', `${noPrice.length} ${plural(noPrice.length, 'товар без', 'товари без', 'товарів без')} закупівельної або роздрібної ціни`, 'products');
  const toContact = d.suppliers.filter(s => s.status === 'contact');
  if (toContact.length) add('info', `Зв’язатися з ${toContact.length} ${plural(toContact.length, 'постачальником', 'постачальниками', 'постачальниками')}`, 'suppliers');
  const unchecked = d.suppliers.filter(s => s.status !== 'rejected' && (!s.checkedAt || -daysFromToday(s.checkedAt) > STALE_SUPPLIER_DAYS));
  if (unchecked.length) add('info', `Інформацію ${unchecked.length} ${plural(unchecked.length, 'постачальника', 'постачальників', 'постачальників')} давно не перевіряли`, 'suppliers');
  const noContacts = d.suppliers.filter(s => s.status !== 'rejected' && !s.phone && !s.messenger && !s.instagram && !s.website);
  if (noContacts.length) add('info', `${noContacts.length} ${plural(noContacts.length, 'постачальник без', 'постачальники без', 'постачальників без')} жодного контакту`, 'suppliers');
  const late = d.purchases.filter(p => (p.status === 'ordered' || p.status === 'awaiting') && p.expectedDate && daysFromToday(p.expectedDate) < 0);
  if (late.length) add('warn', `${late.length} ${plural(late.length, 'закупівля запізнюється', 'закупівлі запізнюються', 'закупівель запізнюються')}`, 'purchases');
  return out;
}
