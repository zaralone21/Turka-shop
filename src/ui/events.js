import { Cloud, localLegacyData } from '../core/cloud.js';
import { Demo } from '../core/demo.js';
import { renderAuth } from './auth.js';
import { clearLegacy, migrationDialog, openData } from './session.js';
import { Repo } from '../core/repo.js';
import { KEYS, esc, parseNum, todayISO } from '../core/utils.js';
import { copyText, exportJSON, importFile, showJSON } from './backup.js';
import { budgetCatsModal, deleteSupplier, expenseForm, noteForm, productForm, purchaseForm, purchaseToBudget, reminderDone, reminderForm, snoozeSheet, supplierForm, taskForm } from './forms.js';
import { AI } from './ai.js';
import { PUSH_ACTIONS, openNotifCenter } from './notifications.js';
import { closeModal, confirmDialog, modalEl, openModal } from './modal.js';
import { D, PAGES, UI, pageTitle, toast } from './shared.js';
import { FAB_ACTION, MORE_PAGES, render, svg } from './shell.js';

/* =====================================================================
   8. ОБРОБКА ПОДІЙ (делегування)
   ===================================================================== */
export function go(page) { UI.page = page; UI.aiOpen = false; if (page !== 'suppliers') UI.supplierId = null; UI.keepScroll = false; closeModal(); render(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + page); } catch {} }
export const ACTIONS = {
  'fab': () => { const a = FAB_ACTION[UI.page]; if (a) ACTIONS[a]({ dataset: {} }); else quickAddSheet(); },
  'quick-add': () => quickAddSheet(),
  'go-budget': () => go('budget'),
  'add-purchase': el => purchaseForm(null, { supplierId: el.dataset.supplier || '' }), 'edit-purchase': el => purchaseForm(el.dataset.id), 'purchase-to-budget': el => purchaseToBudget(el.dataset.id),
  'add-reminder': el => reminderForm(null, el.dataset.supplier ? { link: { type: 'supplier', id: el.dataset.supplier } } : {}), 'edit-reminder': el => reminderForm(el.dataset.id),
  'rem-done': el => reminderDone(el.dataset.id), 'rem-snooze': el => snoozeSheet(el.dataset.id),
  'notif-open': () => openNotifCenter(),
  'ai-open': () => AI.open(), 'ai-close': () => AI.close(),
  'task-toggle': async el => { const t = Repo.get('tasks', el.dataset.id); const done = t.status !== 'done'; await Repo.update('tasks', t.id, { status: done ? 'done' : 'planned' }); toast(done ? 'Завдання виконано' : 'Завдання повернуто в роботу'); },
  'add-supplier': () => supplierForm(), 'edit-supplier': el => supplierForm(el.dataset.id), 'del-supplier': el => deleteSupplier(el.dataset.id),
  'open-supplier': el => { UI.supplierId = el.dataset.id; go('suppliers'); UI.supplierId = el.dataset.id; render(); },
  'back-suppliers': () => { UI.supplierId = null; render(); },
  'supplier-checked': async el => { await Repo.update('suppliers', el.dataset.id, { checkedAt: todayISO() }); toast('Дату перевірки оновлено'); },
  'add-product': el => productForm(null, el.dataset.supplier), 'edit-product': el => productForm(el.dataset.id),
  'del-product': async el => { const p = Repo.get('products', el.dataset.id); if (await confirmDialog({ title: 'Видалити товар?', text: `<p style="margin:0">«${esc(p.name)}» буде видалено.</p>` })) { await Repo.remove('products', p.id); toast('Товар видалено'); } },
  'add-note': el => noteForm(null, el.dataset.supplier), 'edit-note': el => noteForm(el.dataset.id),
  'del-note': async el => { const n = Repo.get('notes', el.dataset.id); if (await confirmDialog({ title: 'Видалити нотатку?', text: `<p style="margin:0">«${esc(n.title || 'Без заголовка')}» буде видалено.</p>` })) { await Repo.remove('notes', n.id); toast('Нотатку видалено'); } },
  'pin-note': async el => { const n = Repo.get('notes', el.dataset.id); await Repo.update('notes', n.id, { pinned: !n.pinned }); },
  'note-tag': el => { UI.f.noteTag = el.dataset.tag; render(); },
  'add-task': () => taskForm(), 'edit-task': el => taskForm(el.dataset.id),
  'del-task': async el => { const t = Repo.get('tasks', el.dataset.id); if (await confirmDialog({ title: 'Видалити завдання?', text: `<p style="margin:0">«${esc(t.title)}» буде видалено разом із чеклістом.</p>` })) { await Repo.remove('tasks', t.id); toast('Завдання видалено'); } },
  'task-done': async el => { await Repo.update('tasks', el.dataset.id, { status: 'done' }); toast('Завдання виконано'); },
  'add-expense': () => expenseForm(), 'edit-expense': el => expenseForm(el.dataset.id),
  'del-expense': async el => { const e = Repo.get('expenses', el.dataset.id); if (await confirmDialog({ title: 'Видалити витрату?', text: `<p style="margin:0">«${esc(e.name)}» буде видалено з бюджету.</p>` })) { await Repo.remove('expenses', e.id); toast('Витрату видалено'); } },
  'budget-cats': () => budgetCatsModal(),
  'use-margin': async el => { await Repo.setSettings({ breakeven: { ...D().settings.breakeven, margin: el.dataset.v.replace('.', ',') } }); },
  'be-clear': async () => { await Repo.setSettings({ breakeven: { fixed: '', margin: '', extra: '', avgCheck: '', days: '26' } }); },
  'export': () => exportJSON(), 'export-copy': () => showJSON(JSON.stringify(Repo.exportObject(), null, 2)),
  'copy': el => copyText(el.dataset.text),
  'demo-enter': async () => { try { localStorage.setItem(KEYS.mode, 'demo'); } catch {} await openData(); go('home'); toast('Відкрито демо-режим'); },
  'demo-exit': async () => { try { localStorage.removeItem(KEYS.mode); } catch {} await openData(); if (Repo.data) go('home'); toast('Повернулися до ваших даних'); },
  'sign-out': async () => {
    const pending = Repo.adapter?.hasPending?.(Repo.data);
    if (!await confirmDialog({ title: 'Вийти з облікового запису?', ok: 'Вийти', danger: !!pending, text: pending ? '<div class="callout warn">Частина змін ще не надіслана на сервер. Якщо вийти зараз, вони залишаться лише на цьому пристрої й з’являться після наступного входу.</div>' : '<p style="margin:0">Дані залишаться на сервері. Копія на цьому пристрої буде очищена.</p>' })) return;
    await Cloud.signOut({ keepCache: !!pending });
  },
  'resync': async () => { await Repo.resync(); toast(Repo.status.sync === 'ok' ? 'Синхронізовано' : 'Немає зв’язку з сервером', Repo.status.sync === 'ok' ? null : 'error'); },
  'change-password': () => renderAuth('newpass'),
  'migrate-open': () => migrationDialog(),
  'legacy-backup': () => { const l = localLegacyData(); if (l) exportJSON(l, '-browser'); },
  'legacy-clear': () => clearLegacy(),
  'demo-reset': async () => { if (await confirmDialog({ title: 'Скинути демо-дані?', ok: 'Скинути', text: '<p style="margin:0">Демо-набір буде створено заново. Ваші власні дані це не зачепить.</p>' })) { await Repo.replaceAll(Demo.build()); toast('Демо-дані скинуто'); } },
  'reset-all': async () => { if (await confirmDialog({ title: 'Видалити всі дані?', ok: 'Видалити все', text: `<p style="margin:0">Усі ${Repo.status.demo ? 'демо-' : ''}записи в цьому браузері буде видалено назавжди.</p><div class="callout warn">Якщо дані потрібні, спершу зробіть експорт у JSON.</div>` })) { await Repo.reset(); toast('Дані видалено'); } },
};
export function sheet(title, items) {
  openModal({ title, narrow: true, body: `<div class="modal-b"><div class="sheet-list">${items.map(([key, icon, label], i) => `<button class="btn" data-sheet="${i}">${svg(icon)}${label}</button>`).join('')}</div></div>`,
    onMount: m => m.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => { closeModal(); items[+b.dataset.sheet][3](); }) });
}
export function moreSheet() { sheet('Ще', MORE_PAGES.map(id => [id, id, pageTitle(id), () => go(id)])); }
export function quickAddSheet() { sheet('Швидко додати', [[0, 'task', 'Завдання', () => taskForm()], [0, 'reminders', 'Нагадування', () => reminderForm()], [0, 'note', 'Нотатку', () => noteForm()], [0, 'suppliers', 'Постачальника', () => supplierForm()], [0, 'products', 'Товар', () => productForm()], [0, 'purchases', 'Закупівлю', () => purchaseForm()], [0, 'expense', 'Витрату', () => expenseForm()]]); }
Object.assign(ACTIONS, AI.actions, PUSH_ACTIONS); AI.go = go; AI.bindRender(render);
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]'); if (tab) { if (tab.dataset.tab === 'more') moreSheet(); else go(tab.dataset.tab); return; }
  const nav = e.target.closest('[data-nav]'); if (nav && !modalEl?.contains(nav)) { go(nav.dataset.nav); return; }
  const el = e.target.closest('[data-act]'); if (!el || (modalEl && modalEl.contains(el))) return;
  const a = el.dataset.act; if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'file') return;
  if (ACTIONS[a]) { e.preventDefault(); ACTIONS[a](el); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-n-done]'); if (b) { closeModal(); reminderDone(b.dataset.nDone); return; }
  const s = e.target.closest('[data-n-snooze]'); if (s) { closeModal(); snoozeSheet(s.dataset.nSnooze); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalEl) closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[data-act]')) { e.preventDefault(); ACTIONS[e.target.dataset.act](e.target); }
});
document.addEventListener('change', async e => {
  const el = e.target; if (modalEl && modalEl.contains(el)) return;
  if (el.dataset.filter && el.tagName === 'SELECT') { UI.f[el.dataset.filter] = el.value; render(); return; }
  const a = el.dataset.act;
  if (a === 'task-status') { await Repo.update('tasks', el.dataset.id, { status: el.value }); toast('Статус змінено'); }
  else if (a === 'toggle-done') await Repo.setSettings({ ui: { ...D().settings.ui, showDoneTasks: el.checked } });
  else if (a === 'cl-toggle') { const t = Repo.get('tasks', el.dataset.id); await Repo.update('tasks', t.id, { checklist: t.checklist.map(i => i.id === el.dataset.item ? { ...i, done: el.checked } : i) }); }
  else if (a === 'import-file') { const f = el.files[0]; el.value = ''; importFile(f); }
  else if (a === 'rem-show-done') { UI.f.remShowDone = el.checked; render(); }
});
document.addEventListener('input', e => {
  const el = e.target; if (modalEl && modalEl.contains(el)) return;
  const refocus = (id, pos) => { const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } };
  if (el.dataset.filter && el.tagName === 'INPUT') { UI.f[el.dataset.filter] = el.value; const pos = el.selectionStart; render(); refocus(el.id, pos); }
  else if (el.dataset.be) { const pos = el.selectionStart, id = el.id; Repo.setSettings({ breakeven: { ...D().settings.breakeven, [el.dataset.be]: el.value } }).then(() => refocus(id, pos)); }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.dataset.form === 'ai-chat') { e.preventDefault(); AI.submit(f.q.value); return; }
  if (f.dataset.form === 'ai-ask') { e.preventDefault(); const q = f.q.value.trim(); if (q) AI.ask(q); return; }
  if (f.dataset.form !== 'total-budget') return; e.preventDefault();
  const n = parseNum(f.total.value);
  if (Number.isNaN(n) || (n !== null && n < 0)) { f.total.classList.add('bad'); toast('Введіть суму числом, наприклад 400000', 'error'); return; }
  await Repo.setSettings({ totalBudget: n }); toast(n === null ? 'Бюджет очищено' : 'Бюджет збережено');
});
window.addEventListener('storage', e => { if (e.key === (Repo.status.demo ? KEYS.demo : KEYS.data)) Repo.reloadFromStorage(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PAGES.some(p => p[0] === h)) go(h); });
