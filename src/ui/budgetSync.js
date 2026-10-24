import { Repo } from '../core/repo.js';
import { esc, fmtMoney } from '../core/utils.js';
import { confirmDialog } from './modal.js';
import { toast } from './shared.js';

/* Узгодження пов'язаних записів із бюджетом. Змінюється лише планова сума статті й лише після
   підтвердження «було → стане»; фактично сплачене користувач записує в бюджеті сам. */
let busy = false;
/** Захист від подвійного натискання: поки дія виконується, повторний виклик ігнорується. */
export const once = fn => async (...a) => { if (busy) return; busy = true; try { return await fn(...a); } finally { busy = false; } };

export async function syncExpensePlanned(expenseId, amount, why) {
  const e = Repo.get('expenses', expenseId); if (!e) return false;
  const ok = await confirmDialog({ title: 'Оновити бюджет?', ok: 'Оновити план', danger: false,
    text: `<p style="margin-top:0">${esc(why)}</p><p style="margin:0">Стаття «${esc(e.name)}»: план ${fmtMoney(e.planned ?? 0)} → <b>${fmtMoney(amount)}</b>.<br><span class="small muted">Фактично сплачене (${fmtMoney(e.paid ?? 0)}) не змінюється.</span></p>` });
  if (!ok) return false;
  await Repo.update('expenses', e.id, { planned: amount }); toast('План у бюджеті оновлено'); return true;
}
