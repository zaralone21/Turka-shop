import { fmtPct, isNum, parseNum } from './utils.js';

/* =====================================================================
   4. РОЗРАХУНКИ (чисті функції, без доступу до інтерфейсу)
   ===================================================================== */
export const Calc = {
  /** Ціна закупівлі однієї одиниці. */
  unitCost(p) {
    if (!isNum(p.purchasePrice)) return null;
    if (p.priceType === 'pack') return isNum(p.packQty) && p.packQty > 0 ? p.purchasePrice / p.packQty : null;
    return p.purchasePrice;
  },
  /** Націнка = (роздрібна − закупівельна) / закупівельна × 100 */
  markup(cost, retail) { return isNum(cost) && isNum(retail) && cost > 0 ? (retail - cost) / cost * 100 : null; },
  /** Маржа = (роздрібна − закупівельна) / роздрібна × 100 */
  margin(cost, retail) { return isNum(cost) && isNum(retail) && retail > 0 ? (retail - cost) / retail * 100 : null; },

  /**
   * Бюджет. Кожен запис рахується рівно один раз:
   * потрібна сума запису = більше з (план, сплачено); залишок до сплати = max(план − сплачено, 0).
   */
  budget(d) {
    const cats = d.settings.budgetCategories;
    const refundable = new Set(cats.filter(c => c.refundable).map(c => c.id));
    const r = { planned: 0, paid: 0, toPay: 0, needed: 0, overPlan: 0, deposit: { planned: 0, paid: 0, needed: 0 }, byCat: {} };
    for (const e of d.expenses) {
      const p = isNum(e.planned) ? e.planned : 0, f = isNum(e.paid) ? e.paid : 0;
      const need = Math.max(p, f), rest = Math.max(p - f, 0);
      r.planned += p; r.paid += f; r.toPay += rest; r.needed += need; r.overPlan += Math.max(f - p, 0);
      const c = r.byCat[e.categoryId] ||= { planned: 0, paid: 0, toPay: 0, needed: 0, count: 0 };
      c.planned += p; c.paid += f; c.toPay += rest; c.needed += need; c.count++;
      if (refundable.has(e.categoryId)) { r.deposit.planned += p; r.deposit.paid += f; r.deposit.needed += need; }
    }
    r.total = isNum(d.settings.totalBudget) ? d.settings.totalBudget : null;
    r.free = r.total === null ? null : r.total - r.needed;           // вільний бюджет (+) або перевищення (−)
    r.leftAfterPaid = r.total === null ? null : r.total - r.paid;    // скільки грошей ще на руках
    r.nonRefundable = r.needed - r.deposit.needed;
    return r;
  },

  /** Беззбитковість: виручка = постійні / (маржа − змінні). Повертає {ok, errors} або {ok, ...результати}. */
  breakeven(raw) {
    const errors = {};
    const F = parseNum(raw.fixed), m = parseNum(raw.margin), v = parseNum(raw.extra), A = parseNum(raw.avgCheck), D = parseNum(raw.days);
    if (F === null) errors.fixed = 'Вкажіть суму постійних витрат.';
    else if (Number.isNaN(F)) errors.fixed = 'Введіть число, наприклад 35000.';
    else if (F <= 0) errors.fixed = 'Сума має бути більшою за нуль.';
    if (m === null) errors.margin = 'Вкажіть валову маржу у відсотках.';
    else if (Number.isNaN(m)) errors.margin = 'Введіть число, наприклад 45.';
    else if (m <= 0 || m > 100) errors.margin = 'Маржа має бути від 0 до 100%.';
    const vv = v === null ? 0 : v;
    if (Number.isNaN(v)) errors.extra = 'Введіть число або залиште 0.';
    else if (vv < 0 || vv >= 100) errors.extra = 'Відсоток має бути від 0 до 100.';
    if (A === null) errors.avgCheck = 'Вкажіть середній чек.';
    else if (Number.isNaN(A)) errors.avgCheck = 'Введіть число, наприклад 450.';
    else if (A <= 0) errors.avgCheck = 'Середній чек має бути більшим за нуль.';
    if (D === null) errors.days = 'Вкажіть кількість робочих днів.';
    else if (Number.isNaN(D) || !Number.isInteger(D)) errors.days = 'Введіть ціле число днів.';
    else if (D < 1 || D > 31) errors.days = 'У місяці від 1 до 31 робочого дня.';
    if (Object.keys(errors).length) return { ok: false, errors };
    const share = (m - vv) / 100;
    if (share <= 0) return { ok: false, errors: {}, general: `Валова маржа (${fmtPct(m)}) має бути більшою за додаткові змінні витрати (${fmtPct(vv)}). Інакше кожен продаж приносить збиток і точки беззбитковості немає.` };
    const monthly = F / share, daily = monthly / D;
    const purchases = Math.ceil(daily / A - 1e-9);
    return { ok: true, F, m, v: vv, A, D, share, monthly, daily, purchases };
  },

  /** Сума закупівлі = Σ кількість × ціна одиниці + доставка. Позиції без ціни або кількості не рахуються й повертаються в missing. */
  purchaseTotal(p) {
    let items = 0; const missing = [];
    for (const i of p.items || []) { if (isNum(i.qty) && isNum(i.unitPrice)) items += i.qty * i.unitPrice; else missing.push(i); }
    const delivery = isNum(p.deliveryCost) ? p.deliveryCost : 0;
    return { items, delivery, total: items + delivery, missing };
  },
  /** Підсумок закупівель за статусами. */
  purchases(d) {
    const r = { planned: 0, awaiting: 0, received: 0, count: { planned: 0, awaiting: 0, received: 0 } };
    for (const p of d.purchases) {
      const key = p.status === 'planned' ? 'planned' : (p.status === 'ordered' || p.status === 'awaiting') ? 'awaiting' : p.status === 'received' ? 'received' : null;
      if (!key) continue; r[key] += Calc.purchaseTotal(p).total; r.count[key]++;
    }
    return r;
  },
};
