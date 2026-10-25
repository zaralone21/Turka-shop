import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { daysFromToday, esc, fmtDate, plural } from '../core/utils.js';

/* =====================================================================
   6. ІНТЕРФЕЙС
   ===================================================================== */
/* Усі сторінки застосунку: [id, назва]. Адреси #id лишаються робочими, зокрема старі. */
export const PAGES = [
  ['home', 'Головна'], ['planner', 'Завдання'], ['reminders', 'Нагадування'], ['ai', 'AI-менеджер'],
  ['opening', 'План відкриття'], ['premises', 'Приміщення'], ['fitout', 'Облаштування'],
  ['suppliers', 'Постачальники'], ['products', 'Товари та ціни'], ['purchases', 'Закупівлі'], ['notes', 'Нотатки'],
  ['budget', 'Бюджет відкриття'], ['monthly', 'Щомісячні витрати'], ['breakeven', 'Беззбитковість'],
  ['data', 'Дані й акаунт'],
];
/* Розділи з вкладками. Перша вкладка відкривається за замовчуванням. */
export const SECTIONS = {
  planner: { name: 'Планер', tabs: [['planner', 'Завдання'], ['reminders', 'Нагадування']] },
  opening: { name: 'Відкриття', tabs: [['opening', 'План відкриття'], ['premises', 'Приміщення'], ['fitout', 'Облаштування']] },
  finance: { name: 'Фінанси', tabs: [['budget', 'Бюджет відкриття'], ['monthly', 'Щомісячні витрати'], ['breakeven', 'Беззбитковість']] },
};
/* Основне меню: [id розділу або сторінки, назва, іконка]. */
export const NAV = [
  ['home', 'Головна', 'home'], ['planner', 'Планер', 'planner'], ['opening', 'Відкриття', 'premises'],
  ['suppliers', 'Постачальники', 'suppliers'], ['products', 'Товари та ціни', 'products'], ['purchases', 'Закупівлі', 'purchases'], ['notes', 'Нотатки', 'notes'],
  ['finance', 'Фінанси', 'budget'], ['ai', 'AI-менеджер', 'ai'],
];
/** До якого розділу з вкладками належить сторінка (або null). */
export const sectionOf = page => Object.keys(SECTIONS).find(k => SECTIONS[k].tabs.some(t => t[0] === page)) || null;
/** Адреса → сторінка: #finance відкриває останню вкладку фінансів, невідома адреса — null. */
export function resolvePage(id) {
  if (SECTIONS[id] && !PAGES.some(p => p[0] === id)) return UI.lastTab[id] || SECTIONS[id].tabs[0][0];
  return PAGES.some(p => p[0] === id) ? id : null;
}
export const UI = {
  page: 'home', lastTab: {}, supplierId: null, premisesId: null, regroupHidden: false, keepScroll: true, aiOpen: false, chatId: null,
  openCl: new Set(),
  f: { supQ: '', supStatus: '', prodQ: '', prodCat: '', prodSub: '', prodSort: 'name', prodSup: '', supCat: '', fitCat: '', fitStatus: '', noteQ: '', noteTag: '', taskStatus: '', taskPrio: '', purStatus: '', remShowDone: false },
};
export const root = document.getElementById('root');
export const D = () => Repo.data;

/** Коротке повідомлення внизу. undo — необов’язкова функція для кнопки «Скасувати». */
export function toast(msg, type, undo) {
  const box = document.getElementById('toasts'); const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : ''); el.setAttribute('role', 'status');
  const t = document.createElement('span'); t.textContent = msg; el.appendChild(t);
  if (undo) { const b = document.createElement('button'); b.textContent = 'Скасувати'; b.onclick = () => { el.remove(); undo(); }; el.appendChild(b); }
  box.appendChild(el);
  setTimeout(() => el.remove(), undo ? 8000 : type === 'error' ? 6000 : 2600);
}
export const pageTitle = id => (PAGES.find(p => p[0] === id) || PAGES[0])[1];
/** Назва в заголовку сторінки: назва розділу для вкладок. */
export const headTitle = id => { const s = sectionOf(id); return s ? SECTIONS[s].name : pageTitle(id); };
export const supplierName = id => { const s = id && Repo.get('suppliers', id); return s ? s.name : ''; };
export const catName = id => (D().settings.budgetCategories.find(c => c.id === id) || {}).name || 'Інше';
export const statusPill = s => `<span class="pill ${({ interested: 'info', contact: 'warn', working: 'ok', rejected: '' })[s]}">${Schema.SUPPLIER_STATUSES[s]}</span>`;
export const prioPill = p => `<span class="pill ${({ high: 'bad', medium: 'warn', low: '' })[p]}">${Schema.PRIORITIES[p]}</span>`;
/** Меню «Ще» для рідкісних дій сторінки: items — [act, назва]. */
export const moreMenu = items => `<details class="more-menu"><summary class="btn" aria-label="Інші дії">⋯ Ще</summary><div class="more-pop" role="menu">${items.map(([act, label]) => `<button class="btn ghost" role="menuitem" data-act="${act}">${label}</button>`).join('')}</div></details>`;
export const emptyState = (text, action, label, mini) => `<div class="empty ${mini ? 'mini' : ''}"><p>${text}</p><button class="btn ${mini ? 'sm' : ''} primary" data-act="${action}">${label}</button></div>`;
export function ext(url) { if (!url) return ''; const u = /^https?:\/\//i.test(url) ? url : 'https://' + url; return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(url.replace(/^https?:\/\//i, ''))}</a>`; }
export function igLink(v) { if (!v) return ''; if (/^https?:\/\//i.test(v)) return ext(v); const h = v.replace(/^@/, '').trim(); return `<a href="https://instagram.com/${encodeURIComponent(h)}" target="_blank" rel="noopener noreferrer">@${esc(h)}</a>`; }

export function taskSort(a, b) {
  const sd = (a.status === 'done') - (b.status === 'done'); if (sd) return sd;
  const da = a.deadline || '9999-99-99', db = b.deadline || '9999-99-99'; if (da !== db) return da < db ? -1 : 1;
  const pr = { high: 0, medium: 1, low: 2 }; return pr[a.priority] - pr[b.priority];
}
export const isOverdue = t => t.status !== 'done' && t.deadline && daysFromToday(t.deadline) < 0;
export function deadlineLabel(t) {
  if (!t.deadline) return '<span class="muted small">Без дедлайну</span>';
  const n = daysFromToday(t.deadline);
  if (t.status !== 'done' && n < 0) return `<span class="pill bad">Прострочено на ${-n} ${plural(-n, 'день', 'дні', 'днів')} · ${fmtDate(t.deadline)}</span>`;
  if (t.status !== 'done' && n === 0) return `<span class="pill warn">Сьогодні</span>`;
  if (t.status !== 'done' && n === 1) return `<span class="pill warn">Завтра · ${fmtDate(t.deadline)}</span>`;
  return `<span class="small muted">до ${fmtDate(t.deadline)}</span>`;
}

export const VIEWS = {};
