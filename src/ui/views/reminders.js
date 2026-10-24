import { REPEATS, fireAt, isDue } from '../../core/reminders.js';
import { Repo } from '../../core/repo.js';
import { Schema } from '../../core/schema.js';
import { esc, fmtKyiv } from '../../core/utils.js';
import { pushPanelHtml } from '../notifications.js';
import { D, UI, VIEWS, emptyState } from '../shared.js';

/* ---------- Нагадування ---------- */
export function linkLabel(link) {
  if (!link) return '';
  const r = Repo.get(Schema.LINK_COLLECTION[link.type], link.id); if (!r) return '';
  return `${Schema.LINK_TYPES[link.type]}: ${esc(r.title || r.name || r.address)}`;
}
export function reminderRow(r, now = new Date()) {
  const due = isDue(r, now), done = r.status === 'done';
  return `<div class="li rem"><div class="t"><button class="li-btn" data-act="edit-reminder" data-id="${r.id}"><span class="nm">${esc(r.title)}</span></button>
      <div class="row small" style="gap:6px;margin-top:3px">${done ? '<span class="pill ok">Виконано</span>' : due ? `<span class="pill bad">Час настав · ${fmtKyiv(fireAt(r))}</span>` : `<span class="pill ${r.status === 'snoozed' ? 'warn' : 'accent'}">${r.status === 'snoozed' ? 'Відкладено до ' : ''}${fmtKyiv(fireAt(r))}</span>`}
      ${r.repeat !== 'none' ? `<span class="pill">${REPEATS[r.repeat]}</span>` : ''}${r.link ? `<span class="muted">${linkLabel(r.link)}</span>` : ''}</div>
      ${r.note ? `<div class="small muted pre">${esc(r.note)}</div>` : ''}</div>
    ${done ? '' : `<span class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="rem-done" data-id="${r.id}">Виконано</button><button class="btn sm ghost" data-act="rem-snooze" data-id="${r.id}">Відкласти</button></span>`}</div>`;
}
VIEWS.reminders = () => {
  const d = D(); const now = new Date();
  const head = `<div class="page-head"><p>Час — за Києвом. Повторювані після «Виконано» переходять на наступну дату.</p><button class="btn primary hide-m" data-act="add-reminder">+ Нагадування</button></div>`;
  const push = pushPanelHtml();
  if (!d.reminders.length) return head + push + emptyState('Створіть нагадування: написати постачальнику, оплатити оренду, забрати доставку.', 'add-reminder', 'Додати нагадування');
  const active = d.reminders.filter(r => r.status !== 'done').sort((a, b) => fireAt(a) < fireAt(b) ? -1 : 1);
  const done = d.reminders.filter(r => r.status === 'done').sort((a, b) => (b.doneAt || '') > (a.doneAt || '') ? 1 : -1);
  const due = active.filter(r => isDue(r, now)), upcoming = active.filter(r => !isDue(r, now));
  return head + push + `
  ${due.length ? `<section class="panel"><div class="panel-head"><h2>Потребують дії <span class="cnt">${due.length}</span></h2></div><div class="list">${due.map(r => reminderRow(r, now)).join('')}</div></section>` : ''}
  <section class="panel"><div class="panel-head"><h2>Заплановані <span class="cnt">${upcoming.length}</span></h2></div>${upcoming.length ? `<div class="list">${upcoming.map(r => reminderRow(r, now)).join('')}</div>` : '<p class="small muted" style="margin:0">Немає запланованих нагадувань.</p>'}</section>
  ${done.length ? `<section class="panel"><div class="panel-head"><h2>Виконані <span class="cnt">${done.length}</span></h2><label class="check small"><input type="checkbox" data-act="rem-show-done" ${UI.f.remShowDone ? 'checked' : ''}> Показати</label></div>${UI.f.remShowDone ? `<div class="list">${done.slice(0, 50).map(r => reminderRow(r, now)).join('')}</div>` : ''}</section>` : ''}`;
};
