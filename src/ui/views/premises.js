import { PREMISES_STATUSES, isLeaseConfirmed, mainPremises, premisesBudgetPlan, premisesTitle } from '../../core/opening.js';
import { Repo } from '../../core/repo.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, fmtNum, isNum } from '../../core/utils.js';
import { FILE_ACCEPT, filesAvailable } from '../files.js';
import { D, UI, VIEWS, emptyState, ext } from '../shared.js';

/* ---------- Приміщення ---------- */
const STATUS_PILL = { selected: 'info', negotiating: 'warn', signed: 'ok', keys: 'ok' };
export const premisesPill = s => `<span class="pill ${STATUS_PILL[s] || ''}">${PREMISES_STATUSES[s]}</span>`;
const unk = '<span class="muted">не вказано</span>';
const val = v => (v === null || v === undefined || v === '') ? unk : esc(v);
const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;

function filesPanel(pr) {
  const groups = [['photo', 'Фото приміщення'], ['measure', 'Заміри та плани'], ['doc', 'Документи']];
  const can = filesAvailable();
  const item = f => f.type.startsWith('image/')
    ? `<div class="pf-item"><button class="pf-thumb" data-act="premises-file-open" data-path="${esc(f.path)}" aria-label="Відкрити ${esc(f.name)}"><img data-pfile="${esc(f.path)}" alt="${esc(f.name)}" loading="lazy"></button><button class="pf-del" data-act="premises-file-del" data-id="${pr.id}" data-file="${f.id}" aria-label="Видалити ${esc(f.name)}">✕</button></div>`
    : `<div class="li"><button class="li-btn" data-act="premises-file-open" data-path="${esc(f.path)}"><span class="nm">📄 ${esc(f.name)}</span><div class="small muted">${f.size ? Math.round(f.size / 1024) + ' КБ' : ''}</div></button><button class="btn sm ghost" data-act="premises-file-del" data-id="${pr.id}" data-file="${f.id}" aria-label="Видалити">✕</button></div>`;
  return `<section class="panel"><div class="panel-head"><h2>Фото, заміри, документи</h2></div>
    ${can ? '' : '<div class="callout info">Файли зберігаються лише в приватному сховищі. Увійдіть в обліковий запис, щоб додавати фото й документи.</div>'}
    ${groups.map(([k, label]) => { const list = pr.files.filter(f => f.kind === k);
      return `<div class="pf-group"><div class="row" style="justify-content:space-between"><h3>${label}${list.length ? ` <span class="muted small">${list.length}</span>` : ''}</h3>${can ? `<label class="btn sm">+ Додати<input type="file" class="sr" accept="${FILE_ACCEPT}" multiple data-pfile-kind="${k}" data-id="${pr.id}"></label>` : ''}</div>
        ${list.length ? `<div class="pf-list">${list.map(item).join('')}</div>` : '<p class="small muted" style="margin:0">Поки порожньо.</p>'}</div>`; }).join('')}
  </section>`;
}

function premisesDetail(pr) {
  const d = D(); const plan = premisesBudgetPlan(d, pr);
  const rem = pr.rentReminderId && Repo.get('reminders', pr.rentReminderId);
  const planLine = x => `<li>${esc(x.label)}: ${x.amount === null ? unk : `<b>${fmtMoney(x.amount)}</b>`} · ${x.action === 'same' ? '<span class="pill ok">у бюджеті</span>' : x.action === 'update' ? `<span class="pill warn">у бюджеті ${fmtMoney(x.from)}</span>` : x.action === 'create' ? '<span class="pill">не в бюджеті</span>' : ''}</li>`;
  const needBudget = plan.some(x => x.action === 'create' || x.action === 'update');
  return `
  <div class="page-head"><div><h2 class="rec-title">${esc(premisesTitle(pr))}</h2><div class="row" style="margin-top:6px">${premisesPill(pr.status)}${pr.name && pr.address ? `<span class="small muted">${esc(pr.address)}</span>` : ''}</div></div>
    <div class="row"><button class="btn" data-act="edit-premises" data-id="${pr.id}">Редагувати</button></div></div>
  ${isLeaseConfirmed(pr) ? '' : `<div class="callout warn"><b>Договір ще не підписано.</b> Суми й умови тут — домовленості, а не підтверджені факти. Коли підпишете договір, змініть статус.</div>`}
  <div class="grid-2">
    <section class="panel"><h2 style="margin-bottom:10px">Основне</h2><dl class="kv">
      ${row('Адреса', val(pr.address))}${row('Площа', isNum(pr.area) ? fmtNum(pr.area) + ' м²' : unk)}${row('Карта', pr.mapUrl ? ext(pr.mapUrl) : unk)}
      ${row('Орендодавець', val(pr.landlordName))}${row('Телефон', pr.landlordPhone ? `<a href="tel:${esc(pr.landlordPhone.replace(/[^\d+]/g, ''))}">${esc(pr.landlordPhone)}</a>` : unk)}${row('Інший контакт', val(pr.landlordContact))}
    </dl></section>
    <section class="panel"><div class="panel-head"><h2>Гроші</h2></div><dl class="kv">
      ${row('Оренда за місяць', isNum(pr.rent) ? fmtMoney(pr.rent) : unk)}${row('Депозит', isNum(pr.deposit) ? fmtMoney(pr.deposit) : unk)}
      ${row('День оплати', pr.payDay ? `${pr.payDay}-го числа` : unk)}
      ${pr.otherPayments.map(o => row(esc(o.name || 'Інший платіж'), isNum(o.amount) ? fmtMoney(o.amount) : unk)).join('')}
    </dl>
    <h3 style="margin:14px 0 6px">Бюджет відкриття</h3><ul class="small plain">${plan.map(planLine).join('')}</ul>
    <div class="row" style="margin-top:10px">${needBudget ? `<button class="btn sm primary" data-act="premises-budget" data-id="${pr.id}">${plan.some(x => x.action === 'update') ? 'Оновити бюджет' : 'Внести в бюджет'}</button>` : ''}
      <button class="btn sm" data-act="premises-reminder" data-id="${pr.id}">${rem ? `Нагадування: ${esc(fmtKyiv(rem.fireAt))}` : 'Нагадувати про оплату оренди'}</button></div></section>
    <section class="panel"><h2 style="margin-bottom:10px">Терміни</h2><dl class="kv">
      ${row('Початок оренди', pr.leaseStart ? fmtDate(pr.leaseStart) : unk)}${row('Завершення договору', pr.leaseEnd ? fmtDate(pr.leaseEnd) : unk)}
      ${row('Орендні канікули', pr.holidayFrom || pr.holidayTo ? `${pr.holidayFrom ? fmtDate(pr.holidayFrom) : '…'} – ${pr.holidayTo ? fmtDate(pr.holidayTo) : '…'}` : unk)}
      ${pr.holidayTerms ? row('Умови канікул', `<span class="pre">${esc(pr.holidayTerms)}</span>`) : ''}
    </dl></section>
    <section class="panel"><h2 style="margin-bottom:10px">Комунальні</h2><dl class="kv">
      ${row('Входить в оренду', pr.utilitiesIncluded ? `<span class="pre">${esc(pr.utilitiesIncluded)}</span>` : unk)}${row('Окремо', pr.utilitiesSeparate ? `<span class="pre">${esc(pr.utilitiesSeparate)}</span>` : unk)}
    </dl></section>
  </div>
  ${pr.measurements || pr.notes ? `<section class="panel">${pr.measurements ? `<h2 style="margin-bottom:6px">Заміри</h2><div class="pre small">${esc(pr.measurements)}</div>` : ''}${pr.notes ? `<h2 style="margin:${pr.measurements ? '14px' : '0'} 0 6px">Домовленості</h2><div class="pre small">${esc(pr.notes)}</div>` : ''}</section>` : ''}
  ${filesPanel(pr)}`;
}

VIEWS.premises = () => {
  const d = D();
  if (!d.premises.length) return `<div class="page-head"><div><p>Точка, яку готуєте до відкриття: адреса, умови оренди, терміни, файли.</p></div></div>`
    + emptyState('Запишіть вибране приміщення. Невідомі поля можна лишити порожніми й дописати пізніше.', 'add-premises', 'Додати приміщення');
  const pr = (UI.premisesId && Repo.get('premises', UI.premisesId)) || mainPremises(d);
  const pick = d.premises.length > 1 ? `<div class="chips sec-chips" role="group" aria-label="Приміщення">${d.premises.map(p => `<button class="chip ${p.id === pr.id ? 'on' : ''}" data-act="pick-premises" data-id="${p.id}">${esc(premisesTitle(p))}</button>`).join('')}</div>` : '';
  return pick + premisesDetail(pr) + `<p class="small muted" style="margin:0"><button class="btn link" data-act="add-premises">+ Записати інше приміщення</button> (наприклад, запасний варіант)</p>`;
};
