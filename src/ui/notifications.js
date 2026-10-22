import { fireAt, isDue } from '../core/reminders.js';
import { D } from './shared.js';
import { openModal } from './modal.js';
import { esc, fmtKyiv } from '../core/utils.js';

/* Центр сповіщень. Показує нагадування, час яких настав; серверні сповіщення додаються на етапі 4. */
export const notifUnread = () => 0;
export function pushPanelHtml() { return ''; }
export function openNotifCenter() {
  const due = D().reminders.filter(r => isDue(r)).sort((a, b) => fireAt(a) < fireAt(b) ? -1 : 1);
  openModal({ title: 'Сповіщення', narrow: true, body: `<div class="modal-b">${due.length ? `<div class="list">${due.map(r => `<div class="notif"><div class="t"><div class="nm">${esc(r.title)}</div><div class="small muted">${fmtKyiv(fireAt(r))}</div></div><button class="btn sm" data-n-done="${r.id}">Виконано</button></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Нових сповіщень немає.</p>'}</div>` });
}
