import { Calc } from './calc.js';
import { fitoutLink, isLeaseConfirmed, mainPremises, monthlySummary, premisesBudgetPlan, purchaseLink, PREMISES_STATUSES } from './opening.js';
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
  openingChecks(d, add);
  return out;
}

/** Перевірки підготовки до відкриття. Кожна має посилання на конкретний запис. */
function openingChecks(d, add) {
  const pr = mainPremises(d);
  if (pr && !isLeaseConfirmed(pr)) add('warn', `Приміщення «${pr.name || pr.address || 'без назви'}»: ${PREMISES_STATUSES[pr.status].toLowerCase()}, договір ще не підписано`, 'premises', { collection: 'premises', id: pr.id });
  if (pr) {
    const miss = premisesBudgetPlan(d, pr).filter(x => x.action === 'create' && (x.part === 'rent' || x.part === 'deposit'));
    if (miss.length) add('info', `${miss.map(x => x.label).join(' і ')} ще не внесено в бюджет відкриття`, 'premises', { collection: 'premises', id: pr.id });
  }
  const lateFit = d.fitout.filter(i => i.deadline && daysFromToday(i.deadline) < 0 && i.status !== 'installed' && i.status !== 'received');
  lateFit.slice(0, 3).forEach(i => add('warn', `Облаштування: минув термін «${i.name}»`, 'fitout', { collection: 'fitout', id: i.id }));
  for (const p of d.purchases) {
    if (p.status === 'cancelled') continue;
    const st = purchaseLink(d, p);
    if (st.state === 'missing') add('warn', `Закупівля «${p.title}»: статтю бюджету видалено`, 'purchases', { collection: 'purchases', id: p.id });
    else if (st.state === 'mismatch') add('warn', `Закупівля «${p.title}»: сума ${fmtMoney(st.amount)}, у бюджеті ${fmtMoney(st.planned)}`, 'purchases', { collection: 'purchases', id: p.id });
  }
  for (const i of d.fitout) {
    const st = fitoutLink(d, i);
    if (st.state === 'missing') add('warn', `Облаштування «${i.name}»: статтю бюджету видалено`, 'fitout', { collection: 'fitout', id: i.id });
    else if (st.state === 'mismatch' && d.fitout.filter(x => x.expenseId === i.expenseId).length === 1) add('warn', `Облаштування «${i.name}»: сума ${fmtMoney(st.amount)}, у бюджеті ${fmtMoney(st.planned)}`, 'fitout', { collection: 'fitout', id: i.id });
  }
  const ms = monthlySummary(d);
  if (ms.missing.length) add('info', `${ms.missing.length} ${plural(ms.missing.length, 'щомісячна стаття', 'щомісячні статті', 'щомісячних статей')} без суми`, 'monthly', ms.missing.length === 1 ? { collection: 'monthly', id: ms.missing[0].id } : null);
}
