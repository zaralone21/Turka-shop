import { Repo } from '../../core/repo.js';
import { Schema } from '../../core/schema.js';
import { byText, daysFromToday, esc, fmtDate, fmtKyiv, fmtMoney, plural } from '../../core/utils.js';
import { D, UI, VIEWS, emptyState, ext, igLink, statusPill } from '../shared.js';
import { productTable } from './products.js';
import { purchasePill } from './purchases.js';
import { Calc } from '../../core/calc.js';
import { fireAt } from '../../core/reminders.js';

/* ---------- 2. Постачальники ---------- */
VIEWS.suppliers = () => {
  if (UI.supplierId) { const s = Repo.get('suppliers', UI.supplierId); if (s) return supplierDetail(s); UI.supplierId = null; }
  const d = D(); const q = UI.f.supQ.trim().toLowerCase();
  const list = d.suppliers.filter(s => (!UI.f.supStatus || s.status === UI.f.supStatus) && (!q || [s.name, s.city, s.contactPerson, s.instagram, s.notes, ...s.categories].join(' ').toLowerCase().includes(q))).sort((a, b) => byText(a.name, b.name));
  const head = `<div class="page-head"><div><h1>Постачальники</h1><p>${d.suppliers.length} ${plural(d.suppliers.length, 'постачальник', 'постачальники', 'постачальників')}</p></div><button class="btn primary hide-m" data-act="add-supplier">+ Додати постачальника</button></div>`;
  if (!d.suppliers.length) return head + emptyState('Тут будуть картки постачальників з контактами, умовами та цінами на товари.', 'add-supplier', 'Додати першого постачальника');
  return head + `
  <div class="toolbar">
    <input class="input grow" id="f-supQ" data-filter="supQ" placeholder="Пошук: назва, місто, категорія…" value="${esc(UI.f.supQ)}" aria-label="Пошук постачальників">
    <select class="input" id="f-supStatus" data-filter="supStatus" aria-label="Статус"><option value="">Усі статуси</option>${Object.entries(Schema.SUPPLIER_STATUSES).map(([k, v]) => `<option value="${k}" ${UI.f.supStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
  </div>
  ${list.length ? `<div class="grid-cards">${list.map(supplierCard).join('')}</div>` : '<p class="muted">Нічого не знайдено за цими умовами.</p>'}`;
};
export function supplierCard(s) {
  const n = D().products.filter(p => p.supplierId === s.id).length;
  const age = s.checkedAt ? -daysFromToday(s.checkedAt) : null;
  return `<article class="card click" data-act="open-supplier" data-id="${s.id}" tabindex="0" role="button" aria-label="Відкрити ${esc(s.name)}">
    <div class="card-top"><h3>${esc(s.name)}</h3>${statusPill(s.status)}</div>
    ${s.categories.length ? `<div class="chips">${s.categories.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="small muted">${[s.city, s.contactPerson, s.phone].filter(Boolean).map(esc).join(' · ') || 'Контакти не вказані'}</div>
    ${s.minOrder ? `<div class="small">Мін. замовлення: ${esc(s.minOrder)}</div>` : ''}
    <div class="card-foot"><span class="small muted">${n} ${plural(n, 'товар', 'товари', 'товарів')}</span><span class="small ${age !== null && age > 90 ? '' : 'muted'}">${s.checkedAt ? `Перевірено ${fmtDate(s.checkedAt)}${age > 90 ? ' <span class="pill warn">давно</span>' : ''}` : '<span class="pill warn">Не перевірено</span>'}</span></div>
  </article>`;
}
export function supplierDetail(s) {
  const { products, notes, purchases } = Repo.linkedToSupplier(s.id);
  const rems = D().reminders.filter(r => r.status !== 'done' && r.link && r.link.type === 'supplier' && r.link.id === s.id);
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  return `
  <div><button class="btn ghost sm" data-act="back-suppliers">← Усі постачальники</button></div>
  <div class="page-head"><div><h1>${esc(s.name)}</h1><div class="row" style="margin-top:6px">${statusPill(s.status)}${s.categories.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>
    <div class="row"><button class="btn sm" data-act="edit-supplier" data-id="${s.id}">Редагувати</button><button class="btn sm" data-act="supplier-checked" data-id="${s.id}">Перевірено сьогодні</button><button class="btn sm danger hide-m" data-act="del-supplier" data-id="${s.id}">Видалити</button></div></div>
  <div class="grid-2">
    <section class="panel"><h2 style="margin-bottom:10px">Контакти</h2><dl class="kv">
      ${row('Instagram', igLink(s.instagram))}${row('Сайт', ext(s.website))}${row('Телефон', s.phone ? `<a class="num" href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a> <button class="btn sm ghost" data-act="copy" data-text="${esc(s.phone)}">Копіювати</button>` : '')}
      ${row('Telegram / Viber', esc(s.messenger))}${row('Контактна особа', esc(s.contactPerson))}${row('Місто', esc(s.city))}
      ${row('Інфо перевірено', fmtDate(s.checkedAt))}
    </dl>${!s.instagram && !s.website && !s.phone && !s.messenger && !s.contactPerson && !s.city ? '<p class="muted small">Контакти ще не додані.</p>' : ''}</section>
    <section class="panel"><h2 style="margin-bottom:10px">Умови</h2><dl class="kv">
      ${row('Мінімальне замовлення', esc(s.minOrder))}${row('Оплата', esc(s.paymentTerms))}${row('Доставка', esc(s.deliveryTerms))}${row('Обмін браку', esc(s.defectTerms))}
    </dl>${!s.minOrder && !s.paymentTerms && !s.deliveryTerms && !s.defectTerms ? '<p class="muted small">Умови ще не записані.</p>' : ''}
    ${s.notes ? `<h3 style="margin:14px 0 6px">Нотатки</h3><div class="pre small">${esc(s.notes)}</div>` : ''}</section>
  </div>
  <section class="panel">
    <div class="panel-head"><h2>Товари та ціни (${products.length})</h2><button class="btn sm primary" data-act="add-product" data-supplier="${s.id}">+ Додати товар</button></div>
    ${products.length ? productTable(products, false) : '<p class="muted small" style="margin:0">У цього постачальника ще немає товарів. Додайте товар із ціною, щоб не шукати її в переписці.</p>'}
  </section>
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
