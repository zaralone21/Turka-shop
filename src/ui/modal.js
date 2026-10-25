import { byText, esc, fmtDate, isNum, parseNum } from '../core/utils.js';
import { D, root } from './shared.js';
import { svg } from './shell.js';

/* =====================================================================
   7. МОДАЛЬНІ ВІКНА ТА ФОРМИ
   ===================================================================== */
export let modalEl = null, lastFocus = null;
export function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; if (lastFocus && lastFocus.isConnected) lastFocus.focus(); } }
const isSheet = () => matchMedia('(max-width: 900px)').matches;
/** Телефон: свайп униз за шапку закриває вікно, якщо в ньому нічого не змінено. */
function wireSheet(back) {
  const m = back.querySelector('.modal'); let y0 = null, dy = 0;
  back.addEventListener('input', () => { back.dataset.dirty = '1'; });
  m.addEventListener('touchstart', e => { if (!isSheet() || e.target.closest('button, input, select, textarea') || e.touches[0].clientY - m.getBoundingClientRect().top > 60) return; y0 = e.touches[0].clientY; dy = 0; m.classList.add('dragging'); }, { passive: true });
  m.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = `translateY(${back.dataset.dirty ? Math.min(dy, 40) * .5 : dy}px)`; }, { passive: true });
  const end = () => { if (y0 === null) return; y0 = null; m.classList.remove('dragging');
    if (dy > 90 && !back.dataset.dirty) { m.classList.add('closing'); back.classList.add('fading'); setTimeout(() => { if (modalEl === back) back.querySelector('[data-close]').click(); }, 240); return; }
    m.style.transform = ''; if (dy > 90) { m.classList.remove('nudge'); void m.offsetWidth; m.classList.add('nudge'); } };
  m.addEventListener('touchend', end); m.addEventListener('touchcancel', end);
  // поле під курсором не ховається за клавіатурою
  back.addEventListener('focusin', e => { if (isSheet() && e.target.matches('input, textarea, select')) setTimeout(() => e.target.isConnected && e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 260); });
}
/* Висота екранної клавіатури (iOS не зменшує вікно): піднімаємо вікно на неї. */
if (window.visualViewport) {
  const kb = () => { const v = visualViewport; const h = Math.max(0, Math.round(innerHeight - v.height - v.offsetTop)); document.documentElement.style.setProperty('--kb', (h > 80 ? h : 0) + 'px'); };
  visualViewport.addEventListener('resize', kb); visualViewport.addEventListener('scroll', kb);
}
export function openModal({ title, body, foot, narrow, wide, onMount }) {
  closeModal(); lastFocus = document.activeElement;
  modalEl = document.createElement('div'); modalEl.className = 'modal-back';
  modalEl.innerHTML = `<div class="modal ${narrow ? 'narrow' : wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="btn ghost icon" data-close aria-label="Закрити">✕</button></div>${body}${foot || ''}</div>`;
  modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });
  modalEl.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(modalEl);
  wireSheet(modalEl);
  onMount && onMount(modalEl);
  const first = modalEl.querySelector('input:not([type=hidden]):not(.sr), textarea, select, .modal-f .btn'); first && first.focus();
}
/** Підтвердження всередині сторінки (системні confirm() тут не працюють). */
export function confirmDialog({ title, text, ok = 'Видалити', danger = true }) {
  return new Promise(resolve => {
    let done = false; const finish = v => { if (!done) { done = true; resolve(v); closeModal(); } };
    openModal({ title, narrow: true, body: `<div class="modal-b">${text}</div>`, foot: `<div class="modal-f"><button class="btn" data-no>Скасувати</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-yes>${ok}</button></div>`,
      onMount: m => { m.querySelector('[data-yes]').onclick = () => finish(true); m.querySelector('[data-no]').onclick = () => finish(false); m.querySelector('[data-close]').addEventListener('click', () => finish(false)); m.addEventListener('mousedown', e => { if (e.target === m) finish(false); }); } });
    const obs = setInterval(() => { if (!modalEl) { clearInterval(obs); if (!done) { done = true; resolve(false); } } }, 300);
  });
}
export const F = {
  text: (name, label, v, o = {}) => `<label class="field ${o.full ? 'full' : ''}"><span class="lbl">${label}${o.req ? ' *' : ''}</span><input class="input" id="fld-${name}" name="${name}" value="${esc(v ?? '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.list ? `list="${o.list}"` : ''} ${o.type ? `type="${o.type}"` : ''} ${o.mode ? `inputmode="${o.mode}"` : ''}>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  money: (name, label, v, o = {}) => F.text(name, label, isNum(v) ? String(v).replace('.', ',') : (v ?? ''), { ...o, mode: 'decimal' }),
  area: (name, label, v, o = {}) => `<label class="field ${o.full !== false ? 'full' : ''}"><span class="lbl">${label}</span><textarea class="input" id="fld-${name}" name="${name}" rows="${o.rows || 3}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>${esc(v ?? '')}</textarea>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  select: (name, label, v, opts, o = {}) => `<label class="field ${o.full ? 'full' : ''}"><span class="lbl">${label}</span><select class="input" id="fld-${name}" name="${name}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`,
  date: (name, label, v, o = {}) => `<div class="field ${o.full ? 'full' : ''}"><label class="lbl" for="fld-${name}">${label}</label><div class="date-wrap"><input class="input num" id="fld-${name}" name="${name}" value="${v ? fmtDate(v) : ''}" placeholder="ДД.ММ.РРРР" inputmode="numeric" maxlength="10" autocomplete="off" data-date><span class="date-pick" title="Вибрати в календарі">${svg('calendar')}<input type="date" aria-label="${esc(label)}: календар" data-native-for="${name}" value="${v || ''}"></span></div>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`,
};
export const supplierOptions = () => [['', '— не вказано —'], ...[...D().suppliers].sort((a, b) => byText(a.name, b.name)).map(s => [s.id, s.name])];

/** Загальна форма: build → html полів; read(fd, form) → {errors, values}; save(values). */
export function formModal({ title, fields, read, save, onMount, onDelete, wide, submitLabel = 'Зберегти' }) {
  openModal({ title, wide, body: `<form class="modal-b" id="modal-form" novalidate><div class="form-error" hidden></div><div class="form-grid">${fields}</div></form>`,
    foot: `<div class="modal-f">${onDelete ? '<button class="btn danger" type="button" data-del style="margin-right:auto">Видалити</button>' : ''}<button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="submit" form="modal-form">${submitLabel}</button></div>`,
    onMount: m => {
      const form = m.querySelector('form');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        form.querySelectorAll('.bad').forEach(x => x.classList.remove('bad')); form.querySelectorAll('.field .err').forEach(x => x.remove());
        const { errors, values } = read(new FormData(form), form);
        if (errors && Object.keys(errors).length) {
          for (const [k, msg] of Object.entries(errors)) { const inp = form.querySelector(`[name="${k}"]`); if (inp) { inp.classList.add('bad'); const s = document.createElement('span'); s.className = 'err'; s.textContent = msg; inp.after(s); } }
          const box = form.querySelector('.form-error'); box.hidden = false; box.textContent = 'Перевірте позначені поля.';
          const firstBad = form.querySelector('.bad'); firstBad && firstBad.focus(); return;
        }
        await save(values); closeModal();
      });
      wireDateFields(m);
      if (onDelete) m.querySelector('[data-del]').onclick = () => { closeModal(); onDelete(); };
      onMount && onMount(m);
    } });
}
export function moneyField(fd, key, errors, { required, positive } = {}) {
  const n = parseNum(fd.get(key));
  if (n === null) { if (required) errors[key] = 'Вкажіть суму.'; return null; }
  if (Number.isNaN(n)) { errors[key] = 'Введіть число, наприклад 1250,50.'; return null; }
  if (n < 0) { errors[key] = 'Сума не може бути від’ємною.'; return null; }
  if (positive && n === 0) { errors[key] = 'Має бути більше нуля.'; return null; }
  return n;
}
export const g = (fd, k) => String(fd.get(k) ?? '').trim();
/** 'ДД.ММ.РРРР' → 'YYYY-MM-DD'; '' → ''; некоректне → null. */
export function parseDateUA(s) {
  s = String(s || '').trim(); if (!s) return '';
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3]; const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export function dateField(fd, key, errors) { const v = parseDateUA(fd.get(key)); if (v === null) { errors[key] = 'Введіть дату у форматі ДД.ММ.РРРР, наприклад 05.11.2026.'; return ''; } return v; }
/* Поле дати: автокрапки під час введення + вибір у календарі браузера. */
export function wireDateFields(root) {
  root.querySelectorAll('[data-date]').forEach(inp => {
    inp.addEventListener('input', e => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      const dg = inp.value.replace(/\D/g, '').slice(0, 8);
      inp.value = dg.length > 4 ? `${dg.slice(0, 2)}.${dg.slice(2, 4)}.${dg.slice(4)}` : dg.length > 2 ? `${dg.slice(0, 2)}.${dg.slice(2)}` : dg;
    });
    const nat = root.querySelector(`[data-native-for="${inp.name}"]`);
    if (nat) {
      inp.addEventListener('change', () => { const iso = parseDateUA(inp.value); if (iso) nat.value = iso; });
      nat.addEventListener('change', () => { if (nat.value) { inp.value = fmtDate(nat.value); inp.dispatchEvent(new Event('input', { bubbles: true })); } });
    }
  });
}
