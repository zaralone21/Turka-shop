import { byText, esc, fmtDate, plural, uniq } from '../../core/utils.js';
import { D, UI, VIEWS, emptyState, supplierName } from '../shared.js';

/* ---------- 4. Нотатки ---------- */
VIEWS.notes = () => {
  const d = D(); const q = UI.f.noteQ.trim().toLowerCase();
  const tags = uniq(d.notes.flatMap(n => n.tags)).sort(byText);
  if (UI.f.noteTag && !tags.includes(UI.f.noteTag)) UI.f.noteTag = '';
  const list = d.notes.filter(n => (!UI.f.noteTag || n.tags.includes(UI.f.noteTag)) && (!q || [n.title, n.body, ...n.tags, supplierName(n.supplierId)].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt > a.updatedAt ? 1 : -1));
  const head = `<div class="page-head"><div><p>${d.notes.length} ${plural(d.notes.length, 'нотатка', 'нотатки', 'нотаток')}</p></div><button class="btn primary hide-m" data-act="add-note">+ Нова нотатка</button></div>`;
  if (!d.notes.length) return head + emptyState('Записуйте ідеї, домовленості й корисні контакти. Важливі нотатки можна закріпити.', 'add-note', 'Створити першу нотатку');
  return head + `
  <div class="toolbar"><input class="input grow" id="f-noteQ" data-filter="noteQ" placeholder="Пошук у нотатках…" value="${esc(UI.f.noteQ)}" aria-label="Пошук нотаток"></div>
  ${tags.length ? `<div class="chips"><button class="chip ${!UI.f.noteTag ? 'on' : ''}" data-act="note-tag" data-tag="">Усі</button>${tags.map(t => `<button class="chip ${UI.f.noteTag === t ? 'on' : ''}" data-act="note-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
  ${list.length ? `<div class="grid-cards">${list.map(n => `<article class="card">
    <div class="card-top"><h3>${esc(n.title || 'Без заголовка')}</h3><button class="btn sm ghost icon" data-act="pin-note" data-id="${n.id}" aria-pressed="${n.pinned}" title="${n.pinned ? 'Відкріпити' : 'Закріпити'}" style="${n.pinned ? '' : 'opacity:.45'}">📌</button></div>
    ${n.body ? `<div class="pre small clamp">${esc(n.body)}</div>` : ''}
    ${n.tags.length ? `<div class="chips">${n.tags.map(t => `<span class="chip">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${n.supplierId ? `<div class="small">Постачальник: <button class="btn sm ghost" style="padding:2px 4px" data-act="open-supplier" data-id="${n.supplierId}">${esc(supplierName(n.supplierId))}</button></div>` : ''}
    <div class="card-foot"><span class="small muted">Створено ${fmtDate(n.createdAt)}${n.updatedAt !== n.createdAt ? ` · змінено ${fmtDate(n.updatedAt, true)}` : ''}</span><span class="row"><button class="btn sm" data-act="edit-note" data-id="${n.id}">Змінити</button><button class="btn sm danger" data-act="del-note" data-id="${n.id}" aria-label="Видалити">✕</button></span></div>
  </article>`).join('')}</div>` : '<p class="muted">Нічого не знайдено.</p>'}`;
};
