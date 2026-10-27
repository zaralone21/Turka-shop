import { Repo } from '../../core/repo.js';
import { SEC_ALL, SEC_NONE, filterBySection, planSections, sectionCounts, sectionIdOf, sectionsOf, validKey } from '../../core/supplierSections.js';
import { esc, plural } from '../../core/utils.js';
import { closeModal, confirmDialog, openModal } from '../modal.js';
import { D, UI, toast } from '../shared.js';
import { svg } from '../shell.js';
import { productTable } from './products.js';

/* ---------- Розділи товарів у картці постачальника ---------- */
const n3 = n => `${n} ${plural(n, 'товар', 'товари', 'товарів')}`;
/** Вибраний розділ постачальника (зберігається, поки відкрита його картка). */
export const currentKey = s => (UI.f.supSecFor === s.id ? validKey(s, UI.f.supSec) : SEC_ALL);
export const sectionName = (s, key) => (key === SEC_NONE ? 'Без розділу' : key === SEC_ALL ? 'Усі товари' : sectionsOf(s).find(x => x.id === key)?.name || 'Усі товари');
/** Варіанти для вибору розділу: [id, назва] з «Без розділу» на початку. */
export const sectionOptions = s => [['', 'Без розділу'], ...sectionsOf(s).map(x => [x.id, x.name])];

/** Блок «Товари та ціни» в картці постачальника: навігація по розділах, пошук і список. */
export function supplierProducts(s, products) {
  const key = currentKey(s), counts = sectionCounts(products, s), secs = sectionsOf(s);
  const q = UI.f.supSecFor === s.id ? UI.f.supProdQ : '';
  const list = filterBySection(products, s, key, q);
  const chip = (k, label) => `<button class="chip ${key === k ? 'on' : ''} ${counts[k] ? '' : 'zero'}" data-act="sup-sec" data-id="${s.id}" data-v="${esc(k)}" aria-pressed="${key === k}">${esc(label)} <span class="muted">${counts[k]}</span></button>`;
  const nav = `<div class="chips sec-chips sup-sec-nav" role="group" aria-label="Розділи постачальника">${chip(SEC_ALL, 'Усі товари')}${secs.map(x => chip(x.id, x.name)).join('')}${chip(SEC_NONE, 'Без розділу')}</div>`;
  const tools = `<div class="toolbar sup-sec-tools">
      <label class="search">${svg('search')}<input class="input" id="f-supProdQ" data-filter="supProdQ" placeholder="${key === SEC_ALL ? 'Пошук по всіх товарах постачальника' : `Пошук у розділі «${esc(sectionName(s, key))}»`}" value="${esc(q)}" aria-label="Пошук товарів постачальника"></label>
      <div class="row"><button class="btn sm" data-act="sup-sec-manage" data-id="${s.id}">Розділи</button>${products.length ? `<button class="btn sm" data-act="sup-sec-move" data-id="${s.id}">Перенести товари</button>` : ''}</div>
    </div>`;
  let body;
  if (!products.length) body = '<p class="muted small" style="margin:0">У цього постачальника ще немає товарів. Додайте товар із ціною, щоб не шукати її в переписці.</p>';
  else if (!list.length) body = `<p class="muted small" style="margin:0">${q ? 'Нічого не знайдено.' : key === SEC_NONE ? 'Усі товари вже розкладено по розділах.' : 'У цьому розділі ще немає товарів. Перенесіть їх кнопкою «Перенести товари» або виберіть розділ у формі товару.'}</p>`;
  else if (key === SEC_ALL && !q && secs.length) {
    // «Усі товари» з розділами: групи в порядку розділів, «Без розділу» наприкінці.
    const groups = [...secs.map(x => [x.id, x.name]), [null, 'Без розділу']].map(([id, name]) => [name, list.filter(p => sectionIdOf(p, s) === id)]).filter(([, l]) => l.length);
    body = groups.map(([name, l]) => `<div class="sup-sec-group"><h3 class="sup-sec-h">${esc(name)} <span class="muted small">${l.length}</span></h3>${productTable(l)}</div>`).join('');
  } else body = productTable(list);
  return `<section class="panel sup-products">
    <div class="panel-head"><h2>Товари та ціни (${products.length})</h2><button class="btn sm primary" data-act="add-product" data-supplier="${s.id}" data-section="${key !== SEC_ALL && key !== SEC_NONE ? esc(key) : ''}">+ Додати товар</button></div>
    ${products.length || secs.length ? nav + tools : ''}
    ${q ? `<p class="small muted" style="margin:0 0 8px">Знайдено ${list.length} з ${key === SEC_ALL ? products.length : counts[key]}</p>` : ''}
    ${body}
  </section>`;
}

/** Створення, перейменування, порядок і видалення розділів постачальника. */
export function manageSections(id) {
  const s = Repo.get('suppliers', id); if (!s) return;
  let rows = sectionsOf(s).map(x => ({ id: x.id, name: x.name }));
  const count = sid => D().products.filter(p => p.supplierId === id && sectionIdOf(p, s) === sid).length;
  const draw = m => {
    m.querySelector('#ss-rows').innerHTML = rows.length ? rows.map((r, i) => `<div class="li ss-row" data-i="${i}">
        <input class="input" value="${esc(r.name)}" data-ss-name="${i}" aria-label="Назва розділу ${i + 1}" maxlength="60">
        <span class="small muted ss-n">${r.id ? n3(count(r.id)) : 'новий'}</span>
        <span class="row ss-acts"><button type="button" class="btn sm ghost" data-ss-up="${i}" ${i ? '' : 'disabled'} aria-label="Вище">↑</button><button type="button" class="btn sm ghost" data-ss-down="${i}" ${i < rows.length - 1 ? '' : 'disabled'} aria-label="Нижче">↓</button><button type="button" class="btn sm ghost danger" data-ss-del="${i}" aria-label="Видалити розділ">✕</button></span></div>`).join('')
      : '<p class="small muted" style="margin:0">Розділів ще немає. Додайте перший, наприклад «Шкарпетки» або «Піжами».</p>';
  };
  openModal({
    title: `Розділи · ${s.name}`,
    body: `<form class="modal-b" id="ss-form" novalidate><p class="small muted" style="margin:0">Розділи лише цього постачальника. Видалення розділу не видаляє товари: вони перейдуть у «Без розділу».</p>
      <div class="list" id="ss-rows"></div>
      <div class="row ss-add"><input class="input" id="ss-new" placeholder="Новий розділ, напр.: Жіноча білизна" aria-label="Новий розділ" maxlength="60"><button class="btn" type="button" id="ss-add">Додати</button></div>
      <div class="form-error" id="ss-err" hidden></div></form>`,
    foot: '<div class="modal-f"><button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="submit" form="ss-form">Зберегти</button></div>',
    onMount: m => {
      draw(m);
      const sync = () => m.querySelectorAll('[data-ss-name]').forEach(inp => { rows[+inp.dataset.ssName].name = inp.value; });
      const add = () => { const inp = m.querySelector('#ss-new'); const name = inp.value.trim(); if (!name) { inp.focus(); return; } sync(); rows.push({ id: null, name }); inp.value = ''; draw(m); inp.focus(); };
      m.querySelector('#ss-add').onclick = add;
      m.querySelector('#ss-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      m.querySelector('#ss-rows').addEventListener('click', e => {
        const b = e.target.closest('[data-ss-up],[data-ss-down],[data-ss-del]'); if (!b) return; sync();
        if (b.dataset.ssDel !== undefined) rows.splice(+b.dataset.ssDel, 1);
        else { const i = +(b.dataset.ssUp ?? b.dataset.ssDown), j = b.dataset.ssUp !== undefined ? i - 1 : i + 1; [rows[i], rows[j]] = [rows[j], rows[i]]; }
        draw(m);
      });
      m.querySelector('#ss-form').addEventListener('submit', async e => {
        e.preventDefault(); sync();
        const pend = m.querySelector('#ss-new').value.trim(); if (pend) rows.push({ id: null, name: pend });
        const cur = Repo.get('suppliers', id); if (!cur) return closeModal();
        const plan = planSections(sectionsOf(cur), rows);
        const err = m.querySelector('#ss-err');
        if (!plan.ok) { err.hidden = false; err.textContent = plan.errors.join(' '); if (pend) rows.pop(); return; }
        const moved = plan.removed.reduce((a, x) => a + count(x.id), 0);
        if (plan.removed.length) {
          const ok = await confirmDialog({ title: plan.removed.length === 1 ? 'Видалити розділ?' : 'Видалити розділи?',
            text: `<p style="margin:0">${plan.removed.map(x => `«${esc(x.name)}»`).join(', ')} буде видалено.${moved ? ` ${n3(moved)} перейдуть у «Без розділу». Самі товари й історія закупівель не зміняться.` : ''}</p>` });
          if (!ok) { manageSections(id); return; }
        } else closeModal();
        await Repo.setSupplierSections(id, plan.sections);
        toast('Розділи збережено');
      });
    },
  });
}

/** Перенесення вибраних товарів постачальника в інший розділ. */
export function moveProducts(id, only) {
  const s = Repo.get('suppliers', id); if (!s) return;
  const key = currentKey(s);
  const all = D().products.filter(p => p.supplierId === id).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const scope = only ? all.filter(p => only.includes(p.id)) : filterBySection(all, s, key, UI.f.supSecFor === id ? UI.f.supProdQ : '');
  const list = scope.length ? scope : all;
  const opts = [['', 'Без розділу'], ...sectionsOf(s).map(x => [x.id, x.name])];
  openModal({
    title: 'Перенести товари',
    body: `<form class="modal-b" id="mv-form" novalidate>
      ${sectionsOf(s).length ? '' : '<div class="callout">У постачальника ще немає розділів. Спершу створіть їх кнопкою «Розділи».</div>'}
      <label class="field"><span class="lbl">Перенести в розділ</span><select class="input" name="to" id="mv-to">${opts.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('')}</select></label>
      <div class="row mv-head"><label class="check"><input type="checkbox" id="mv-all"> Вибрати всі (${list.length})</label><span class="small muted" id="mv-n">Вибрано: 0</span></div>
      <div class="list mv-list">${list.map(p => { const sid = sectionIdOf(p, s); return `<label class="li mv-row"><input type="checkbox" value="${esc(p.id)}" data-mv><span class="t"><span class="nm">${esc(p.name)}</span><span class="small muted">${esc(sid ? sectionsOf(s).find(x => x.id === sid).name : 'Без розділу')}${p.sku ? ' · арт. ' + esc(p.sku) : ''}</span></span></label>`; }).join('')}</div>
      <div class="form-error" id="mv-err" hidden></div></form>`,
    foot: '<div class="modal-f"><button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="submit" form="mv-form">Перенести</button></div>',
    onMount: m => {
      const boxes = [...m.querySelectorAll('[data-mv]')], all2 = m.querySelector('#mv-all');
      const upd = () => { const n = boxes.filter(b => b.checked).length; m.querySelector('#mv-n').textContent = `Вибрано: ${n}`; all2.checked = n === boxes.length && n > 0; all2.indeterminate = n > 0 && n < boxes.length; };
      all2.onchange = () => { boxes.forEach(b => { b.checked = all2.checked; }); upd(); };
      boxes.forEach(b => b.addEventListener('change', upd));
      if (only) { boxes.forEach(b => { b.checked = true; }); } upd();
      m.querySelector('#mv-form').addEventListener('submit', async e => {
        e.preventDefault();
        const ids = boxes.filter(b => b.checked).map(b => b.value), to = m.querySelector('#mv-to').value || null;
        if (!ids.length) { const err = m.querySelector('#mv-err'); err.hidden = false; err.textContent = 'Виберіть хоча б один товар.'; return; }
        const cur = Repo.get('suppliers', id);
        if (to && !sectionsOf(cur).some(x => x.id === to)) { toast('Розділ уже видалено', 'error'); return closeModal(); }
        const prev = D().products.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, fields: { supplierSectionId: p.supplierSectionId || null } }));
        closeModal();
        await Repo.updateMany('products', ids.map(pid => ({ id: pid, fields: { supplierSectionId: to } })));
        toast(`${n3(ids.length)} перенесено в «${to ? sectionsOf(cur).find(x => x.id === to).name : 'Без розділу'}»`, null, async () => { await Repo.updateMany('products', prev); toast('Повернуто як було'); });
      });
    },
  });
}

export const SUPSEC_ACTIONS = {
  'sup-sec': el => { if (UI.f.supSecFor !== el.dataset.id) UI.f.supProdQ = ''; UI.f.supSecFor = el.dataset.id; UI.f.supSec = el.dataset.v; },
  'sup-sec-manage': el => manageSections(el.dataset.id),
  'sup-sec-move': el => moveProducts(el.dataset.id),
};
