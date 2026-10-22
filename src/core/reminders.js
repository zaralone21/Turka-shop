import { addDaysISO, kyivParts, kyivToUtc } from './utils.js';

/* Нагадування. Час задається за Києвом; fireAt — момент спрацювання в UTC,
   за яким сервер вирішує, коли надіслати сповіщення. */
export const REPEATS = { none: 'Одноразово', daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця' };
export const REMINDER_STATUSES = { planned: 'Заплановано', snoozed: 'Відкладено', done: 'Виконано' };
export const SNOOZE_OPTIONS = { '10m': 'На 10 хвилин', '1h': 'На годину', '3h': 'На 3 години', tomorrow: 'Завтра о 09:00' };

/** Момент найближчого спрацювання (ISO UTC) або null для виконаних. */
export function fireAt(r) {
  if (!r || r.status === 'done' || !r.date) return null;
  if (r.status === 'snoozed' && r.snoozedUntil) return r.snoozedUntil;
  return kyivToUtc(r.date, r.time || '09:00');
}
export const isDue = (r, now = new Date()) => { const f = fireAt(r); return !!f && new Date(f) <= now; };

function addMonth(dateISO, anchorDay) {
  const [y, m] = dateISO.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(anchorDay, last)).padStart(2, '0')}`;
}
/** Наступна дата повтору після dateISO. */
export function nextDate(dateISO, repeat, anchorDay) {
  if (repeat === 'daily') return addDaysISO(dateISO, 1);
  if (repeat === 'weekly') return addDaysISO(dateISO, 7);
  if (repeat === 'monthly') return addMonth(dateISO, anchorDay || +dateISO.slice(8, 10));
  return null;
}
/** Зміни для «Виконано»: одноразове закривається, повторюване переходить на наступну дату в майбутньому. */
export function completeChanges(r, now = new Date()) {
  if (!r.repeat || r.repeat === 'none') return { status: 'done', snoozedUntil: null, doneAt: now.toISOString() };
  const anchor = r.anchorDay || +r.date.slice(8, 10);
  let date = r.date;
  for (let i = 0; i < 1000; i++) { date = nextDate(date, r.repeat, anchor); if (new Date(kyivToUtc(date, r.time)) > now) break; }
  return { date, status: 'planned', snoozedUntil: null, anchorDay: anchor, lastDoneAt: now.toISOString() };
}
/** Зміни для «Відкласти». */
export function snoozeChanges(option, now = new Date()) {
  let until;
  if (option === 'tomorrow') until = kyivToUtc(addDaysISO(kyivParts(now).date, 1), '09:00');
  else { const mins = { '10m': 10, '1h': 60, '3h': 180 }[option] || 60; until = new Date(now.getTime() + mins * 60000).toISOString(); }
  return { status: 'snoozed', snoozedUntil: until };
}
