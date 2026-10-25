import { Cloud } from '../core/cloud.js';
import { isDue } from '../core/reminders.js';
import { Repo } from '../core/repo.js';
import { esc } from '../core/utils.js';
import { AI } from './ai.js';
import { notifUnread } from './notifications.js';
import { hydrateFiles } from './files.js';
import { hydratePhotos } from './photos.js';
import { BRAND, cottonLogo } from './brand.js';
import { currentTheme, themeLabel } from './theme.js';
import { D, NAV, SECTIONS, UI, VIEWS, headTitle, isOverdue, root, sectionOf } from './shared.js';

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
  premises: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  fitout: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  monthly: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  expense: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  shop: '<path d="M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8z"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
};
export const svg = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICON[name]}</svg>`;
/** Перемикач теми: сонце в темній темі, місяць у світлій. Перемикається без перемальовування сторінки. */
export const themeBtn = (withText = false) => `<button type="button" class="icon-btn theme-btn" data-act="theme-toggle" aria-label="${themeLabel()}" title="${themeLabel()}" aria-pressed="${currentTheme() === 'dark'}">${svg('moon', 'class="t-moon"')}${svg('sun', 'class="t-sun"')}${withText ? '<span class="hide-h">Тема</span>' : ''}</button>`;
/** Сьогоднішня дата словами, за Києвом. */
export const longToday = () => {
  const now = new Date(), tz = 'Europe/Kyiv';
  const wd = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', timeZone: tz }).format(now);
  const dm = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: tz }).format(now);
  const y = new Intl.DateTimeFormat('uk-UA', { year: 'numeric', timeZone: tz }).format(now).replace(/\D/g, '');
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${dm} ${y}`;
};
export const brandHtml = () => `<div class="brand">${cottonLogo()}<div class="nm"><b>КОМФОРТ <i>home</i></b><span>білизна · шкарпетки · тапки</span></div></div>`;
export const TABS = [['home', 'Головна', 'home'], ['planner', 'Планер', 'planner'], ['opening', 'Відкриття', 'premises'], ['finance', 'Фінанси', 'budget'], ['more', 'Ще', 'more']];
export const MORE_PAGES = ['suppliers', 'products', 'purchases', 'notes', 'ai', 'data'];
/* Що додає кнопка «+» у кожному розділі. */
export const FAB_ACTION = { suppliers: 'add-supplier', products: 'add-product', notes: 'add-note', planner: 'add-task', opening: 'add-prep-task', budget: 'add-expense', purchases: 'add-purchase', reminders: 'add-reminder', fitout: 'add-fitout', monthly: 'add-monthly' };

function syncBadge() {
  const st = Repo.status;
  if (st.demo) return '<div class="sync"><i class="dot warn"></i>Демо-режим</div>';
  if (!Cloud.configured) return '<div class="sync"><i class="dot"></i>Дані лише в цьому браузері</div>';
  const map = { ok: ['ok', 'Синхронізовано'], syncing: ['warn', 'Синхронізація…'], offline: ['warn', 'Немає зв’язку, зміни збережено локально'], error: ['bad', 'Помилка синхронізації'] };
  const [cls, txt] = map[st.sync] || map.ok;
  return `<div class="sync" title="${esc(Cloud.user?.email || '')}"><i class="dot ${cls}"></i>${txt}</div>`;
}

/* Сторінка перемальовується після кожної зміни даних (зокрема з інших пристроїв і після збереження на сервер).
   Поле, в якому людина саме пише, після цього має лишитися з тим самим текстом, фокусом і курсором. */
function editingState() {
  const el = document.activeElement;
  if (!el || !el.id || !root.contains(el) || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || /^(file|checkbox|radio)$/.test(el.type)) return null;
  let start = null, end = null; try { start = el.selectionStart; end = el.selectionEnd; } catch {}
  return { id: el.id, value: el.value, start, end, scroll: el.scrollTop };
}
function restoreEditing(k) {
  if (!k) return;
  const el = document.getElementById(k.id);
  if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.disabled) return;
  if (el.value !== k.value) { el.value = k.value; el.dispatchEvent(new Event('input', { bubbles: false })); }
  if (document.activeElement !== el) el.focus({ preventScroll: true });
  try { if (k.start !== null) el.setSelectionRange(k.start, k.end); } catch {}
  el.scrollTop = k.scroll;
}

export function render() {
  if (!Repo.data) return;
  const d = D(); const openTasks = d.tasks.filter(t => t.status !== 'done'); const overdue = openTasks.filter(isOverdue).length;
  const dueRem = d.reminders.filter(r => isDue(r)).length;
  const bell = dueRem + notifUnread();
  // Лічильники лише там, де вони вимагають уваги: прострочені завдання, нагадування, що настали.
  const alerts = { planner: overdue + dueRem };
  const cur = sectionOf(UI.page) || UI.page;
  const navBtn = ([id, label, icon]) => `<button data-nav="${id}" class="${cur === id ? 'on' : ''}" ${cur === id ? 'aria-current="page"' : ''}>${svg(icon)}<span class="lbl">${label}</span>${alerts[id] ? `<span class="cnt alert" aria-label="потребують уваги: ${alerts[id]}">${alerts[id]}</span>` : ''}</button>`;
  const navHtml = NAV.map(navBtn).join('');
  const scroll = window.scrollY;
  const keep = editingState();
  const showFab = FAB_ACTION[UI.page] || UI.page === 'home';
  root.innerHTML = `
  <div class="app">
    <aside class="side">
      ${brandHtml()}
      <nav class="nav" aria-label="Розділи">${navHtml}</nav>
      <div class="side-foot"><nav class="nav" aria-label="Обліковий запис">${navBtn(['data', 'Дані й акаунт', 'data'])}</nav>${syncBadge()}</div>
    </aside>
    <main class="main">
      <header class="header"><div class="header-in">
        ${UI.page === 'home' ? `<div class="ttl hero-h hide-m"><span class="hero-date">${esc(longToday())}</span><h1>Ваш магазин починається тут</h1></div>` : '<div class="ttl hide-m"></div>'}
        <div class="ttl only-m-flex"><span class="m-logo">${cottonLogo('logo-s')}</span>${BRAND.replace('home', '<i>home</i>')}</div>
        ${UI.page === 'ai' ? '' : `<button class="icon-btn" data-act="ai-open" aria-label="AI-менеджер">${svg('ai')}<span class="hide-h">AI</span></button>`}
        ${themeBtn()}
        <button class="icon-btn" data-act="notif-open" aria-label="Сповіщення${bell ? `: ${bell} нових` : ''}">${svg('bell')}${bell ? `<i class="badge">${bell}</i>` : ''}</button>
        <button class="icon-btn primary hide-m" data-act="quick-add" aria-label="Додати запис">${svg('plus')}<span>Додати</span></button>
      </div></header>
      <div class="wrap">${banners()}${pageHead()}${VIEWS[UI.page]()}</div>
    </main>
  </div>
  <nav class="tabbar" aria-label="Розділи">${TABS.map(([id, label, icon]) => { const on = id === 'more' ? MORE_PAGES.includes(cur) : cur === id;
    return `<button data-tab="${id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${svg(icon)}<span>${label}</span>${alerts[id] ? `<i class="badge">${alerts[id]}</i>` : ''}</button>`; }).join('')}</nav>
  ${showFab && !(UI.page === 'suppliers' && UI.supplierId) ? `<button class="fab" data-act="fab" aria-label="Додати">${svg('plus')}</button>` : ''}
  ${UI.aiOpen && UI.page !== 'ai' ? AI.drawerHtml() : ''}`;
  if (UI.keepScroll) window.scrollTo(0, scroll); UI.keepScroll = true;
  AI.afterRender();
  restoreEditing(keep);
  hydratePhotos(root);
  hydrateFiles(root);
}
/** Одна назва сторінки; для розділів із вкладками — назва розділу й вкладки. */
function pageHead() {
  if (UI.page === 'home') return '';
  const sec = sectionOf(UI.page);
  const tabs = sec ? `<div class="tabs" role="tablist" aria-label="${SECTIONS[sec].name}">${SECTIONS[sec].tabs.map(([id, label]) => `<button role="tab" data-nav="${id}" class="tab ${UI.page === id ? 'on' : ''}" aria-selected="${UI.page === id}">${label}</button>`).join('')}</div>` : '';
  return `<div class="page-title"><h1>${esc(headTitle(UI.page))}</h1>${tabs}</div>`;
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
