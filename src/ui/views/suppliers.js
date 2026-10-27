import { Repo } from '../../core/repo.js';
import { Schema } from '../../core/schema.js';
import { NO_SECTION } from '../../core/sections.js';
import { byText, daysFromToday, esc, fmtDate, fmtKyiv, fmtMoney, plural } from '../../core/utils.js';
import { D, UI, VIEWS, emptyState, ext, igLink, statusPill } from '../shared.js';
import { svg } from '../shell.js';
import { supplierProducts } from './supplierSections.js';
import { minOrderLabel, minOrderOf } from '../../core/cart.js';
import { purchasePill } from './purchases.js';
import { Calc } from '../../core/calc.js';
import { fireAt } from '../../core/reminders.js';

/* ---------- 2. Постачальники ---------- */
VIEWS.suppliers = () => {
  if (UI.supplierId) { const s = Repo.get('suppliers', UI.supplierId); if (s) return supplierDetail(s); UI.supplierId = null; }
  const d = D(); const q = UI.f.supQ.trim().toLowerCase();
  const secs = [...new Set([...d.settings.sections.map(s => s.name), ...d.suppliers.flatMap(s => s.categories)])];
  if (UI.f.supCat && UI.f.supCat !== NO_SECTION && !secs.includes(UI.f.supCat)) UI.f.supCat = '';
  const base = d.suppliers.filter(s => (!UI.f.supStatus || s.status === UI.f.supStatus) && (!q || [s.name, s.city, s.contactPerson, s.instagram, s.notes, ...s.categories].join(' ').toLowerCase().includes(q))).sort((a, b) => byText(a.name, b.name));
  const list = UI.f.supCat === NO_SECTION ? base.filter(s => !s.categories.length) : UI.f.supCat ? base.filter(s => s.categories.includes(UI.f.supCat)) : base;
  const chip = (v, label, n) => `<button class="chip ${UI.f.supCat === v ? 'on' : ''}" data-act="sup-cat" data-v="${esc(v)}">${esc(label)} <span class="muted">${n}</span></button>`;
  const noCat = base.filter(s => !s.categories.length).length;
  const head = `<div class="page-head"><div><p>${d.suppliers.length} ${plural(d.suppliers.length, 'постачальник', 'постачальники', 'постачальників')}</p></div><button class="btn primary hide-m" data-act="add-supplier">+ Додати постачальника</button></div>`;
  if (!d.suppliers.length) return head + emptyState('Тут будуть картки постачальників з контактами, умовами та цінами на товари.', 'add-supplier', 'Додати першого постачальника');
  return head + `
  <div class="toolbar">
    <label class="search">${svg('search')}<input class="input" id="f-supQ" data-filter="supQ" placeholder="Пошук: назва, місто, категорія…" value="${esc(UI.f.supQ)}" aria-label="Пошук постачальників"></label>
    <select class="input" id="f-supStatus" data-filter="supStatus" aria-label="Статус"><option value="">Усі статуси</option>${Object.entries(Schema.SUPPLIER_STATUSES).map(([k, v]) => `<option value="${k}" ${UI.f.supStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  </div>
  <div class="chips sec-chips" role="group" aria-label="Розділи">${chip('', 'Усі', base.length)}${secs.map(c => chip(c, c, base.filter(s => s.categories.includes(c)).length)).join('')}${noCat ? chip(NO_SECTION, 'Без розділу', noCat) : ''}</div>
  ${list.length ? `<div class="grid-cards">${list.map(supplierCard).join('')}</div>` : '<p class="muted">Нічого не знайдено за цими умовами.</p>'}`;
};
export function supplierCard(s) {
  const n = D().products.filter(p => p.supplierId === s.id).length;
  const age = s.checkedAt ? -daysFromToday(s.checkedAt) : null;
  const cats = s.categories.slice(0, 2);
  return `<article class="card click sup-card" data-act="open-supplier" data-id="${s.id}" tabindex="0" role="button" aria-label="Відкрити ${esc(s.name)}">
    <div class="sup-top"><span class="lead" aria-hidden="true">${esc((s.name.trim()[0] || '?').toUpperCase())}</span>
      <div class="mn"><div class="card-top"><h3>${esc(s.name)}</h3>${statusPill(s.status)}</div>
      ${cats.length ? `<div class="chips">${cats.map(c => `<span class="chip">${esc(c)}</span>`).join('')}${s.categories.length > 2 ? `<span class="chip">+${s.categories.length - 2}</span>` : ''}</div>` : ''}</div></div>
    <div class="small muted">${[s.city, s.phone].filter(Boolean).map(esc).join(' · ') || 'Контакти не вказані'}</div>
    ${s.minOrder ? `<div class="small">Мін. замовлення: ${esc(s.minOrder)}</div>` : ''}
    <div class="card-foot"><span class="small muted">${n} ${plural(n, 'товар', 'товари', 'товарів')}</span><span class="small muted">${s.checkedAt ? `Перевірено ${fmtDate(s.checkedAt)}${age > 90 ? ' <span class="pill warn">давно</span>' : ''}` : '<span class="pill warn">Не перевірено</span>'}</span></div>
  </article>`;
}
export function supplierDetail(s) {
  const { products, notes, purchases } = Repo.linkedToSupplier(s.id);
  const rems = D().reminders.filter(r => r.status !== 'done' && r.link && r.link.type === 'supplier' && r.link.id === s.id);
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `
  <div><button class="btn ghost sm" data-act="back-suppliers">← Усі постачальники</button></div>
  <div class="page-head"><div><h2 class="rec-title">${esc(s.name)}</h2><div class="row" style="margin-top:6px">${statusPill(s.status)}${s.categories.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>
    <div class="row"><button class="btn sm" data-act="edit-supplier" data-id="${s.id}">Редагувати</button><button class="btn sm" data-act="supplier-checked" data-id="${s.id}">Перевірено сьогодні</button><button class="btn sm danger hide-m" data-act="del-supplier" data-id="${s.id}">Видалити</button></div></div>
  <div class="grid-2">
    <section class="panel"><h2 style="margin-bottom:10px">Контакти</h2><dl class="kv">
      ${row('Instagram', igLink(s.instagram))}${row('Сайт', ext(s.website))}${row('Телефон', s.phone ? `<a class="num" href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a> <button class="btn sm ghost" data-act="copy" data-text="${esc(s.phone)}">Копіювати</button>` : '')}
      ${row('Telegram / Viber', esc(s.messenger))}${row('Контактна особа', esc(s.contactPerson))}${row('Місто', esc(s.city))}
      ${row('Інфо перевірено', fmtDate(s.checkedAt))}
    </dl>${!s.instagram && !s.website && !s.phone && !s.messenger && !s.contactPerson && !s.city ? '<p class="muted small">Контакти ще не додані.</p>' : ''}</section>
    <section class="panel"><h2 style="margin-bottom:10px">Умови</h2><dl class="kv">
      ${row('Мінімальне замовлення', esc(s.minOrder))}${minOrderOf(s) ? row('Мін. замовлення числами', esc(minOrderLabel(minOrderOf(s)))) : ''}${row('Оплата', esc(s.paymentTerms))}${row('Доставка', esc(s.deliveryTerms))}${row('Обмін браку', esc(s.defectTerms))}
    </dl>${!s.minOrder && !minOrderOf(s) && !s.paymentTerms && !s.deliveryTerms && !s.defectTerms ? '<p class="muted small">Умови ще не записані.</p>' : ''}
    ${s.notes ? `<h3 style="margin:14px 0 6px">Нотатки</h3><div class="pre small">${esc(s.notes)}</div>` : ''}</section>
  </div>
  ${supplierProducts(s, products)}
  <section class="panel">
    <div class="panel-head"><h2>Нотатки про постачальника (${notes.length})</h2><button class="btn sm" data-act="add-note" data-supplier="${s.id}">+ Нотатка</button></div>
    ${notes.length ? `<div class="list">${notes.map(n => `<div class="li"><div class="t"><b>${esc(n.title || 'Без заголовка')}</b><div class="small muted clamp" style="-webkit-line-clamp:2">${esc(n.body)}</div></div><button class="btn sm" data-act="edit-note" data-id="${n.id}">Відкрити</button></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Нотаток поки немає.</p>'}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Закупівлі (${purchases.length})</h2><button class="btn sm" data-act="add-purchase" data-supplier="${s.id}">+ Закупівля</button></div>
    ${purchases.length ? `<div class="list">${purchases.map(p => `<div class="li"><button class="li-btn" data-act="edit-purchase" data-id="${p.id}"><span class="nm">${esc(p.title)}</span><div class="small muted">${p.expectedDate ? 'очікується ' + fmtDate(p.expectedDate) : 'дата не вказана'}</div></button><span class="num small" style="text-align:right">${fmtMoney(Calc.purchaseTotal(p).total)}<br>${purchasePill(p.status)}</span></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Закупівель у цього постачальника ще немає.</p>'}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Нагадування (${rems.length})</h2><button class="btn sm" data-act="add-reminder" data-supplier="${s.id}">+ Нагадування</button></div>
    ${rems.length ? `<div class="list">${rems.map(r => `<div class="li"><button class="li-btn" data-act="edit-reminder" data-id="${r.id}"><span class="nm">${esc(r.title)}</span><div class="small muted">${fmtKyiv(fireAt(r))}</div></button></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Активних нагадувань немає.</p>'}
  </section>`;
}
