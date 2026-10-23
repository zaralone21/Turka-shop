import { Cloud } from '../core/cloud.js';
import { isDue } from '../core/reminders.js';
import { Repo } from '../core/repo.js';
import { esc } from '../core/utils.js';
import { AI } from './ai.js';
import { notifUnread } from './notifications.js';
import { hydratePhotos } from './photos.js';
import { D, NAV_GROUPS, PAGES, UI, VIEWS, isOverdue, pageTitle, root } from './shared.js';

/* ---------- каркас ---------- */
export const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  planner: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 12l2.5 2.5L16 9"/>',
  reminders: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ai: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  suppliers: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  products: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
  purchases: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  budget: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  breakeven: '<path d="M4 20V4M4 20h16M7 15l4-4 3 3 5-6"/>',
  data: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  expense: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
};
export const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[name]}</svg>`;
export const TABS = [['home', 'Головна'], ['planner', 'Планер'], ['ai', 'AI'], ['suppliers', 'Постачальники'], ['more', 'Ще']];
export const MORE_PAGES = ['reminders', 'products', 'purchases', 'notes', 'budget', 'breakeven', 'data'];
/* Що додає кнопка «+» у кожному розділі. */
export const FAB_ACTION = { suppliers: 'add-supplier', products: 'add-product', notes: 'add-note', planner: 'add-task', budget: 'add-expense', purchases: 'add-purchase', reminders: 'add-reminder' };

function syncBadge() {
  const st = Repo.status;
  if (st.demo) return '<div class="sync"><i class="dot warn"></i>Демо-режим</div>';
  if (!Cloud.configured) return '<div class="sync"><i class="dot"></i>Дані лише в цьому браузері</div>';
  const map = { ok: ['ok', 'Синхронізовано'], syncing: ['warn', 'Синхронізація…'], offline: ['warn', 'Немає зв’язку, зміни збережено локально'], error: ['bad', 'Помилка синхронізації'] };
  const [cls, txt] = map[st.sync] || map.ok;
  return `<div class="sync" title="${esc(Cloud.user?.email || '')}"><i class="dot ${cls}"></i>${txt}</div>`;
}

export function render() {
  if (!Repo.data) return;
  const d = D(); const openTasks = d.tasks.filter(t => t.status !== 'done'); const overdue = openTasks.filter(isOverdue).length;
  const dueRem = d.reminders.filter(r => isDue(r)).length;
  const bell = dueRem + notifUnread();
  const counts = { suppliers: d.suppliers.length, products: d.products.length, notes: d.notes.length, planner: openTasks.length, budget: d.expenses.length, purchases: d.purchases.filter(p => p.status !== 'received' && p.status !== 'cancelled').length, reminders: d.reminders.filter(r => r.status !== 'done').length };
  const alerts = { planner: overdue, reminders: dueRem };
  let lastGroup = null;
  const navHtml = PAGES.map(([id, label, group]) => {
    const head = group !== lastGroup && NAV_GROUPS[group] ? `<div class="nav-group">${NAV_GROUPS[group]}</div>` : group !== lastGroup && lastGroup ? '<div class="nav-group"></div>' : '';
    lastGroup = group;
    const c = alerts[id] ? `<span class="cnt alert">${alerts[id]}</span>` : counts[id] ? `<span class="cnt">${counts[id]}</span>` : '';
    return `${head}<button data-nav="${id}" class="${UI.page === id ? 'on' : ''}" ${UI.page === id ? 'aria-current="page"' : ''}>${svg(id)}<span class="lbl">${label}</span>${c}</button>`;
  }).join('');
  const scroll = window.scrollY;
  const showFab = FAB_ACTION[UI.page] || UI.page === 'home';
  root.innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="brand"><b>Магазин</b><span>білизна · шкарпетки · тапки</span></div>
      <nav class="nav" aria-label="Розділи">${navHtml}</nav>
      <div class="side-foot">${syncBadge()}</div>
    </aside>
    <main class="main">
      <header class="header"><div class="header-in">
        <div class="ttl">${esc(pageTitle(UI.page))}${Repo.status.demo ? ' <span class="pill warn">Демо</span>' : ''}</div>
        <button class="icon-btn hide-m" data-act="quick-add" aria-label="Додати запис">${svg('plus')}<span>Додати</span></button>
        ${UI.page === 'ai' ? '' : `<button class="icon-btn" data-act="ai-open" aria-label="AI-менеджер">${svg('ai')}<span class="hide-h">AI</span></button>`}
        <button class="icon-btn" data-act="notif-open" aria-label="Сповіщення${bell ? `: ${bell} нових` : ''}">${svg('bell')}${bell ? `<i class="badge">${bell}</i>` : ''}</button>
      </div></header>
      <div class="wrap">${banners()}${VIEWS[UI.page]()}</div>
    </main>
  </div>
  <nav class="tabbar" aria-label="Розділи">${TABS.map(([id, label]) => { const on = id === 'more' ? MORE_PAGES.includes(UI.page) : UI.page === id;
    return `<button data-tab="${id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${svg(id)}<span>${label}</span>${id === 'planner' && overdue ? `<i class="badge">${overdue}</i>` : ''}</button>`; }).join('')}</nav>
  ${showFab && !(UI.page === 'suppliers' && UI.supplierId) ? `<button class="fab" data-act="fab" aria-label="Додати">${svg('plus')}</button>` : ''}
  ${UI.aiOpen && UI.page !== 'ai' ? AI.drawerHtml() : ''}`;
  if (UI.keepScroll) window.scrollTo(0, scroll); UI.keepScroll = true;
  AI.afterRender();
  hydratePhotos(root);
}
export function banners() {
  const st = Repo.status; let h = '';
  if (st.demo) h += `<div class="storage-strip demo-strip"><span><b>Демо-режим.</b> Вигадані приклади. Ваші записи зберігаються окремо.</span><button class="btn sm" data-act="demo-exit">Вийти з демо</button></div>`;
  if (st.loadError) h += `<div class="storage-strip err"><span>${esc(st.loadError)}</span></div>`;
  if (!st.persistent && !st.loadError && !Cloud.user) h += `<div class="storage-strip err"><span><b>Сховище браузера недоступне.</b> Записи зникнуть після перезавантаження. Зробіть експорт перед закриттям сторінки.</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  if (st.lastError) h += `<div class="storage-strip err"><span>${esc(st.lastError)}</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  if (!st.demo && !Cloud.user && (UI.page === 'home' || UI.page === 'data')) h += `<div class="storage-strip"><span><b>Дані зберігаються в цьому браузері.</b> ${Cloud.configured ? 'Увійдіть, щоб синхронізувати їх між пристроями.' : 'Для перенесення або резервної копії скористайтеся експортом.'}</span><button class="btn sm" data-act="export">Експорт</button></div>`;
  if (Cloud.user && Cloud.pendingMigration && UI.page !== 'data') h += `<div class="storage-strip"><span><b>У цьому браузері є записи, ще не перенесені в обліковий запис.</b></span><button class="btn sm primary" data-act="migrate-open">Перенести</button></div>`;
  return h;
}
