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
  ['suppliers', 'Постачальники'], ['products', 'Товари та ціни'], ['stock', 'Товари в наявності'], ['purchases', 'Закупівлі'], ['notes', 'Нотатки'],
  ['budget', 'Бюджет відкриття'], ['monthly', 'Щомісячні витрати'], ['breakeven', 'Беззбитковість'],
  ['data', 'Дані й акаунт'],
  ['payments', 'Платежі'], ['firstbuy', 'Перша закупівля'], ['cart', 'Кошик закупівель'],
];
/* Розділи з вкладками. Перша вкладка відкривається за замовчуванням. */
export const SECTIONS = {
  planner: { name: 'Справи', tabs: [['planner', 'Завдання'], ['reminders', 'Нагадування']] },
  opening: { name: 'Відкриття', tabs: [['opening', 'План відкриття'], ['premises', 'Приміщення'], ['fitout', 'Облаштування']] },
  finance: { name: 'Фінанси', tabs: [['budget', 'Бюджет відкриття'], ['payments', 'Платежі'], ['monthly', 'Щомісячні витрати'], ['breakeven', 'Беззбитковість']] },
  products: { name: 'Товари', tabs: [['products', 'Товари та ціни'], ['stock', 'Товари в наявності']] },
  purchases: { name: 'Закупівлі', tabs: [['purchases', 'Усі закупівлі'], ['cart', 'Кошик'], ['firstbuy', 'Перша закупівля']] },
};
/* Основне меню: [id розділу або сторінки, назва, іконка]. */
export const NAV = [
  ['home', 'Огляд', 'home'], ['planner', 'Справи', 'planner'], ['opening', 'Відкриття магазину', 'premises'],
  ['suppliers', 'Постачальники', 'suppliers'], ['products', 'Товари', 'products'], ['purchases', 'Закупівлі', 'purchases'], ['notes', 'Нотатки', 'notes'],
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
  f: { supQ: '', supStatus: '', prodQ: '', prodCat: '', prodSub: '', prodSort: 'name', prodSup: '', prodQuick: '', supCat: '', fitCat: '', fitStatus: '', noteQ: '', noteTag: '', taskStatus: '', taskPrio: '', purStatus: '', remShowDone: false, supSec: '', supSecFor: '', supProdQ: '', stockQ: '', stockCat: '', stockSup: '', stockAvail: 'in', stockSort: 'name' },
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
export const emptyState = (text, action, label, mini) => {
  const titles = { 'add-task': 'Завдань поки немає', 'add-product': 'Товарів поки немає', 'add-supplier': 'Постачальників поки немає', 'add-purchase': 'Закупівель поки немає', 'add-note': 'Нотаток поки немає', 'add-fitout': 'Список облаштування порожній', 'add-premises': 'Додайте приміщення', 'add-expense': 'Витрат поки немає', 'add-reminder': 'Нагадувань поки немає' };
  return `<div class="empty ${mini ? 'mini' : 'atelier-empty'}"><span class="empty-art" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><rect x="21" y="18" width="58" height="68" rx="11"/><path d="M36 15v12M64 15v12M35 43h30M35 55h22M35 67h16"/><circle cx="74" cy="73" r="18"/><path d="M66 73h16M74 65v16"/></svg></span><div class="empty-copy">${!mini ? `<h2>${titles[action] || 'Тут починається наступний крок'}</h2>` : ''}<p>${text}</p><button class="btn ${mini ? 'sm' : ''} primary" data-act="${action}"><span aria-hidden="true">＋</span> ${label}</button></div></div>`;
};
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

/** Як звертатися в привітанні: налаштування лише цього пристрою, у базу не потрапляє. */
const NAME_KEY = 'komfort-name';
export function userName() { try { return (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 40); } catch { return ''; } }
export function setUserName(v) { try { v = String(v || '').trim().slice(0, 40); v ? localStorage.setItem(NAME_KEY, v) : localStorage.removeItem(NAME_KEY); } catch { /* приватний режим */ } }
