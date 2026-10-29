import { Calc } from '../core/calc.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { freeExpensesForPurchase, purchaseAmount, purchaseLink } from '../core/opening.js';
import { planRegroup, sectionsToText, textToSections } from '../core/sections.js';
import { SEC_ALL, SEC_NONE, filterBySection, sectionCounts, sectionIdOf, sectionsOf } from '../core/supplierSections.js';
import { assertStock, countsInStock, planReceipt, stockRows, variantLabel } from '../core/stock.js';
import { once, syncExpensePlanned } from './budgetSync.js';
import { REPEATS, SNOOZE_OPTIONS, completeChanges, snoozeChanges } from '../core/reminders.js';
import { discText, esc, fmtDate, fmtKyiv, fmtMoney, fmtNum, fmtPct, isNum, parseNum, plural, signedMoney, signedPct, splitList, todayISO, uid, uniq } from '../core/utils.js';
import { ACTIONS } from './events.js';
import { F, closeModal, confirmDialog, dateField, formModal, g, moneyField, openModal, supplierOptions } from './modal.js';
import { LOCAL_BYTES, MAX_PHOTOS, dataBytes, deletePhotos, hydratePhotos, photoImg, savePhoto } from './photos.js';
import { D, UI, ext, supplierName, toast } from './shared.js';
import { render, svg } from './shell.js';
import { addToCart, cartControl, stepCart } from './views/cart.js';
import { unitShort, unitWord } from '../core/cart.js';
import { bindSupplier, stockDetails, supLinks } from './views/stock.js';

/* --- постачальник --- */
export function supplierForm(id) {
  const s = id ? Repo.get('suppliers', id) : null; const v = s || { status: 'interested', checkedAt: todayISO(), categories: [] };
  const secNames = D().settings.sections.map(x => x.name);
  const other = (v.categories || []).filter(c => !secNames.includes(c));
  formModal({
    title: s ? 'Редагувати постачальника' : 'Новий постачальник',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true })}
      <div class="field full"><span class="lbl">Розділи</span><div class="seg multi">${secNames.map(c => `<label><input type="checkbox" name="sec" value="${esc(c)}" ${(v.categories || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></div>
      ${F.text('categories', 'Інші категорії', other.join(', '), { full: true, hint: 'Необов’язково, через кому. Розділи можна змінити на сторінці «Товари та ціни».' })}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.SUPPLIER_STATUSES))}
      ${F.date('checkedAt', 'Дата останньої перевірки інформації', v.checkedAt)}
      ${F.text('instagram', 'Instagram', v.instagram, { ph: '@назва або посилання' })}
      ${F.text('website', 'Сайт', v.website, { ph: 'example.com' })}
      ${F.text('phone', 'Телефон', v.phone, { type: 'tel' })}
      ${F.text('messenger', 'Telegram / Viber', v.messenger, { ph: '@нік або номер' })}
      ${F.text('contactPerson', 'Контактна особа', v.contactPerson)}
      ${F.text('city', 'Місто', v.city)}
      ${F.text('minOrder', 'Мінімальне замовлення', v.minOrder, { ph: 'Напр.: від 3000 ₴ або 10 пар', full: true, hint: 'Довільний опис. Щоб кошик показував прогрес, заповніть числа нижче.' })}
      ${F.money('minOrderSum', 'Мін. сума замовлення, ₴', v.minOrderSum, { ph: 'Напр.: 3000' })}
      <div class="field"><span class="lbl">Мін. кількість</span><div class="row min-qty"><input class="input" id="fld-minOrderQty" name="minOrderQty" inputmode="numeric" value="${isNum(v.minOrderQty) ? v.minOrderQty : ''}" placeholder="Напр.: 150" aria-label="Мінімальна кількість"><select class="input" name="minOrderUnit" aria-label="Одиниця мінімальної кількості">${[['pair', 'пар'], ['pcs', 'шт'], ['pack', 'упаковок']].map(([k, t]) => `<option value="${k}" ${(v.minOrderUnit || 'pair') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      ${F.area('paymentTerms', 'Умови оплати', v.paymentTerms, { rows: 2, full: false })}
      ${F.area('deliveryTerms', 'Умови доставки', v.deliveryTerms, { rows: 2, full: false })}
      ${F.area('defectTerms', 'Обмін браку', v.defectTerms, { rows: 2 })}
      ${F.area('notes', 'Нотатки', v.notes)}`,
    read: fd => { const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const minOrderSum = moneyField(fd, 'minOrderSum', errors);
      let minOrderQty = parseNum(fd.get('minOrderQty')); if (minOrderQty !== null && (!Number.isInteger(minOrderQty) || minOrderQty <= 0)) { errors.minOrderQty = 'Ціле число більше нуля.'; minOrderQty = null; }
      return { errors, values: { minOrderSum, minOrderQty, minOrderUnit: ['pcs', 'pair', 'pack'].includes(fd.get('minOrderUnit')) ? fd.get('minOrderUnit') : 'pair', name: g(fd, 'name'), categories: uniq([...fd.getAll('sec'), ...splitList(fd.get('categories'))]), status: g(fd, 'status'), checkedAt: dateField(fd, 'checkedAt', errors), instagram: g(fd, 'instagram'), website: g(fd, 'website'), phone: g(fd, 'phone'), messenger: g(fd, 'messenger'), contactPerson: g(fd, 'contactPerson'), city: g(fd, 'city'), minOrder: g(fd, 'minOrder'), paymentTerms: g(fd, 'paymentTerms'), deliveryTerms: g(fd, 'deliveryTerms'), defectTerms: g(fd, 'defectTerms'), notes: g(fd, 'notes') } }; },
    onDelete: s ? () => deleteSupplier(s.id) : null,
    save: async vals => { if (s) { await Repo.update('suppliers', s.id, vals); toast('Постачальника збережено'); } else { const r = await Repo.create('suppliers', vals); toast('Постачальника додано'); UI.page = 'suppliers'; UI.supplierId = r.id; UI.keepScroll = false; render(); } },
  });
}
export async function deleteSupplier(id) {
  const s = Repo.get('suppliers', id); if (!s) return;
  const { products, notes, purchases } = Repo.linkedToSupplier(id);
  const linked = products.length || notes.length || purchases.length
    ? `<div class="callout warn">З постачальником пов’язано: ${products.length} ${plural(products.length, 'товар', 'товари', 'товарів')}, ${notes.length} ${plural(notes.length, 'нотатка', 'нотатки', 'нотаток')} і ${purchases.length} ${plural(purchases.length, 'закупівля', 'закупівлі', 'закупівель')}. Вони <b>не будуть видалені</b>: залишаться у своїх розділах з позначкою «без постачальника».</div>` : '';
  if (await confirmDialog({ title: 'Видалити постачальника?', text: `<p style="margin:0">«${esc(s.name)}» буде видалено. Цю дію не можна скасувати, якщо немає резервної копії.</p>${linked}` })) {
    await Repo.removeSupplier(id); UI.supplierId = null; toast('Постачальника видалено');
  }
}

/* --- розділи товарів --- */
export function sectionsForm() {
  const cur = D().settings.sections;
  formModal({
    title: 'Розділи товарів',
    fields: `${F.area('sections', 'Розділи й підрозділи', sectionsToText(cur), { rows: 10, hint: 'Кожен розділ з нового рядка. Підрозділи — після двокрапки, через кому. Наприклад: «Шкарпетки: Махрові, Стрейч, Без резинки».' })}
      <p class="small muted full" style="margin:0">Товари не видаляються: якщо прибрати розділ, його товари лишаться й показуватимуться окремою групою.</p>`,
    read: fd => { const list = textToSections(fd.get('sections')); return list.length ? { errors: {}, values: list } : { errors: { sections: 'Додайте хоча б один розділ.' } }; },
    save: async list => {
      // Перейменування розділу в тому самому рядку переносить і його товари та постачальників
      const renames = new Map();
      cur.forEach((s, i) => { const n = list[i]; if (n && n.name !== s.name && !cur.some(x => x.name === n.name) && !list.some(x => x.name === s.name)) renames.set(s.name, n.name); });
      await Repo.setSettings({ sections: list });
      if (renames.size) {
        await Repo.updateMany('products', D().products.filter(p => renames.has(p.category)).map(p => ({ id: p.id, fields: { category: renames.get(p.category) } })));
        await Repo.updateMany('suppliers', D().suppliers.filter(s => s.categories.some(c => renames.has(c))).map(s => ({ id: s.id, fields: { categories: uniq(s.categories.map(c => renames.get(c) || c)) } })));
      }
      toast('Розділи збережено');
    },
  });
}
/** Автоматичне розкладання по розділах: показує точний перелік і змінює лише після підтвердження. */
export async function regroupDialog() {
  const d = D(); const plan = planRegroup(d);
  if (!plan.products.length && !plan.suppliers.length) { toast('Усе вже розкладено по розділах'); return; }
  const lbl = t => [t.category, t.subcategory].filter(Boolean).join(' › ');
  const rows = [
    ...plan.products.map(x => `<li>${esc(x.name)}: ${x.from ? `<span class="muted">${esc(x.from)}</span> → ` : ''}<b>${esc(lbl(x.to))}</b></li>`),
    ...plan.suppliers.map(x => `<li>Постачальник ${esc(x.name)}: <b>${esc(x.to.categories.join(', '))}</b></li>`),
  ];
  const ok = await confirmDialog({ title: 'Розкласти по розділах?', ok: 'Розкласти', danger: false,
    text: `<p style="margin-top:0">Розділ визначено за назвою товару чи старою категорією. Буде змінено ${rows.length} ${plural(rows.length, 'запис', 'записи', 'записів')}:</p><ul class="small" style="max-height:45vh;overflow:auto;padding-left:18px">${rows.join('')}</ul>` });
  if (!ok) return;
  const prev = { products: plan.products.map(x => ({ id: x.id, fields: { category: Repo.get('products', x.id).category, subcategory: Repo.get('products', x.id).subcategory } })),
    suppliers: plan.suppliers.map(x => ({ id: x.id, fields: { categories: Repo.get('suppliers', x.id).categories } })) };
  await Repo.updateMany('products', plan.products.map(x => ({ id: x.id, fields: x.to })));
  await Repo.updateMany('suppliers', plan.suppliers.map(x => ({ id: x.id, fields: x.to })));
  toast('Розкладено по розділах', null, async () => { await Repo.updateMany('products', prev.products); await Repo.updateMany('suppliers', prev.suppliers); toast('Повернуто як було'); });
}

/* --- товар --- */
export function productForm(id, presetSupplier, { backToView, section } = {}) {
  const p = id ? Repo.get('products', id) : null;
  const v = p || { priceType: 'unit', priceDate: todayISO(), supplierId: presetSupplier || '', supplierSectionId: section || null };
  const sections = D().settings.sections;
  const catOpts = [['', '— без розділу —'], ...sections.map(x => [x.name, x.name]), ...(v.category && !sections.some(x => x.name === v.category) ? [[v.category, v.category]] : [])];
  const subsOf = c => uniq([...(sections.find(x => x.name === c)?.subs || []), ...D().products.filter(x => x.category === c).map(x => x.subcategory).filter(Boolean)]);
  const ph = { kept: [...(p?.photos || [])], removed: [], pending: [] };
  let deleting = false;
  formModal({
    title: p ? 'Редагувати товар' : 'Новий товар',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true })}
      ${F.select('category', 'Розділ', v.category || '', catOpts)}
      ${F.text('subcategory', 'Підрозділ', v.subcategory, { list: 'sub-list', ph: 'Напр.: махрові' })}<datalist id="sub-list"></datalist>
      ${F.text('sku', 'Артикул', v.sku)}
      ${F.select('supplierId', 'Постачальник', v.supplierId || '', supplierOptions())}
      ${supSectionField(v)}
      ${F.text('url', 'Посилання на товар', v.url, { ph: 'https://…' })}
      ${F.text('sizes', 'Розміри', v.sizes, { ph: 'Напр.: 36–40, S–XL' })}
      ${F.text('colors', 'Кольори', v.colors, { ph: 'Напр.: чорний, бежевий' })}
      ${priceFields(v)}
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}
      <div class="field full"><span class="lbl">Фото</span><div class="photo-edit" id="photo-edit"></div>
        <span class="hint">До ${MAX_PHOTOS} фото. Великі знімки зменшуються автоматично.</span></div>`,
    onMount: m => {
      const form = m.querySelector('form');
      wirePhotoEditor(m.querySelector('#photo-edit'), ph);
      wireSupSection(form);
      const subList = () => { m.querySelector('#sub-list').innerHTML = subsOf(form.category.value).map(x => `<option value="${esc(x)}">`).join(''); };
      form.category.addEventListener('change', subList); subList();
      wirePriceFields(m);
    },
    read: fd => {
      const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const prices = readPrices(fd, errors);
      return { errors, values: { name: g(fd, 'name'), category: g(fd, 'category'), subcategory: g(fd, 'category') ? g(fd, 'subcategory') : '', sku: g(fd, 'sku'), supplierId: g(fd, 'supplierId') || null, supplierSectionId: readSupSection(fd), url: g(fd, 'url'), sizes: g(fd, 'sizes'), colors: g(fd, 'colors'), ...prices, comment: g(fd, 'comment') } };
    },
    onDelete: p ? () => { deleting = true; ACTIONS['del-product']({ dataset: { id: p.id } }); } : null,
    // З перегляду: і «Зберегти», і «Скасувати» повертають до (оновленого) перегляду товару.
    onClose: backToView && p ? () => { if (!deleting && Repo.get('products', p.id)) productView(p.id); } : null,
    save: async vals => {
      const id = p ? p.id : uid();
      const btn = document.querySelector('.modal-f [type=submit]'); if (btn && ph.pending.length) { btn.disabled = true; btn.textContent = 'Завантаження фото…'; }
      const added = [];
      let full = false;
      for (const f of ph.pending) {
        try {
          const x = await savePhoto(id, f.file);
          if (x.data && dataBytes([...ph.kept, ...added, x]) > LOCAL_BYTES) { full = true; continue; }
          added.push(x);
        } catch (e) { toast(e.message || 'Не вдалося додати фото', 'error'); }
      }
      if (full) toast('Без входу в обліковий запис до товару вміщається лише кілька фото. Увійдіть, щоб додати більше.', 'error');
      ph.pending.forEach(f => URL.revokeObjectURL(f.url));
      vals.photos = [...ph.kept, ...added];
      if (p) { await Repo.update('products', id, vals); toast('Товар збережено'); } else { await Repo.create('products', { ...vals, id }); toast('Товар додано'); }
      if (ph.removed.length) deletePhotos(ph.removed);
    },
  });
}
/* Розділ товару всередині постачальника: варіанти залежать від вибраного постачальника. */
const supSectionOpts = (supId, sel) => { const s = supId && Repo.get('suppliers', supId); return [['', 'Без розділу'], ...sectionsOf(s).map(x => [x.id, x.name])].map(([k, t]) => `<option value="${esc(k)}" ${k === (sel || '') ? 'selected' : ''}>${esc(t)}</option>`).join(''); };
const supSectionHint = supId => { const s = supId && Repo.get('suppliers', supId); return !s ? 'Спершу виберіть постачальника.' : sectionsOf(s).length ? `Розділи постачальника «${esc(s.name)}».` : 'У постачальника ще немає розділів: їх можна створити в його картці.'; };
function supSectionField(v) {
  const s = v.supplierId && Repo.get('suppliers', v.supplierId);
  const sel = s ? sectionIdOf({ ...v, supplierId: s.id }, s) : null;
  return `<label class="field"><span class="lbl">Розділ у постачальника</span><select class="input" id="fld-supplierSectionId" name="supplierSectionId" ${s ? '' : 'disabled'}>${supSectionOpts(v.supplierId, sel)}</select><span class="hint" id="sup-sec-hint">${supSectionHint(v.supplierId)}</span></label>`;
}
function wireSupSection(form) {
  const sup = form.supplierId, sel = form.supplierSectionId; if (!sup || !sel) return;
  sup.addEventListener('change', () => { sel.innerHTML = supSectionOpts(sup.value, ''); sel.disabled = !sup.value; form.querySelector('#sup-sec-hint').innerHTML = supSectionHint(sup.value); });
}
/** Розділ постачальника з форми: лише з розділів вибраного постачальника. */
function readSupSection(fd) {
  const supId = g(fd, 'supplierId'), id = g(fd, 'supplierSectionId'); const s = supId && Repo.get('suppliers', supId);
  return s && id && sectionsOf(s).some(x => x.id === id) ? id : null;
}
/* Фото у формі товару: показ наявних, позначка на видалення (діє після «Зберегти»), додавання нових. */
function wirePhotoEditor(box, ph) {
  const draw = () => {
    const total = ph.kept.length + ph.pending.length;
    box.innerHTML = `<div class="photo-grid">
      ${ph.kept.map((x, i) => `<div class="photo-cell">${photoImg(x, 'photo-img')}<button type="button" class="photo-x" data-ph-del="${i}" aria-label="Прибрати фото">✕</button></div>`).join('')}
      ${ph.removed.map((x, i) => `<div class="photo-cell gone">${photoImg(x, 'photo-img')}<span class="photo-note">буде видалено</span><button type="button" class="btn sm" data-ph-back="${i}">Повернути</button></div>`).join('')}
      ${ph.pending.map((f, i) => `<div class="photo-cell"><img class="photo-img" src="${f.url}" alt=""><span class="photo-note">нове</span><button type="button" class="photo-x" data-ph-drop="${i}" aria-label="Не додавати">✕</button></div>`).join('')}
      ${total < MAX_PHOTOS ? `<label class="photo-add"><input type="file" accept="image/*" multiple hidden data-ph-input><span>+ Фото</span></label>` : ''}
    </div>`;
    hydratePhotos(box);
  };
  box.addEventListener('click', e => {
    const del = e.target.closest('[data-ph-del]'), back = e.target.closest('[data-ph-back]'), drop = e.target.closest('[data-ph-drop]');
    if (del) ph.removed.push(...ph.kept.splice(+del.dataset.phDel, 1));
    else if (back) { if (ph.kept.length + ph.pending.length >= MAX_PHOTOS) return toast(`Не більше ${MAX_PHOTOS} фото`); ph.kept.push(...ph.removed.splice(+back.dataset.phBack, 1)); }
    else if (drop) { const [f] = ph.pending.splice(+drop.dataset.phDrop, 1); URL.revokeObjectURL(f.url); }
    else return;
    draw();
  });
  box.addEventListener('change', e => {
    if (!e.target.matches('[data-ph-input]')) return;
    const room = MAX_PHOTOS - ph.kept.length - ph.pending.length;
    const files = [...e.target.files].filter(f => /^image\//.test(f.type));
    if (files.length > room) toast(`Додано ${room} з ${files.length}: не більше ${MAX_PHOTOS} фото на товар`);
    files.slice(0, room).forEach(file => ph.pending.push({ file, url: URL.createObjectURL(file) }));
    draw();
  });
  draw();
}
/** Перегляд товару без полів введення. Повна форма відкривається кнопкою «Редагувати», частини — «Змінити». */
export function productView(id, start = 0) {
  const p = Repo.get('products', id); if (!p) return;
  const photos = p.photos || []; let i = Math.min(Math.max(0, start), Math.max(0, photos.length - 1));
  const none = '<span class="muted">Не задано</span>';
  const cost = Calc.unitCost(p), retail = p.retailPrice;
  const profit = Calc.diff(cost, retail), mg = Calc.margin(cost, retail), mk = Calc.markup(cost, retail);
  const tone = v => isNum(v) && v < 0 ? ' class="bad"' : '';
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const sup = p.supplierId ? Repo.get('suppliers', p.supplierId) : null;
  const stk = stockRows(D()).find(x => x.p.id === id);
  const known = new Set(['id', 'name', 'category', 'subcategory', 'sku', 'supplierId', 'supplierSectionId', 'unit', 'url', 'sizes', 'colors', 'priceType', 'purchasePrice', 'packQty', 'retailPrice', 'priceDate', 'comment', 'photos', 'createdAt', 'updatedAt', 'minStock', 'retailCostBase']);
  const extra = Object.entries(p).filter(([k, v]) => !known.has(k) && (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean'));
  const href = p.url ? (/^https?:\/\//i.test(p.url) ? p.url : 'https://' + p.url) : '';
  const gallery = photos.length ? `<div class="pv-photo"><button type="button" class="pv-main" data-pv-full aria-label="Збільшити фото">${photoImg(photos[i], 'pv-img', p.name)}</button>
      ${photos.length > 1 ? `<div class="pv-thumbs" role="group" aria-label="Інші фото">${photos.map((x, j) => `<button type="button" class="pv-thumb ${j === i ? 'on' : ''}" data-pv="${j}" aria-label="Фото ${j + 1} з ${photos.length}" aria-pressed="${j === i}">${photoImg(x, '', '')}</button>`).join('')}</div>` : ''}</div>`
    : '<div class="pv-photo pv-nophoto"><span>Фото ще немає</span></div>';
  const secH = (title, act, label) => `<div class="pv-sec-h"><h4 class="pv-sub">${title}</h4>${act ? `<button type="button" class="btn sm" ${act}>${label}</button>` : ''}</div>`;
  const calc = isNum(profit) ? `${row('Різниця / од.', `<b${tone(profit)}>${signedMoney(profit)}</b><span class="pv-hint">Роздрібна ціна мінус закупівельна ціна за одиницю, без урахування інших витрат.</span>`)}
      ${row('Маржа', isNum(mg) ? `<span${tone(profit)}>${signedPct(mg)}</span>` : '<span class="muted">Не розраховується за нульової роздрібної ціни</span>')}
      ${row('Націнка', isNum(mk) ? `<span${tone(profit)}>${signedPct(mk)}</span>` : '<span class="muted">Не розраховується за нульової закупівлі</span>')}` : '';
  const missing = !isNum(retail) ? `<div class="pv-missing"><span>Вкажіть роздрібну ціну, щоб побачити різницю та маржу</span><button type="button" class="btn sm primary" data-pv-retail>Вказати роздрібну ціну</button></div>`
    : !isNum(cost) ? `<div class="pv-missing"><span>Вкажіть закупівельну ціну, щоб побачити різницю та маржу</span><button type="button" class="btn sm primary" data-pv-prices>Вказати закупівлю</button></div>` : '';
  const body = `<div class="modal-b product-view">${gallery}<div class="pv-info">
    <h3 class="pv-name">${esc(p.name)}</h3>
    <section class="pv-sec" aria-label="Характеристики">${secH('Характеристики', 'data-pv-specs', 'Змінити')}
    <dl class="kv pv-kv">
      ${row('Артикул', p.sku ? esc(p.sku) : none)}
      ${row('Розділ', p.category ? esc(p.category) : none)}
      ${p.category ? row('Підрозділ', p.subcategory ? esc(p.subcategory) : none) : ''}
      ${row('Розміри', p.sizes ? esc(p.sizes) : none)}
      ${row('Кольори', p.colors ? esc(p.colors) : none)}
      ${row(stk.suppliers.length > 1 ? 'Постачальники' : 'Постачальник', supLinks(stk.suppliers, id))}
      ${sup ? row('Розділ у постачальника', (() => { const sid = sectionIdOf(p, sup); return sid ? esc(sectionsOf(sup).find(x => x.id === sid).name) : '<span class="muted">Без розділу</span>'; })()) : ''}
      ${extra.map(([k, v]) => row(esc(k), esc(typeof v === 'boolean' ? (v ? 'так' : 'ні') : String(v)))).join('')}
    </dl>
    ${href ? `<a class="pv-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Відкрити у постачальника ↗</a>` : ''}</section>
    <section class="pv-sec" aria-label="Наявність">${secH('Наявність', 'data-pv-stock', 'Історія')}
    <dl class="kv pv-kv">
      ${row('Залишок', `<span class="pv-stock"><b>${fmtNum(stk.qty)} ${unitWord(p.unit === 'pair' ? 'pair' : 'pcs', stk.qty)}</b>${stk.state === 'out' ? '<span class="pill stk-out">Немає в наявності</span>' : stk.state === 'low' ? '<span class="pill warn">Закінчується</span>' : ''}</span>`)}
      ${stk.variants.some(v => v.size || v.color) ? row('Розміри й кольори', `<span class="stk-vars">${stk.variants.map(v => `<span class="stk-var ${v.qty <= 0 ? 'zero' : ''}">${esc(variantLabel(v) || 'Без розміру')} <b>${fmtNum(v.qty)}</b></span>`).join('')}</span>`) : ''}
      ${stk.tracked ? row('Собівартість / од.', isNum(stk.cost) ? `${fmtMoney(stk.cost)} <span class="pv-hint">Середня в залишку, після знижки постачальника.</span>` : none) : ''}
      ${stk.s && stk.s.batches.length ? row('Партії', stk.s.batches.map(b => `${fmtDate(b.date)}: ${fmtNum(b.qty)} шт${b.supplierId && supplierName(b.supplierId) ? ' · ' + esc(supplierName(b.supplierId)) : ''}`).join('<br>')) : ''}
    </dl></section>
    <section class="pv-sec" aria-label="Ціни">${secH('Ціни', 'data-pv-prices', 'Змінити ціни')}
    <dl class="kv pv-kv">
      ${row('Одиниця', p.unit === 'pair' ? 'пара' : 'штука')}
      ${row('Ціна закупівлі', isNum(p.purchasePrice) ? `${fmtMoney(p.purchasePrice)} ${p.priceType === 'pack' ? 'за упаковку' : p.unit === 'pair' ? 'за пару' : 'за штуку'}` : none)}
      ${row('В упаковці', isNum(p.packQty) ? `${fmtNum(p.packQty)} ${unitWord(p.unit === 'pair' ? 'pair' : 'pcs', p.packQty)}` : none)}
      ${p.priceType === 'pack' ? row('Ціна одиниці', isNum(cost) ? fmtMoney(cost) : none) : ''}
      ${row('Роздрібна ціна', isNum(retail) ? fmtMoney(retail) : none)}
      ${calc}
      ${row('Ціна актуальна на', p.priceDate ? fmtDate(p.priceDate) : none)}
    </dl>${missing}</section>
  </div>
  <section class="pv-comment" aria-label="Коментар"><h4 class="pv-sub">Коментар</h4>${p.comment ? `<p class="pre">${esc(p.comment)}</p>` : '<p class="muted">Коментаря ще немає.</p>'}</section>
  <p class="small muted pv-upd">Оновлено ${fmtDate(p.updatedAt, true)}</p></div>`;
  const back = () => productView(id, i);
  openModal({ title: 'Товар', wide: true, body, foot: `<div class="modal-f"><span class="pv-cart">${cartControl(p, 'pv')}</span><button class="btn" type="button" data-close>Закрити</button><button class="btn primary" type="button" data-pv-edit>${svg('note')}Редагувати</button></div>`,
    onMount: m => {
      hydratePhotos(m);
      m.addEventListener('click', e => {
        const t = e.target.closest('[data-pv]'); let t2;
        if (t) { i = +t.dataset.pv; m.querySelector('.pv-main').innerHTML = photoImg(photos[i], 'pv-img', p.name); m.querySelectorAll('[data-pv]').forEach(b => { const on = +b.dataset.pv === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); hydratePhotos(m); return; }
        if (e.target.closest('[data-pv-full]')) openGallery(p, i, back);
        else if ((t2 = e.target.closest('[data-act="open-supplier"]'))) { closeModal(); ACTIONS['open-supplier']({ dataset: { id: t2.dataset.id } }); }
        else if (e.target.closest('[data-act="stock-bind-sup"]')) bindSupplier(id, back);
        else if (e.target.closest('[data-pv-stock]')) stockDetails(id);
        else if (e.target.closest('[data-pv-edit]')) productForm(id, null, { backToView: true });
        else if (e.target.closest('[data-pv-specs]')) productSpecsForm(id, back);
        else if (e.target.closest('[data-pv-prices]')) productPricesForm(id, back);
        else if (e.target.closest('[data-pv-retail]')) quickRetail(id, back);
        else if ((t2 = e.target.closest('[data-pv-cart]'))) {
          const a = t2.dataset.pvCart; if (t2.getAttribute('aria-disabled') === 'true') return;
          (a === 'cart-add' ? addToCart(id) : stepCart(t2.dataset.id, a === 'cart-inc' ? 1 : -1)).then(() => { const box = m.querySelector('.pv-cart'); const p2 = Repo.get('products', id); if (box && p2) { box.innerHTML = cartControl(p2, 'pv'); box.querySelector('button')?.focus(); } });
        }
      });
    } });
}
/** Зміна товару з перевіркою, що її справді записано (у хмарі зміни лишаються на пристрої й надсилаються повторно). */
async function saveProduct(id, vals) {
  await Repo.update('products', id, vals);
  if (!Repo.status.cloud && Repo.status.lastError) throw new Error('браузер не зміг записати дані');
}
/** Повернення до перегляду після часткового редагування, якщо товар ще існує. */
const backTo = (id, back) => (back ? () => { if (Repo.get('products', id)) back(); } : null);
/** «Змінити» біля характеристик: артикул, розділ, підрозділ, розміри, кольори. */
export function productSpecsForm(id, back) {
  const p = Repo.get('products', id); if (!p) return;
  const sections = D().settings.sections;
  const catOpts = [['', '— без розділу —'], ...sections.map(x => [x.name, x.name]), ...(p.category && !sections.some(x => x.name === p.category) ? [[p.category, p.category]] : [])];
  const subsOf = c => uniq([...(sections.find(x => x.name === c)?.subs || []), ...D().products.filter(x => x.category === c).map(x => x.subcategory).filter(Boolean)]);
  formModal({
    title: 'Характеристики',
    fields: `<p class="full pv-ctx"><b>${esc(p.name)}</b></p>
      ${F.text('sku', 'Артикул', p.sku)}
      ${F.select('category', 'Розділ', p.category || '', catOpts)}
      ${F.text('subcategory', 'Підрозділ', p.subcategory, { list: 'sub-list', ph: 'Напр.: махрові' })}<datalist id="sub-list"></datalist>
      ${p.supplierId && Repo.get('suppliers', p.supplierId) ? `<label class="field"><span class="lbl">Розділ у постачальника</span><select class="input" name="supplierSectionId">${supSectionOpts(p.supplierId, sectionIdOf(p, Repo.get('suppliers', p.supplierId)))}</select><span class="hint">${supSectionHint(p.supplierId)}</span></label>` : ''}
      ${F.text('sizes', 'Розміри', p.sizes, { ph: 'Напр.: 36–40, S–XL' })}
      ${F.text('colors', 'Кольори', p.colors, { ph: 'Напр.: чорний, бежевий', full: true })}`,
    onMount: m => { const form = m.querySelector('form'); const subList = () => { m.querySelector('#sub-list').innerHTML = subsOf(form.category.value).map(x => `<option value="${esc(x)}">`).join(''); }; form.category.addEventListener('change', subList); subList(); },
    read: fd => { fd.set('supplierId', p.supplierId || ''); return { errors: {}, values: { sku: g(fd, 'sku'), category: g(fd, 'category'), subcategory: g(fd, 'category') ? g(fd, 'subcategory') : '', ...(p.supplierId ? { supplierSectionId: readSupSection(fd) } : {}), sizes: g(fd, 'sizes'), colors: g(fd, 'colors') } }; },
    onClose: backTo(id, back),
    save: async vals => { await saveProduct(id, vals); toast('Характеристики збережено'); },
  });
}
/* Ціни у формі: перемикач одиниця/упаковка і попередній розрахунок. */
function priceFields(v) {
  return `${F.select('unit', 'Одиниця товару', v.unit === 'pair' ? 'pair' : 'pcs', [['pcs', 'штука'], ['pair', 'пара']], { hint: 'У ній рахуються кількість і ціна за одиницю.' })}
      <div class="field"><span class="lbl">Ціна закупівлі вказана</span><div class="seg" role="radiogroup"><label><input type="radio" name="priceType" value="unit" ${v.priceType !== 'pack' ? 'checked' : ''}>за одиницю</label><label><input type="radio" name="priceType" value="pack" ${v.priceType === 'pack' ? 'checked' : ''}>за упаковку</label></div></div>
      ${F.money('packQty', 'Кількість одиниць в упаковці', isNum(v.packQty) ? v.packQty : v.priceType === 'pack' ? '' : 1, { req: true, hint: '<span id="pack-hint">Ціле число від 1. Напр.: упаковка трусів — 6 шт, шкарпеток — 12 пар.</span>' })}
      ${F.money('purchasePrice', `Ціна закупівлі <span id="price-for">${v.priceType === 'pack' ? 'за упаковку' : 'за одиницю'}</span>, ₴`, v.purchasePrice, { req: true })}
      ${F.money('retailPrice', 'Планова роздрібна ціна за одиницю, ₴', v.retailPrice)}
      ${F.date('priceDate', 'Ціна актуальна на', v.priceDate)}
      <div class="full calc-preview" id="calc-preview"></div>`;
}
function wirePriceFields(m) {
  const form = m.querySelector('form');
  const upd = () => {
    const type = form.querySelector('[name=priceType]:checked').value;
    const unit = form.unit.value === 'pair' ? 'pair' : 'pcs', n = parseNum(form.packQty.value);
    m.querySelector('#price-for').textContent = type === 'pack' ? 'за упаковку' : unit === 'pair' ? 'за пару' : 'за штуку';
    m.querySelector('#pack-hint').textContent = isNum(n) && Number.isInteger(n) && n >= 1 ? `В упаковці: ${fmtNum(n)} ${unitWord(unit, n)}.${type === 'pack' && n > 1 ? ` Ціна однієї ${unit === 'pair' ? 'пари' : 'штуки'} рахується автоматично.` : ''}` : 'Ціле число від 1. Напр.: упаковка трусів — 6 шт, шкарпеток — 12 пар.';
    const tmp = { priceType: type, purchasePrice: parseNum(form.purchasePrice.value), packQty: n };
    const c = Calc.unitCost(tmp), r = parseNum(form.retailPrice.value);
    m.querySelector('#calc-preview').innerHTML = `<div><span>Ціна ${unit === 'pair' ? 'пари' : 'одиниці'}</span><b>${fmtMoney(c)}</b></div><div><span>Різниця / од.</span><b>${isNum(Calc.diff(c, r)) ? signedMoney(Calc.diff(c, r)) : '—'}</b></div><div><span>Націнка</span><b>${fmtPct(Calc.markup(c, r))}</b></div><div><span>Маржа</span><b>${fmtPct(Calc.margin(c, r))}</b></div>`;
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
}
function readPrices(fd, errors) {
  const type = fd.get('priceType') === 'pack' ? 'pack' : 'unit';
  const purchasePrice = moneyField(fd, 'purchasePrice', errors, { required: true });
  let packQty = parseNum(fd.get('packQty'));
  if (packQty === null) packQty = 1;
  else if (Number.isNaN(packQty) || !Number.isInteger(packQty) || packQty < 1) { errors.packQty = 'Ціле число від 1, наприклад 6 або 12.'; packQty = null; }
  const retailPrice = moneyField(fd, 'retailPrice', errors);
  return { unit: fd.get('unit') === 'pair' ? 'pair' : 'pcs', priceType: type, purchasePrice, packQty, retailPrice, priceDate: dateField(fd, 'priceDate', errors) };
}
/** «Змінити ціни»: закупівля (за одиницю чи упаковку), роздріб і дата ціни. Різниця, маржа й націнка рахуються самі. */
export function productPricesForm(id, back) {
  const p = Repo.get('products', id); if (!p) return;
  formModal({
    title: 'Ціни товару',
    fields: `<p class="full pv-ctx"><b>${esc(p.name)}</b></p>${priceFields(p)}`,
    onMount: wirePriceFields,
    read: fd => { const errors = {}; const values = readPrices(fd, errors); return { errors, values }; },
    onClose: backTo(id, back),
    save: async vals => { await saveProduct(id, vals); toast('Ціни збережено'); },
  });
}
/** Швидке введення роздрібної ціни з картки, рядка списку чи перегляду товару. */
export function quickRetail(id, back) {
  const p = Repo.get('products', id); if (!p) return;
  const cost = Calc.unitCost(p);
  openModal({ title: 'Роздрібна ціна', narrow: true, onClose: backTo(id, back),
    body: `<form class="modal-b quick-retail" id="quick-retail" novalidate>
      <div class="qr-ctx"><b>${esc(p.name)}</b><span>Закупівля за одиницю: ${isNum(cost) ? `<b>${fmtMoney(cost)}</b>` : '<span class="muted">не задано</span>'}${p.priceType === 'pack' && isNum(cost) ? ` <span class="muted">(${fmtMoney(p.purchasePrice)} за уп. ${fmtNum(p.packQty)} ${unitShort(p.unit)})</span>` : ''}</span></div>
      <label class="field"><span class="lbl">Роздрібна ціна за одиницю, ₴</span><input class="input" name="retail" inputmode="decimal" autocomplete="off" value="${isNum(p.retailPrice) ? String(p.retailPrice).replace('.', ',') : ''}" placeholder="Напр.: 249" aria-describedby="qr-msg"></label>
      <div class="qr-msg" id="qr-msg" aria-live="polite"></div>
    </form>`,
    foot: `<div class="modal-f"><button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="submit" form="quick-retail">Зберегти</button></div>`,
    onMount: m => {
      const form = m.querySelector('form'), inp = form.retail, msg = m.querySelector('#qr-msg'), btn = m.querySelector('[type=submit]');
      const show = (cls, html) => { msg.className = 'qr-msg ' + cls; msg.innerHTML = html; };
      const check = () => {
        inp.classList.remove('bad');
        const n = parseNum(inp.value);
        if (n === null || Number.isNaN(n) || n < 0) return show('', '');
        if (!isNum(cost)) return show('', '');
        const d = n - cost, mg = Calc.margin(cost, n);
        const line = `Різниця / од.: <b>${signedMoney(d)}</b>${isNum(mg) ? ` · маржа <b>${signedPct(mg)}</b>` : ''}`;
        if (d < 0) show('warn', `Роздріб нижчий за закупівлю на ${fmtMoney(-d)}. Таку ціну можна зберегти, але кожна продана одиниця буде збитковою.<br>${line}`);
        else show(d > 0 ? 'ok' : '', line);
      };
      inp.addEventListener('input', check); check();
      inp.select();
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const n = parseNum(inp.value);
        const err = n === null ? 'Поле порожнє. Вкажіть ціну числом (0 теж можна) або натисніть «Скасувати».' : Number.isNaN(n) ? 'Введіть число, наприклад 249 або 249,50.' : n < 0 ? 'Ціна не може бути від’ємною.' : '';
        if (err) { inp.classList.add('bad'); show('bad', err); inp.focus(); return; }
        btn.disabled = true; btn.textContent = 'Збереження…';
        try {
          await saveProduct(id, { retailPrice: n });
          toast('Роздрібну ціну збережено'); closeModal();
        } catch (ex) {
          btn.disabled = false; btn.textContent = 'Зберегти';
          show('bad', `Не вдалося зберегти ціну${ex?.message ? `: ${esc(ex.message)}` : ''}. Введене значення залишилось, спробуйте ще раз.`);
        }
      });
    } });
}
/** Перегляд фото товару на весь екран. */
export function openGallery(product, start = 0, onClose) {
  const list = product.photos || []; if (!list.length) return;
  let i = Math.min(Math.max(0, start), list.length - 1);
  openModal({ title: product.name || 'Фото', wide: true, onClose, body: '<div class="modal-b gallery"></div>', onMount: m => {
    const box = m.querySelector('.gallery');
    const draw = () => {
      box.innerHTML = `<div class="gallery-main">${photoImg(list[i], 'gallery-img', product.name)}</div>
        ${list.length > 1 ? `<div class="gallery-nav"><button class="btn sm" data-g="-1" aria-label="Попереднє фото">‹</button><span class="small muted">${i + 1} з ${list.length}</span><button class="btn sm" data-g="1" aria-label="Наступне фото">›</button></div>` : ''}`;
      hydratePhotos(box);
    };
    box.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) { i = (i + Number(b.dataset.g) + list.length) % list.length; draw(); } });
    draw();
  } });
}

/* --- нотатка --- */
export function noteForm(id, presetSupplier) {
  const n = id ? Repo.get('notes', id) : null; const v = n || { supplierId: presetSupplier || '', tags: [] };
  formModal({
    title: n ? 'Нотатка' : 'Нова нотатка',
    fields: `${F.text('title', 'Заголовок', v.title, { full: true })}
      ${F.area('body', 'Текст', v.body, { rows: 7 })}
      ${F.text('tags', 'Теги', (v.tags || []).join(', '), { hint: 'Через кому: оренда, ідеї, вітрина' })}
      ${F.select('supplierId', 'Постачальник (необов’язково)', v.supplierId || '', supplierOptions())}
      <label class="check full"><input type="checkbox" name="pinned" ${v.pinned ? 'checked' : ''}> Закріпити як важливу</label>
      ${n ? `<p class="small muted full" style="margin:0">Створено ${fmtDate(n.createdAt, true)} · змінено ${fmtDate(n.updatedAt, true)}</p>` : ''}`,
    read: fd => { const errors = {}; if (!g(fd, 'title') && !g(fd, 'body')) errors.title = 'Напишіть заголовок або текст.';
      return { errors, values: { title: g(fd, 'title'), body: String(fd.get('body') || '').trim(), tags: uniq(splitList(fd.get('tags')).map(t => t.replace(/^#/, ''))), supplierId: g(fd, 'supplierId') || null, pinned: fd.get('pinned') === 'on' } }; },
    onDelete: n ? () => ACTIONS['del-note']({ dataset: { id: n.id } }) : null,
    save: async vals => { if (n) { await Repo.update('notes', n.id, vals); toast('Нотатку збережено'); } else { await Repo.create('notes', vals); toast('Нотатку додано'); } },
  });
}

/* --- завдання --- */
export function taskForm(id, preset = {}) {
  const t = id ? Repo.get('tasks', id) : null; const v = t || { priority: 'medium', status: 'planned', checklist: [], ...preset };
  const clRow = i => `<div class="r" data-cl="${esc(i.id)}"><input type="checkbox" aria-label="Виконано" ${i.done ? 'checked' : ''} data-cl-done><input class="input" value="${esc(i.text)}" placeholder="Пункт чекліста" data-cl-text aria-label="Пункт чекліста"><button type="button" class="btn sm ghost" data-cl-del aria-label="Видалити пункт">✕</button></div>`;
  formModal({
    title: t ? 'Редагувати завдання' : 'Нове завдання',
    fields: `${F.text('title', 'Завдання', v.title, { req: true, full: true })}
      ${F.date('deadline', 'Дедлайн', v.deadline)}
      ${F.select('priority', 'Пріоритет', v.priority, Object.entries(Schema.PRIORITIES))}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.TASK_STATUSES), { full: true })}
      <label class="field full check-field"><span><input type="checkbox" name="prep" ${v.prep ? 'checked' : ''}> Завдання підготовки до відкриття</span><span class="hint">За такими завданнями рахується прогрес підготовки на головній.</span></label>
      ${F.area('description', 'Опис', v.description, { rows: 2 })}
      <div class="field full"><span class="lbl">Чекліст</span><div class="cl-edit" id="cl-edit">${v.checklist.map(clRow).join('')}</div><div><button type="button" class="btn sm" id="cl-add">+ Додати пункт</button></div></div>`,
    onMount: m => {
      const box = m.querySelector('#cl-edit');
      m.querySelector('#cl-add').onclick = () => { box.insertAdjacentHTML('beforeend', clRow({ id: uid(), text: '', done: false })); box.lastElementChild.querySelector('[data-cl-text]').focus(); };
      box.addEventListener('click', e => { const b = e.target.closest('[data-cl-del]'); if (b) b.closest('[data-cl]').remove(); });
      box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-cl-text]')) { e.preventDefault(); m.querySelector('#cl-add').click(); } });
    },
    read: (fd, form) => { const errors = {}; if (!g(fd, 'title')) errors.title = 'Опишіть завдання.';
      const checklist = [...form.querySelectorAll('[data-cl]')].map(r => ({ id: r.dataset.cl, text: r.querySelector('[data-cl-text]').value.trim(), done: r.querySelector('[data-cl-done]').checked })).filter(i => i.text);
      return { errors, values: { title: g(fd, 'title'), deadline: dateField(fd, 'deadline', errors), priority: g(fd, 'priority'), status: g(fd, 'status'), prep: fd.get('prep') === 'on', description: g(fd, 'description'), checklist } }; },
    onDelete: t ? () => ACTIONS['del-task']({ dataset: { id: t.id } }) : null,
    save: async vals => { if (t) { await Repo.update('tasks', t.id, vals); toast('Завдання збережено'); } else { await Repo.create('tasks', vals); toast('Завдання додано'); } },
  });
}

/* --- витрата --- */
export function expenseForm(id) {
  const e = id ? Repo.get('expenses', id) : null; const v = e || { categoryId: 'rent' };
  formModal({
    title: e ? 'Редагувати витрату' : 'Нова витрата',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true, ph: 'Напр.: Стелажі для шкарпеток' })}
      ${F.select('categoryId', 'Стаття витрат', v.categoryId, D().settings.budgetCategories.map(c => [c.id, c.name]), { full: true, hint: 'Свою категорію можна додати в розділі «Бюджет» → «Категорії витрат».' })}
      ${F.money('planned', 'Планова сума, ₴', v.planned, { hint: 'Скільки плануєте витратити.' })}
      ${F.money('paid', 'Фактично сплачено, ₴', v.paid, { hint: 'Скільки вже заплатили. Записуйте тут, а не окремою витратою.' })}
      ${F.date('dueDate', 'Сплатити до', v.dueDate, { full: true, hint: 'Необов’язково. Показується в календарі платежів.' })}
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    read: fd => { const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const planned = moneyField(fd, 'planned', errors), paid = moneyField(fd, 'paid', errors);
      if (!errors.planned && !errors.paid && planned === null && paid === null) errors.planned = 'Вкажіть планову або сплачену суму.';
      return { errors, values: { name: g(fd, 'name'), categoryId: g(fd, 'categoryId'), planned, paid, dueDate: dateField(fd, 'dueDate', errors), comment: g(fd, 'comment') } }; },
    onDelete: e ? () => ACTIONS['del-expense']({ dataset: { id: e.id } }) : null,
    save: async vals => { if (e) { await Repo.update('expenses', e.id, vals); toast('Витрату збережено'); } else { await Repo.create('expenses', vals); toast('Витрату додано'); } },
  });
}
export function budgetCatsModal() {
  const draw = () => { const d = D(); const b = Calc.budget(d);
    return `<div class="modal-b"><div class="list">${d.settings.budgetCategories.map(c => `<div class="li"><div class="t">${c.builtin ? esc(c.name) : `<input class="input" value="${esc(c.name)}" data-cat-name="${c.id}" aria-label="Назва категорії">`}<div class="small muted">${c.builtin ? 'Стандартна' : 'Власна'}${c.refundable ? ' · поворотна' : ''} · записів: ${b.byCat[c.id]?.count || 0}</div></div>${c.builtin ? '' : `<button class="btn sm danger" data-cat-del="${c.id}">Видалити</button>`}</div>`).join('')}</div>
      <form class="row" id="cat-add-form"><input class="input" style="flex:1 1 200px" id="cat-new" placeholder="Нова категорія, напр.: Каса й термінал" aria-label="Нова категорія"><button class="btn primary" type="submit">Додати</button></form><div class="err small" id="cat-err" style="color:var(--danger)"></div></div>`; };
  const mount = m => {
    m.querySelector('#cat-add-form').onsubmit = async e => { e.preventDefault(); const name = m.querySelector('#cat-new').value.trim();
      if (!name) { m.querySelector('#cat-err').textContent = 'Введіть назву категорії.'; return; }
      if (D().settings.budgetCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) { m.querySelector('#cat-err').textContent = 'Така категорія вже є.'; return; }
      await Repo.addBudgetCategory(name); toast('Категорію додано'); budgetCatsModal(); };
    m.querySelectorAll('[data-cat-name]').forEach(inp => inp.addEventListener('change', async () => { const v = inp.value.trim(); if (v) { await Repo.renameBudgetCategory(inp.dataset.catName, v); toast('Назву змінено'); } }));
    m.querySelectorAll('[data-cat-del]').forEach(btn => btn.onclick = async () => {
      const id = btn.dataset.catDel; const c = D().settings.budgetCategories.find(x => x.id === id); const cnt = Calc.budget(D()).byCat[id]?.count || 0;
      const ok = await confirmDialog({ title: 'Видалити категорію?', text: `<p style="margin:0">Категорію «${esc(c.name)}» буде видалено.${cnt ? ` ${cnt} ${plural(cnt, 'запис', 'записи', 'записів')} з неї буде перенесено в «Інше», суми не зникнуть.` : ''}</p>` });
      if (ok) { await Repo.removeBudgetCategory(id); toast('Категорію видалено'); } budgetCatsModal(); });
  };
  openModal({ title: 'Категорії витрат', body: draw(), foot: '<div class="modal-f"><button class="btn" data-close>Готово</button></div>', onMount: mount });
}

/* --- закупівля --- */
const num = v => (isNum(v) ? String(v).replace('.', ',') : '');
/** Блок підсумку закупівлі: товари, знижка, до оплати та собівартість позицій зі знижкою. */
export function purchaseSummaryHtml(p) {
  const t = Calc.purchaseLines(p);
  const cell = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
  const tiles = `<div class="calc-preview pur-sum">${cell('Сума товарів', fmtMoney(t.goods))}${cell('Знижка, %', discText(t.discountPct))}${cell('Сума знижки, грн', t.discount ? '−' + fmtMoney(t.discount) : fmtMoney(0))}${t.delivery ? cell('Доставка', fmtMoney(t.delivery)) : ''}${cell('До оплати', fmtMoney(t.total), 'pay')}</div>`;
  const note = `<p class="small muted pur-sum-note">${t.discountPct ? `Товари зі знижкою: ${fmtMoney(t.items)}. ` : ''}${t.delivery ? 'Доставка додається після знижки, на неї знижка не діє. ' : ''}${t.missing.length ? `${t.missing.length} ${plural(t.missing.length, 'позиція', 'позиції', 'позицій')} без ціни або кількості не входять у суму.` : ''}</p>`;
  const withRetail = t.lines.some(l => isNum(l.retailPrice));
  if (!t.lines.length || (!t.discountPct && !withRetail)) return tiles + note;
  const rev = t.lines.reduce((a, l) => a + (l.revenue ?? 0), 0), costR = t.lines.filter(l => isNum(l.revenue)).reduce((a, l) => a + l.net, 0);
  const rows = t.lines.map(l => `<tr><td>${esc(l.name || 'Позиція')}</td><td class="num">${fmtNum(l.qty)}</td><td class="num">${fmtMoney(l.unitPrice)}</td>${t.discountPct ? `<td class="num">${fmtMoney(l.unitNet)}</td>` : ''}<td class="num">${fmtMoney(l.net)}</td><td class="num hide-m">${isNum(l.margin) ? `<span class="${l.margin < 0 ? 'bad' : ''}">${signedPct(l.margin)}</span>` : '—'}</td></tr>`).join('');
  const sumRow = `<tr class="sum"><td>Разом</td><td></td><td></td>${t.discountPct ? '<td></td>' : ''}<td class="num">${fmtMoney(t.items)}</td><td class="num hide-m">${rev > 0 ? signedPct(Calc.margin(costR, rev)) : '—'}</td></tr>`;
  return tiles + note + `<details class="pur-lines" ${t.discountPct ? 'open' : ''}><summary>Собівартість позицій${t.discountPct ? ' зі знижкою' : ''}</summary><div class="table-wrap"><table class="t"><thead><tr><th>Позиція</th><th class="num">К-сть</th><th class="num">Ціна / од.</th>${t.discountPct ? '<th class="num">Зі знижкою / од.</th>' : ''}<th class="num">Сума${t.discountPct ? ' зі знижкою' : ''}</th><th class="num hide-m">Маржа</th></tr></thead><tbody>${rows}${sumRow}</tbody></table></div>
    ${rev > 0 ? `<p class="small muted" style="margin:6px 0 0">Потенційна виручка за роздрібними цінами: ${fmtMoney(rev)}. Різниця з товарами зі знижкою: ${signedMoney(rev - costR)}${t.delivery ? `, з доставкою: ${signedMoney(rev - costR - t.delivery)}` : ''}. Знижка розподілена між позиціями пропорційно їхній вартості, початкові ціни збережено.</p>` : ''}</details>`;
}
export function purchaseForm(id, preset = {}) {
  const p = id ? Repo.get('purchases', id) : null;
  const v = p || { status: 'planned', items: [], supplierId: preset.supplierId || '', title: preset.title || '', firstPurchase: !!preset.firstPurchase, discountPct: 0 };
  const pick = { sec: SEC_ALL, q: '' };
  const supOf = () => { const id2 = document.getElementById('fld-supplierId')?.value; return id2 ? Repo.get('suppliers', id2) : null; };
  /** Варіанти товару: товари вибраного постачальника згруповано за його розділами, решта — окремою групою. */
  const prodOptions = (sel, sup) => {
    const all = [...D().products].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    const opt = x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}${x.supplierId && (!sup || x.supplierId !== sup.id) ? ' · ' + esc(Repo.get('suppliers', x.supplierId)?.name || '') : ''}</option>`;
    if (!sup) return `<option value="">— вільна позиція —</option>${all.map(opt).join('')}`;
    const own = all.filter(x => x.supplierId === sup.id), other = all.filter(x => x.supplierId !== sup.id);
    const groups = [...sectionsOf(sup).map(x => [x.name, own.filter(o => sectionIdOf(o, sup) === x.id)]), [sectionsOf(sup).length ? 'Без розділу' : sup.name, own.filter(o => !sectionIdOf(o, sup))], ['Інші постачальники', other]].filter(([, l]) => l.length);
    return `<option value="">— вільна позиція —</option>${groups.map(([name, l]) => `<optgroup label="${esc(name)}">${l.map(opt).join('')}</optgroup>`).join('')}`;
  };
  /** Як позицію показано у формі: кількість упаковок, одиниць в упаковці й ціна за упаковку чи одиницю. Старі позиції — упаковки по 1. */
  const shown = i => {
    const per = isNum(i.packQty) && i.packQty >= 1 ? i.packQty : 1, priceFor = i.priceFor === 'pack' ? 'pack' : 'unit';
    const packs = isNum(i.packs) ? i.packs : isNum(i.qty) ? Math.round(i.qty / per * 1e6) / 1e6 : null;
    const price = isNum(i.agreedPrice) && i.priceFor ? i.agreedPrice : isNum(i.unitPrice) ? (priceFor === 'pack' ? Math.round(i.unitPrice * per * 100) / 100 : i.unitPrice) : null;
    return { per, priceFor, packs, price };
  };
  const row = (i, sup) => { const s = shown(i); return `<div class="r" data-item="${esc(i.id)}"><div class="field" style="gap:4px"><select class="input" data-i-prod aria-label="Товар">${prodOptions(i.productId, sup)}</select><input class="input" data-i-name placeholder="Назва позиції" value="${esc(i.name || '')}" aria-label="Назва позиції" ${i.productId ? 'hidden' : ''}><div class="i-var"><input class="input" data-i-size placeholder="Розмір" value="${esc(i.size || '')}" aria-label="Розмір" maxlength="40"><input class="input" data-i-color placeholder="Колір" value="${esc(i.color || '')}" aria-label="Колір" maxlength="40"></div></div>
    <input class="input num" data-i-qty inputmode="decimal" placeholder="Упаковок" value="${num(s.packs)}" aria-label="Кількість упаковок"><input class="input num" data-i-pack inputmode="numeric" placeholder="В уп." value="${num(s.per)}" aria-label="Одиниць в упаковці"><div class="i-price"><input class="input num" data-i-price inputmode="decimal" placeholder="₴" value="${num(s.price)}" aria-label="Закупівельна ціна"><select class="input" data-i-for aria-label="Ціна вказана"><option value="unit" ${s.priceFor === 'unit' ? 'selected' : ''}>за од.</option><option value="pack" ${s.priceFor === 'pack' ? 'selected' : ''}>за уп.</option></select></div><input class="input num" data-i-retail inputmode="decimal" placeholder="Роздріб ₴" value="${num(i.retailPrice)}" aria-label="Роздрібна ціна за одиницю"><button type="button" class="btn sm ghost" data-i-del aria-label="Видалити позицію">✕</button><div class="i-calc small muted" data-i-calc aria-live="polite"></div></div>`; };
  /** Значення рядка позиції: упаковки × одиниць в упаковці = одиниці; ціна одиниці — з ціни упаковки, якщо так вказано. */
  const rowVals = r => {
    const productId = r.querySelector('[data-i-prod]').value || null, prod = productId && Repo.get('products', productId);
    const packs = parseNum(r.querySelector('[data-i-qty]').value), packQty = parseNum(r.querySelector('[data-i-pack]').value);
    const price = parseNum(r.querySelector('[data-i-price]').value), retail = parseNum(r.querySelector('[data-i-retail]').value), priceFor = r.querySelector('[data-i-for]').value === 'pack' ? 'pack' : 'unit';
    const perOk = packQty === null || (Number.isInteger(packQty) && packQty >= 1);
    const bad = Number.isNaN(packs) || (isNum(packs) && packs <= 0) || !perOk || Number.isNaN(price) || (isNum(price) && price < 0) || Number.isNaN(retail) || (isNum(retail) && retail < 0);
    const line = Calc.packLine({ packs: isNum(packs) ? packs : null, packQty: perOk && isNum(packQty) ? packQty : 1, price: isNum(price) ? price : null, priceFor });
    return { productId, prod, name: prod ? prod.name : r.querySelector('[data-i-name]').value.trim(), unit: prod && prod.unit === 'pair' ? 'pair' : 'pcs', packs: isNum(packs) ? packs : null, packQty: line.packQty, perOk, price: isNum(price) ? price : null, priceFor, retail: isNum(retail) ? retail : null, bad, ...line,
      size: r.querySelector('[data-i-size]').value.trim(), color: r.querySelector('[data-i-color]').value.trim() };
  };
  const itemOf = x => ({ id: x.id, productId: x.productId, name: x.name, qty: x.qty, unitPrice: x.unitPrice, retailPrice: x.retail, packs: x.packs, packQty: x.packQty, priceFor: x.priceFor, agreedPrice: x.price, unit: x.unit, size: x.size, color: x.color });
  const sup0 = v.supplierId ? Repo.get('suppliers', v.supplierId) : null;
  formModal({
    title: p ? 'Закупівля' : 'Нова закупівля', wide: true,
    fields: `${F.text('title', 'Назва', v.title, { req: true, full: true, ph: 'Напр.: Перша партія шкарпеток' })}
      ${F.select('supplierId', 'Постачальник', v.supplierId || '', supplierOptions())}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.PURCHASE_STATUSES))}
      ${F.date('expectedDate', 'Очікувана дата', v.expectedDate)}
      <div class="full pur-recv" id="pur-recv">${F.date('receivedDate', 'Дата отримання', v.receivedDate || '', { hint: 'З цієї дати товар з’являється в залишках.' })}
        ${p && p.stockMode === 'legacy' ? `<label class="check"><input type="checkbox" name="countStock"> Врахувати в залишках</label><span class="hint">Закупівлю отримано до запуску обліку, тому її товари поки не входять у залишки. Позначте, якщо цей товар ще є в наявності.</span>` : '<span class="hint">Після збереження зі статусом «Отримано» товари додадуться в «Товари в наявності». Вільні позиції стануть товарами каталогу.</span>'}</div>
      ${F.money('deliveryCost', 'Доставка, ₴', v.deliveryCost)}
      ${F.money('discountPct', 'Знижка постачальника, %', v.discountPct || 0, { hint: 'Від 0 до 100, на всю суму товарів. На доставку не діє.' })}
      <label class="check full"><input type="checkbox" name="firstPurchase" ${v.firstPurchase ? 'checked' : ''}> Перша закупівля до відкриття</label>
      <div class="full pur-pick" id="pur-pick"></div>
      <div class="field full"><span class="lbl">Позиції</span><div class="items-head buying-head"><span>Товар</span><span>Упаковок</span><span>В уп., од.</span><span>Закупівля, ₴</span><span>Роздріб, ₴ / од.</span><span></span></div><div class="items-edit buying-edit" id="items-edit">${v.items.map(i => row(i, sup0)).join('')}</div><div><button type="button" class="btn sm" id="item-add">+ Додати позицію</button></div><span class="hint">Кількість — в упаковках; одиниць (штук чи пар) рахується автоматично. Для поштучного товару в упаковці 1. Ціни й розмір упаковки підставляються з картки товару під час вибору. Їх можна змінити для цієї закупівлі; каталог не зміниться. Знижка застосовується до суми товарів, ціни позицій лишаються початковими.</span></div>
      <div class="full" id="pur-preview" aria-live="polite"></div>
      <div class="full small muted" id="pur-minorder"></div>
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    onMount: m => {
      const box = m.querySelector('#items-edit'), form = m.querySelector('form');
      const read = () => [...box.querySelectorAll('[data-item]')].map(r => itemOf({ ...rowVals(r), id: r.dataset.item }));
      /* Під кожною позицією: «2 уп. × 12 пар = 24 пари · 20 ₴ / пара · 480 ₴». */
      const calcLine = r => {
        const x = rowVals(r), el = r.querySelector('[data-i-calc]'); const uw = n => unitWord(x.unit, n);
        if (!x.perOk) { el.textContent = 'Одиниць в упаковці — ціле число від 1.'; el.classList.add('bad'); return; }
        el.classList.remove('bad');
        const parts = [];
        if (isNum(x.packs)) parts.push(x.packQty > 1 ? `${fmtNum(x.packs)} уп. × ${fmtNum(x.packQty)} ${uw(x.packQty)} = ${fmtNum(x.qty)} ${uw(x.qty)}` : `${fmtNum(x.qty)} ${uw(x.qty)}`);
        if (isNum(x.unitPrice)) parts.push(`${fmtMoney(Math.round(x.unitPrice * 100) / 100)} / ${x.unit === 'pair' ? 'пара' : 'шт'}${x.priceFor === 'pack' ? ` (упаковка ${fmtMoney(x.price)})` : ''}`);
        if (isNum(x.sum)) parts.push(`сума ${fmtMoney(x.sum)}`);
        el.textContent = parts.join(' · ');
      };
      const upd = () => {
        box.querySelectorAll('[data-item]').forEach(calcLine);
        const items = read();
        const pct = parseNum(form.discountPct.value);
        m.querySelector('#pur-preview').innerHTML = purchaseSummaryHtml({ items, deliveryCost: parseNum(form.deliveryCost.value), discountPct: isNum(pct) && pct >= 0 && pct <= 100 ? pct : 0 })
          + (isNum(pct) && pct >= 0 && pct <= 100 || form.discountPct.value.trim() === '' ? '' : '<p class="small" style="color:var(--danger);margin:4px 0 0">Знижка має бути числом від 0 до 100.</p>');
        const sup = supOf();
        m.querySelector('#pur-minorder').textContent = sup ? (sup.minOrder ? `Мінімальне замовлення в «${sup.name}»: ${sup.minOrder}.` : `Мінімальне замовлення «${sup.name}» не записане.`) + (sup.deliveryTerms ? ` Доставка: ${sup.deliveryTerms}.` : '') : '';
      };
      /* Товар з каталогу: розмір упаковки й ціна підставляються з картки (у закупівлі їх можна змінити, картка не зміниться). */
      const fill = (r, prod) => {
        r.querySelector('[data-i-name]').hidden = !!prod;
        if (!prod) return;
        r.querySelector('[data-i-name]').value = prod.name;
        const per = isNum(prod.packQty) && prod.packQty >= 1 ? prod.packQty : 1, byPack = prod.priceType === 'pack' && isNum(prod.packQty);
        r.querySelector('[data-i-pack]').value = num(per);
        r.querySelector('[data-i-for]').value = byPack ? 'pack' : 'unit';
        if (isNum(prod.purchasePrice)) r.querySelector('[data-i-price]').value = num(prod.purchasePrice);
        if (!r.querySelector('[data-i-qty]').value) r.querySelector('[data-i-qty]').value = '1';
        r.querySelector('[data-i-retail]').value = num(prod.retailPrice);
      };
      /* Вибір товарів постачальника за його розділами. */
      const drawPick = () => {
        const el = m.querySelector('#pur-pick'), sup = supOf();
        const own = sup ? D().products.filter(x => x.supplierId === sup.id).sort((a, b) => a.name.localeCompare(b.name, 'uk')) : [];
        if (!own.length) { el.innerHTML = ''; return; }
        if (pick.sec !== SEC_ALL && pick.sec !== SEC_NONE && !sectionsOf(sup).some(x => x.id === pick.sec)) pick.sec = SEC_ALL;
        const counts = sectionCounts(own, sup), list = filterBySection(own, sup, pick.sec, pick.q);
        const inPur = new Set(read().map(i => i.productId).filter(Boolean));
        const chip = (k, label) => `<button type="button" class="chip ${pick.sec === k ? 'on' : ''} ${counts[k] ? '' : 'zero'}" data-pick-sec="${esc(k)}" aria-pressed="${pick.sec === k}">${esc(label)} <span class="muted">${counts[k]}</span></button>`;
        el.innerHTML = `<details class="pick-box" ${pick.open ? 'open' : ''}><summary>Додати товари «${esc(sup.name)}»${sectionsOf(sup).length ? ' за розділами' : ''} <span class="muted small">${own.length}</span></summary>
          <div class="chips sec-chips">${chip(SEC_ALL, 'Усі товари')}${sectionsOf(sup).map(x => chip(x.id, x.name)).join('')}${counts[SEC_NONE] && sectionsOf(sup).length ? chip(SEC_NONE, 'Без розділу') : ''}</div>
          <label class="search">${svg('search')}<input class="input" data-pick-q value="${esc(pick.q)}" placeholder="${pick.sec === SEC_ALL ? 'Пошук по всіх товарах постачальника' : 'Пошук у розділі'}" aria-label="Пошук товарів постачальника"></label>
          <div class="list pick-list">${list.length ? list.map(x => { const c = Calc.unitCost(x); const on = inPur.has(x.id); return `<div class="li"><div class="t"><span class="nm">${esc(x.name)}</span><span class="small muted">${isNum(c) ? fmtMoney(c) + ' / од.' : 'ціна не задана'}${x.sku ? ' · арт. ' + esc(x.sku) : ''}</span></div><button type="button" class="btn sm ${on ? 'ghost' : ''}" data-pick-add="${x.id}">${on ? '✓ Ще раз' : '+ Додати'}</button></div>`; }).join('') : '<p class="small muted" style="margin:0">Нічого не знайдено.</p>'}</div></details>`;
      };
      const pickEl = m.querySelector('#pur-pick');
      pickEl.addEventListener('toggle', e => { if (e.target.matches('.pick-box')) pick.open = e.target.open; }, true);
      pickEl.addEventListener('click', e => {
        const sec = e.target.closest('[data-pick-sec]'), add = e.target.closest('[data-pick-add]');
        if (sec) { pick.sec = sec.dataset.pickSec; drawPick(); pickEl.querySelector(`[data-pick-sec="${CSS.escape(pick.sec)}"]`)?.focus(); }
        else if (add) {
          const prod = Repo.get('products', add.dataset.pickAdd); if (!prod) return;
          box.insertAdjacentHTML('beforeend', row({ id: uid(), productId: prod.id, qty: 1 }, supOf())); fill(box.lastElementChild, prod);
          upd(); drawPick(); toast(`Додано: ${prod.name}`);
        }
      });
      pickEl.addEventListener('input', e => { if (!e.target.matches('[data-pick-q]')) return; pick.q = e.target.value; const pos = e.target.selectionStart; drawPick(); const q = pickEl.querySelector('[data-pick-q]'); q.focus(); q.setSelectionRange(pos, pos); });
      m.querySelector('#item-add').onclick = () => { box.insertAdjacentHTML('beforeend', row({ id: uid() }, supOf())); upd(); };
      box.addEventListener('click', e => { const b = e.target.closest('[data-i-del]'); if (b) { b.closest('[data-item]').remove(); upd(); drawPick(); } });
      box.addEventListener('change', e => {
        if (!e.target.matches('[data-i-prod]')) return;
        const r = e.target.closest('[data-item]'); const prod = e.target.value && Repo.get('products', e.target.value);
        fill(r, prod);
        if (prod && !form.supplierId.value && prod.supplierId) { form.supplierId.value = prod.supplierId; form.supplierId.dispatchEvent(new Event('change', { bubbles: true })); }
        upd(); drawPick();
      });
      form.supplierId.addEventListener('change', () => {
        const sup = supOf(); pick.sec = SEC_ALL; pick.q = '';
        box.querySelectorAll('[data-i-prod]').forEach(sel => { const val = sel.value; sel.innerHTML = prodOptions(val, sup); });
        drawPick();
      });
      form.addEventListener('input', e => { if (!e.target.closest('#pur-pick')) upd(); }); form.addEventListener('change', e => { if (!e.target.closest('#pur-pick')) upd(); });
      const recv = () => { const on = form.status.value === 'received'; m.querySelector('#pur-recv').hidden = !on; if (on && !form.receivedDate.value) { form.receivedDate.value = fmtDate(todayISO()); } };
      form.status.addEventListener('change', recv); recv();
      upd(); drawPick();
    },
    read: (fd, form) => {
      const errors = {}; if (!g(fd, 'title')) errors.title = 'Вкажіть назву.';
      const items = [...form.querySelectorAll('[data-item]')].map(r => {
        const x = rowVals(r); if (x.bad) errors.items = true;
        const old = p && p.items.find(o => o.id === r.dataset.item);
        return { ...(old || {}), ...itemOf({ ...x, id: r.dataset.item }) };
      }).filter(i => i.name || i.productId);
      const pct = parseNum(g(fd, 'discountPct'));
      if (Number.isNaN(pct) || (isNum(pct) && (pct < 0 || pct > 100))) errors.discountPct = 'Від 0 до 100, наприклад 10 або 7,5.';
      const values = { title: g(fd, 'title'), supplierId: g(fd, 'supplierId') || null, status: g(fd, 'status'), firstPurchase: fd.has('firstPurchase'), expectedDate: dateField(fd, 'expectedDate', errors), deliveryCost: moneyField(fd, 'deliveryCost', errors), discountPct: isNum(pct) ? Math.round(pct * 100) / 100 : 0, items, comment: g(fd, 'comment') };
      if (values.status === 'received') values.receivedDate = dateField(fd, 'receivedDate', errors) || todayISO();
      if (p && p.stockMode === 'legacy' && fd.has('countStock')) values.stockMode = 'auto';
      if (values.status === 'received' && (!p || p.stockMode !== 'legacy' || values.stockMode === 'auto') && items.some(i => !isNum(i.qty))) errors.title = errors.title || 'Для отриманої закупівлі вкажіть кількість у кожній позиції.';
      if (errors.items) { delete errors.items; errors.title = errors.title || 'Перевірте позиції: кількість більша за нуль, одиниць в упаковці — ціле число від 1, ціна не від’ємна.'; }
      return { errors, values };
    },
    onDelete: p ? async () => {
      try { assertStock(D(), [{ collection: 'purchases', action: 'remove', id: p.id }]); } catch (ex) { toast('Не можна видалити: ' + ex.message, 'error'); return; }
      const counted = countsInStock(p);
      if (await confirmDialog({ title: 'Видалити закупівлю?', text: `<p style="margin:0">«${esc(p.title)}» буде видалено.${p.expenseId ? ' Пов’язана стаття бюджету залишиться.' : ''}${counted ? ' Її товари зникнуть із залишків.' : ''}</p>` })) { await Repo.remove('purchases', p.id); toast('Закупівлю видалено'); }
    } : null,
    save: async vals => {
      // Отримана закупівля оприбутковується: вільні позиції стають товарами, від’ємних залишків бути не може.
      const id2 = p ? p.id : uid();
      const plan = planReceipt(D(), { ...(p || {}), ...vals, id: id2 }, uid);
      const ops = [...plan.ops, p ? { collection: 'purchases', action: 'update', id: id2, fields: { ...vals, items: plan.purchase.items } } : { collection: 'purchases', action: 'create', id: id2, fields: { ...vals, items: plan.purchase.items, stockMode: 'auto' } }];
      assertStock(D(), ops);
      await Repo.commit(ops);
      toast((p ? 'Закупівлю збережено' : 'Закупівлю додано') + (plan.created.length ? `. Нові товари в каталозі: ${plan.created.length}` : ''));
      if (p) await afterPurchaseEdit(p, Repo.get('purchases', p.id));
    },
  });
}
/** Після редагування закупівлі: при скасуванні — запропонувати переглянути статтю, при зміні суми — оновити план (було → стане). */
async function afterPurchaseEdit(before, after) {
  if (!after) return;
  const st = purchaseLink(D(), after);
  if (after.status === 'cancelled' && before.status !== 'cancelled' && st.expense) {
    const e = st.expense;
    const ok = await confirmDialog({ title: 'Закупівлю скасовано', ok: 'Відкрити статтю', danger: false,
      text: `<p style="margin:0">У бюджеті залишається пов’язана стаття «${esc(e.name)}»: план ${fmtMoney(e.planned ?? 0)}, сплачено ${fmtMoney(e.paid ?? 0)}. Перегляньте її: можливо, план треба прибрати, а сплачене — повернути чи перенести.</p>` });
    if (ok) expenseForm(e.id);
    return;
  }
  if (after.status !== 'cancelled' && st.state === 'mismatch') await syncExpensePlanned(st.expense.id, st.amount, `Сума закупівлі «${after.title}» змінилась.`);
}
/** Створює одну статтю бюджету для закупівлі (категорія «Перша закупівля») і пов’язує їх. Якщо стаття вже є — нічого не створює. */
export const purchaseToBudget = once(async id => {
  const p = Repo.get('purchases', id); if (!p) return;
  const st = purchaseLink(D(), p);
  if (st.state === 'ok' || st.state === 'mismatch') { toast('Закупівля вже пов’язана зі статтею бюджету'); return; }
  const t = Calc.purchaseTotal(p);
  // стаття, створена раніше з цієї закупівлі (наприклад, на іншому пристрої), використовується повторно
  const prev = D().expenses.find(e => e.source && e.source.type === 'purchase' && e.source.id === p.id);
  const ok = await confirmDialog({ title: st.state === 'missing' ? 'Статтю бюджету видалено' : 'Внести закупівлю в бюджет?', ok: prev ? 'Прив’язати' : 'Внести', danger: false,
    text: prev ? `<p style="margin:0">У бюджеті вже є стаття «${esc(prev.name)}» (план ${fmtMoney(prev.planned ?? 0)}), створена з цієї закупівлі. Її буде прив’язано знову, нова не створюється.</p>`
      : `<p style="margin:0">Буде створено статтю «Закупівля: ${esc(p.title)}» у категорії «Перша закупівля» з плановою сумою <b>${fmtMoney(t.total)}</b> і сплаченою 0 ₴. Оплату потім позначте в бюджеті.</p>${t.missing.length ? `<div class="callout warn">${t.missing.length} позицій без ціни або кількості не входять у суму.</div>` : ''}` });
  if (!ok) return;
  const e = prev || await Repo.create('expenses', { name: 'Закупівля: ' + p.title, categoryId: 'first_stock', planned: purchaseAmount(p), paid: 0, comment: 'Створено із закупівлі', source: { type: 'purchase', id: p.id } });
  await Repo.update('purchases', p.id, { expenseId: e.id }); toast(prev ? 'Статтю прив’язано' : 'Статтю додано в бюджет');
  if (prev) { const s2 = purchaseLink(D(), Repo.get('purchases', p.id)); if (s2.state === 'mismatch') await syncExpensePlanned(prev.id, s2.amount, 'Сума закупівлі відрізняється від плану статті.'); }
});
/** Прив’язати закупівлю до наявної статті бюджету (наприклад, після видалення попередньої). */
export function purchaseRelink(id) {
  const p = Repo.get('purchases', id); if (!p) return;
  const list = freeExpensesForPurchase(D(), p.id).sort((a, b) => (a.categoryId === 'first_stock' ? 0 : 1) - (b.categoryId === 'first_stock' ? 0 : 1));
  if (!list.length) { toast('У бюджеті немає вільних статей. Створіть нову кнопкою «Внести в бюджет».'); return; }
  openModal({ title: 'Прив’язати до статті бюджету', body: `<div class="modal-b"><p class="small muted" style="margin:0">Закупівля «${esc(p.title)}» на ${fmtMoney(purchaseAmount(p))}. Статті, вже пов’язані з іншими закупівлями, не показано.</p><div class="list">${list.map(e => `<div class="li"><button class="li-btn" data-pick-exp="${e.id}"><span class="nm">${esc(e.name)}</span><div class="small muted">план ${fmtMoney(e.planned ?? 0)} · сплачено ${fmtMoney(e.paid ?? 0)}</div></button></div>`).join('')}</div></div>`,
    foot: '<div class="modal-f"><button class="btn" data-close>Скасувати</button></div>',
    onMount: m => m.querySelectorAll('[data-pick-exp]').forEach(b => b.onclick = async () => {
      closeModal(); await Repo.update('purchases', p.id, { expenseId: b.dataset.pickExp }); toast('Закупівлю прив’язано до статті');
      const st = purchaseLink(D(), Repo.get('purchases', p.id)); if (st.state === 'mismatch') await syncExpensePlanned(st.expense.id, st.amount, 'Сума закупівлі відрізняється від плану статті.');
    }) });
}
export function purchaseSync(id) {
  const p = Repo.get('purchases', id); const st = p && purchaseLink(D(), p);
  if (st && st.state === 'mismatch') syncExpensePlanned(st.expense.id, st.amount, `Сума закупівлі «${p.title}» відрізняється від плану статті.`);
}

/* --- нагадування --- */
export function reminderForm(id, preset = {}) {
  const r = id ? Repo.get('reminders', id) : null;
  const v = r || { repeat: 'none', date: todayISO(), time: '10:00', status: 'planned', link: preset.link || null, title: preset.title || '' };
  const linkOpts = [['', '— без прив’язки —'],
    ...D().tasks.filter(t => t.status !== 'done').map(t => ['task:' + t.id, 'Завдання: ' + t.title]),
    ...D().suppliers.map(s => ['supplier:' + s.id, 'Постачальник: ' + s.name]),
    ...D().purchases.filter(p => p.status !== 'received' && p.status !== 'cancelled').map(p => ['purchase:' + p.id, 'Закупівля: ' + p.title])];
  formModal({
    title: r ? 'Нагадування' : 'Нове нагадування',
    fields: `${F.text('title', 'Про що нагадати', v.title, { req: true, full: true, ph: 'Напр.: Написати постачальнику Олені' })}
      ${F.date('date', 'Дата', v.date)}
      ${F.text('time', 'Час (Київ)', v.time, { ph: 'ГГ:ХХ', mode: 'numeric', hint: 'Часовий пояс Europe/Kyiv' })}
      ${F.select('repeat', 'Повтор', v.repeat, Object.entries(REPEATS))}
      ${F.select('link', 'Прив’язати до', v.link ? v.link.type + ':' + v.link.id : '', linkOpts)}
      ${F.area('note', 'Примітка', v.note, { rows: 2 })}
      ${r && r.status !== 'planned' ? `<p class="small muted full" style="margin:0">${r.status === 'done' ? 'Виконано' : 'Відкладено до ' + fmtKyiv(r.snoozedUntil)}. Збереження з новою датою поверне нагадування в «Заплановано».</p>` : ''}`,
    onMount: m => { const t = m.querySelector('#fld-time'); t.maxLength = 5; t.addEventListener('input', e => { if (e.inputType && e.inputType.startsWith('delete')) return; const dg = t.value.replace(/\D/g, '').slice(0, 4); t.value = dg.length > 2 ? dg.slice(0, 2) + ':' + dg.slice(2) : dg; }); },
    read: fd => {
      const errors = {}; if (!g(fd, 'title')) errors.title = 'Напишіть, про що нагадати.';
      const date = dateField(fd, 'date', errors); if (!date && !errors.date) errors.date = 'Вкажіть дату.';
      let time = g(fd, 'time'); const tm = time.match(/^(\d{1,2}):?(\d{2})$/);
      if (!tm || +tm[1] > 23 || +tm[2] > 59) errors.time = 'Вкажіть час у форматі ГГ:ХХ, наприклад 10:00.'; else time = tm[1].padStart(2, '0') + ':' + tm[2];
      const lk = g(fd, 'link'); const [type, lid] = lk ? lk.split(':') : [];
      const values = { title: g(fd, 'title'), date, time, repeat: g(fd, 'repeat'), note: g(fd, 'note'), link: lk ? { type, id: lid } : null };
      if (r && (date !== r.date || time !== r.time || r.status === 'done')) Object.assign(values, { status: 'planned', snoozedUntil: null });
      return { errors, values };
    },
    onDelete: r ? async () => { if (await confirmDialog({ title: 'Видалити нагадування?', text: `<p style="margin:0">«${esc(r.title)}» буде видалено.</p>` })) { await Repo.remove('reminders', r.id); toast('Нагадування видалено'); } } : null,
    save: async vals => {
      if (r) { await Repo.update('reminders', r.id, vals); toast('Нагадування збережено'); }
      else { const c = await Repo.create('reminders', { ...vals, status: 'planned' }); toast(`Нагадування на ${fmtKyiv(c.fireAt)}`); }
    },
  });
}
export async function reminderDone(id) {
  const r = Repo.get('reminders', id); if (!r) return; const prev = { ...r };
  const ch = completeChanges(r); await Repo.update('reminders', id, ch);
  toast(ch.status === 'done' ? 'Нагадування виконано' : `Виконано. Наступне: ${fmtKyiv(Repo.get('reminders', id).fireAt)}`, null, () => Repo.restore('reminders', id, prev));
}
export function snoozeSheet(id) {
  const r = Repo.get('reminders', id); if (!r) return;
  openModal({ title: 'Відкласти нагадування', narrow: true, body: `<div class="modal-b"><p class="small muted" style="margin:0">${esc(r.title)}</p><div class="sheet-list">${Object.entries(SNOOZE_OPTIONS).map(([k, l]) => `<button class="btn" data-snooze="${k}">${l}</button>`).join('')}</div></div>`,
    onMount: m => m.querySelectorAll('[data-snooze]').forEach(b => b.onclick = async () => { closeModal(); const prev = { ...r }; await Repo.update('reminders', id, snoozeChanges(b.dataset.snooze)); toast(`Відкладено до ${fmtKyiv(Repo.get('reminders', id).fireAt)}`, null, () => Repo.restore('reminders', id, prev)); }) });
}


