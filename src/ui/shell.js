import { Repo } from '../core/repo.js';
import { esc } from '../core/utils.js';
import { D, PAGES, UI, VIEWS, isOverdue, root } from './shared.js';

/* ---------- каркас ---------- */
export const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  planner: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 12l2.5 2.5L16 9"/>',
  suppliers: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  products: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  budget: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  breakeven: '<path d="M4 20V4M4 20h16M7 15l4-4 3 3 5-6"/>',
  data: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  expense: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
};
export const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[name]}</svg>`;
export const TABS = [['home', 'Головна'], ['planner', 'Планер'], ['suppliers', 'Постачальники'], ['products', 'Товари'], ['more', 'Ще']];
export const MORE_PAGES = ['notes', 'budget', 'breakeven', 'data'];
/* Що додає кнопка «+» на телефоні в кожному розділі. */
export const FAB_ACTION = { suppliers: 'add-supplier', products: 'add-product', notes: 'add-note', planner: 'add-task', budget: 'add-expense' };

export function render() {
  if (!Repo.data) return;
  const d = D(); const openTasks = d.tasks.filter(t => t.status !== 'done'); const overdue = openTasks.filter(isOverdue).length;
  const counts = { suppliers: d.suppliers.length, products: d.products.length, notes: d.notes.length, planner: openTasks.length, budget: d.expenses.length };
  const navHtml = PAGES.map(([id, label]) => `<button data-nav="${id}" class="${UI.page === id ? 'on' : ''}" ${UI.page === id ? 'aria-current="page"' : ''}><span>${label}</span>${counts[id] !== undefined ? `<span class="cnt ${id === 'planner' && overdue ? 'alert' : ''}">${id === 'planner' && overdue ? overdue + ' простр.' : counts[id]}</span>` : ''}</button>`).join('');
  const scroll = window.scrollY;
  root.innerHTML = `
  <div class="topbar"><b>${esc(PAGES.find(p => p[0] === UI.page)[1])}</b>${Repo.status.demo ? '<span class="pill warn">Демо</span>' : ''}</div>
  <div class="app">
    <aside class="side ">
      <div class="brand"><b>Підготовка магазину</b><span>білизна · шкарпетки · тапки</span></div>
      <nav class="nav" aria-label="Розділи">${navHtml}</nav>
      <div class="side-note">Дані зберігаються в цьому браузері. Для перенесення або резервної копії скористайтеся експортом.</div>
    </aside>
    <main class="main"><div class="wrap">${banners()}${VIEWS[UI.page]()}</div></main>
  </div>
  <nav class="tabbar" aria-label="Розділи">${TABS.map(([id, label]) => { const on = id === 'more' ? MORE_PAGES.includes(UI.page) : UI.page === id;
    return `<button data-tab="${id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${svg(id)}<span>${label}</span>${id === 'planner' && overdue ? `<i class="badge">${overdue}</i>` : ''}</button>`; }).join('')}</nav>
  ${UI.page === 'breakeven' || UI.page === 'data' || (UI.page === 'suppliers' && UI.supplierId) ? '' : `<button class="fab" data-act="fab" aria-label="Додати">${svg('plus')}</button>`}`;
  if (UI.keepScroll) window.scrollTo(0, scroll); UI.keepScroll = true;
}
export function banners() {
  const st = Repo.status; let h = '';
  if (st.demo) h += `<div class="storage-strip demo-strip"><span><b>Демо-режим.</b> Вигадані приклади. Ваші записи зберігаються окремо.</span><button class="btn sm" data-act="demo-exit">Вийти з демо</button></div>`;
  if (st.loadError) h += `<div class="storage-strip err"><span>${esc(st.loadError)}</span></div>`;
  if (!st.persistent && !st.loadError) h += `<div class="storage-strip err"><span><b>Сховище браузера недоступне.</b> Записи зникнуть після перезавантаження. Зробіть експорт перед закриттям сторінки.</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  if (st.lastError) h += `<div class="storage-strip err"><span>${esc(st.lastError)}</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  if (UI.page === 'home' || UI.page === 'data') h += `<div class="storage-strip"><span><b>Дані зберігаються в цьому браузері.</b> Для перенесення або резервної копії скористайтеся експортом.</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  return h;
}
