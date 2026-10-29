/* =====================================================================
   ВИБІР З ПОШУКОМ для довгих списків (товари тощо).
   Звичайний <select> лишається у формі й зберігає значення, тож код, що читає select.value
   або слухає 'change', працює без змін. Поверх нього — поле, у яке можна друкувати назву.
   ===================================================================== */
export const COMBO_MIN = 12;
const norm = s => String(s || '').toLowerCase().replace(/[’'`ʼ]/g, '’').replace(/\s+/g, ' ').trim();

export function enhanceSelect(sel) {
  if (!sel || sel.dataset.combo || sel.multiple) return;
  sel.dataset.combo = '1';
  const wrap = document.createElement('div'); wrap.className = 'combo';
  sel.before(wrap); wrap.appendChild(sel); sel.classList.add('combo-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'input combo-in'; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
  inp.setAttribute('aria-label', sel.getAttribute('aria-label') || sel.closest('label')?.querySelector('.lbl')?.textContent?.replace('*', '').trim() || 'Вибір');
  inp.placeholder = 'Почніть вводити назву…';
  const list = document.createElement('div'); list.className = 'combo-list'; list.setAttribute('role', 'listbox'); list.hidden = true;
  const lid = 'cl-' + Math.random().toString(36).slice(2, 9); list.id = lid; inp.setAttribute('aria-controls', lid);
  wrap.append(inp, list);
  // У <label> клік по списку переводив би фокус на прихований select.
  wrap.addEventListener('click', e => { if (e.target.closest('.combo-list')) e.preventDefault(); });

  let items = [], active = -1;
  const label = () => { const o = sel.selectedOptions[0]; return o && o.value ? o.textContent : ''; };
  const sync = () => { inp.value = label(); inp.placeholder = sel.options[0] && !sel.options[0].value ? sel.options[0].textContent.replace(/^—\s*|\s*—$/g, '') : 'Почніть вводити назву…'; inp.classList.toggle('bad', sel.classList.contains('bad')); };
  const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); };
  const draw = q => {
    const words = norm(q).split(' ').filter(Boolean);
    items = []; let html = '', group = null;
    for (const o of sel.options) {
      if (o.disabled) continue;
      const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
      const text = o.textContent, hay = norm(text + ' ' + (g || ''));
      if (words.length && (!o.value || !words.every(w => hay.includes(w)))) continue;
      if (items.length >= 300) break;
      if (g !== group) { group = g; if (g) html += `<div class="combo-g" role="presentation">${esc(g)}</div>`; }
      const i = items.length; items.push(o);
      html += `<div class="combo-o ${o.selected && o.value ? 'sel' : ''}" role="option" id="${lid}-${i}" data-i="${i}" aria-selected="${o.selected}">${esc(text)}</div>`;
    }
    list.innerHTML = html || '<div class="combo-none">Нічого не знайдено</div>';
    active = items.length ? Math.max(0, words.length ? 0 : items.findIndex(o => o.selected)) : -1;
    mark();
    list.hidden = false; inp.setAttribute('aria-expanded', 'true');
  };
  const mark = () => {
    list.querySelectorAll('.combo-o.on').forEach(x => x.classList.remove('on'));
    const el = active >= 0 && list.querySelector(`[data-i="${active}"]`);
    if (el) { el.classList.add('on'); el.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', el.id); }
  };
  const choose = i => {
    const o = items[i]; if (!o) return;
    if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    sync(); close();
  };
  inp.addEventListener('focus', () => { inp.select(); draw(''); });
  inp.addEventListener('input', () => draw(inp.value));
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) { close(); sync(); } }, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) draw(''); else if (items.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); } }
    else if (e.key === 'Enter') { if (!list.hidden) { e.preventDefault(); choose(active); } }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); e.stopPropagation(); close(); sync(); } }
    else if (e.key === 'Tab') { close(); sync(); }
  });
  list.addEventListener('mousedown', e => { e.preventDefault(); const o = e.target.closest('.combo-o'); if (o) choose(+o.dataset.i); });
  sel.addEventListener('change', sync);
  // Варіанти можуть замінюватись кодом (наприклад, зміна постачальника) — підпис оновлюється.
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Довгі списки у вікні отримують пошук; нові (наприклад, додані позиції закупівлі) — теж. */
export function enhanceLongSelects(root) {
  const run = () => root.querySelectorAll('select:not([data-combo]):not([data-no-combo])').forEach(s => { if (s.dataset.search !== undefined || s.options.length > COMBO_MIN) enhanceSelect(s); });
  run();
  new MutationObserver(run).observe(root, { childList: true, subtree: true });
}
