import { Calc } from '../core/calc.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { REPEATS, SNOOZE_OPTIONS, completeChanges, snoozeChanges } from '../core/reminders.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, fmtNum, fmtPct, isNum, parseNum, plural, splitList, todayISO, uid, uniq } from '../core/utils.js';
import { ACTIONS } from './events.js';
import { F, closeModal, confirmDialog, dateField, formModal, g, moneyField, openModal, supplierOptions } from './modal.js';
import { D, UI, toast } from './shared.js';
import { render } from './shell.js';

/* --- постачальник --- */
export function supplierForm(id) {
  const s = id ? Repo.get('suppliers', id) : null; const v = s || { status: 'interested', checkedAt: todayISO(), categories: [] };
  const catList = uniq([...D().settings.productCategories, ...D().suppliers.flatMap(x => x.categories)]);
  formModal({
    title: s ? 'Редагувати постачальника' : 'Новий постачальник',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true })}
      ${F.text('categories', 'Категорії товарів', (v.categories || []).join(', '), { full: true, hint: 'Через кому. Наприклад: ' + catList.slice(0, 3).join(', ') })}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.SUPPLIER_STATUSES))}
      ${F.date('checkedAt', 'Дата останньої перевірки інформації', v.checkedAt)}
      ${F.text('instagram', 'Instagram', v.instagram, { ph: '@назва або посилання' })}
      ${F.text('website', 'Сайт', v.website, { ph: 'example.com' })}
      ${F.text('phone', 'Телефон', v.phone, { type: 'tel' })}
      ${F.text('messenger', 'Telegram / Viber', v.messenger, { ph: '@нік або номер' })}
      ${F.text('contactPerson', 'Контактна особа', v.contactPerson)}
      ${F.text('city', 'Місто', v.city)}
      ${F.text('minOrder', 'Мінімальне замовлення', v.minOrder, { ph: 'Напр.: від 3000 ₴ або 10 пар', full: true })}
      ${F.area('paymentTerms', 'Умови оплати', v.paymentTerms, { rows: 2, full: false })}
      ${F.area('deliveryTerms', 'Умови доставки', v.deliveryTerms, { rows: 2, full: false })}
      ${F.area('defectTerms', 'Обмін браку', v.defectTerms, { rows: 2 })}
      ${F.area('notes', 'Нотатки', v.notes)}`,
    read: fd => { const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      return { errors, values: { name: g(fd, 'name'), categories: splitList(fd.get('categories')), status: g(fd, 'status'), checkedAt: dateField(fd, 'checkedAt', errors), instagram: g(fd, 'instagram'), website: g(fd, 'website'), phone: g(fd, 'phone'), messenger: g(fd, 'messenger'), contactPerson: g(fd, 'contactPerson'), city: g(fd, 'city'), minOrder: g(fd, 'minOrder'), paymentTerms: g(fd, 'paymentTerms'), deliveryTerms: g(fd, 'deliveryTerms'), defectTerms: g(fd, 'defectTerms'), notes: g(fd, 'notes') } }; },
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

/* --- товар --- */
export function productForm(id, presetSupplier) {
  const p = id ? Repo.get('products', id) : null;
  const v = p || { priceType: 'unit', priceDate: todayISO(), supplierId: presetSupplier || '' };
  const cats = uniq([...D().settings.productCategories, ...D().products.map(x => x.category).filter(Boolean)]);
  formModal({
    title: p ? 'Редагувати товар' : 'Новий товар',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true })}
      ${F.text('category', 'Категорія', v.category, { list: 'cat-list' })}<datalist id="cat-list">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      ${F.text('sku', 'Артикул', v.sku)}
      ${F.select('supplierId', 'Постачальник', v.supplierId || '', supplierOptions())}
      ${F.text('url', 'Посилання на товар', v.url, { ph: 'https://…' })}
      ${F.text('sizes', 'Розміри', v.sizes, { ph: 'Напр.: 36–40, S–XL' })}
      ${F.text('colors', 'Кольори', v.colors, { ph: 'Напр.: чорний, бежевий' })}
      <div class="field full"><span class="lbl">Ціна закупівлі вказана</span><div class="seg" role="radiogroup"><label><input type="radio" name="priceType" value="unit" ${v.priceType !== 'pack' ? 'checked' : ''}>за одиницю</label><label><input type="radio" name="priceType" value="pack" ${v.priceType === 'pack' ? 'checked' : ''}>за упаковку</label></div></div>
      ${F.money('purchasePrice', 'Ціна закупівлі, ₴', v.purchasePrice, { req: true })}
      <div id="pack-wrap">${F.money('packQty', 'Одиниць в упаковці', v.packQty, { req: true })}</div>
      ${F.money('retailPrice', 'Планова роздрібна ціна за одиницю, ₴', v.retailPrice)}
      ${F.date('priceDate', 'Ціна актуальна на', v.priceDate)}
      <div class="full calc-preview" id="calc-preview"></div>
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    onMount: m => {
      const form = m.querySelector('form');
      const upd = () => {
        const type = form.querySelector('[name=priceType]:checked').value;
        m.querySelector('#pack-wrap').hidden = type !== 'pack';
        const tmp = { priceType: type, purchasePrice: parseNum(form.purchasePrice.value), packQty: parseNum(form.packQty.value) };
        const c = Calc.unitCost(tmp), r = parseNum(form.retailPrice.value);
        m.querySelector('#calc-preview').innerHTML = `<div><span>Ціна одиниці</span><b>${fmtMoney(c)}</b></div><div><span>Націнка</span><b>${fmtPct(Calc.markup(c, r))}</b></div><div><span>Маржа</span><b>${fmtPct(Calc.margin(c, r))}</b></div>`;
      };
      form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
    },
    read: fd => {
      const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const type = fd.get('priceType') === 'pack' ? 'pack' : 'unit';
      const purchasePrice = moneyField(fd, 'purchasePrice', errors, { required: true });
      let packQty = null;
      if (type === 'pack') { packQty = parseNum(fd.get('packQty')); if (packQty === null) errors.packQty = 'Вкажіть кількість одиниць.'; else if (Number.isNaN(packQty) || packQty <= 0) { errors.packQty = 'Має бути число більше нуля.'; packQty = null; } }
      const retailPrice = moneyField(fd, 'retailPrice', errors);
      return { errors, values: { name: g(fd, 'name'), category: g(fd, 'category'), sku: g(fd, 'sku'), supplierId: g(fd, 'supplierId') || null, url: g(fd, 'url'), sizes: g(fd, 'sizes'), colors: g(fd, 'colors'), priceType: type, purchasePrice, packQty, retailPrice, priceDate: dateField(fd, 'priceDate', errors), comment: g(fd, 'comment') } };
    },
    onDelete: p ? () => ACTIONS['del-product']({ dataset: { id: p.id } }) : null,
    save: async vals => { if (p) { await Repo.update('products', p.id, vals); toast('Товар збережено'); } else { await Repo.create('products', vals); toast('Товар додано'); } },
  });
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
export function taskForm(id) {
  const t = id ? Repo.get('tasks', id) : null; const v = t || { priority: 'medium', status: 'planned', checklist: [] };
  const clRow = i => `<div class="r" data-cl="${esc(i.id)}"><input type="checkbox" aria-label="Виконано" ${i.done ? 'checked' : ''} data-cl-done><input class="input" value="${esc(i.text)}" placeholder="Пункт чекліста" data-cl-text aria-label="Пункт чекліста"><button type="button" class="btn sm ghost" data-cl-del aria-label="Видалити пункт">✕</button></div>`;
  formModal({
    title: t ? 'Редагувати завдання' : 'Нове завдання',
    fields: `${F.text('title', 'Завдання', v.title, { req: true, full: true })}
      ${F.date('deadline', 'Дедлайн', v.deadline)}
      ${F.select('priority', 'Пріоритет', v.priority, Object.entries(Schema.PRIORITIES))}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.TASK_STATUSES), { full: true })}
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
      return { errors, values: { title: g(fd, 'title'), deadline: dateField(fd, 'deadline', errors), priority: g(fd, 'priority'), status: g(fd, 'status'), description: g(fd, 'description'), checklist } }; },
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
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    read: fd => { const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const planned = moneyField(fd, 'planned', errors), paid = moneyField(fd, 'paid', errors);
      if (!errors.planned && !errors.paid && planned === null && paid === null) errors.planned = 'Вкажіть планову або сплачену суму.';
      return { errors, values: { name: g(fd, 'name'), categoryId: g(fd, 'categoryId'), planned, paid, comment: g(fd, 'comment') } }; },
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
export function purchaseForm(id, preset = {}) {
  const p = id ? Repo.get('purchases', id) : null;
  const v = p || { status: 'planned', items: [], supplierId: preset.supplierId || '', title: preset.title || '' };
  const products = () => D().products;
  const prodOptions = sel => `<option value="">— вільна позиція —</option>${[...products()].sort((a, b) => (a.name > b.name ? 1 : -1)).map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}${x.supplierId ? ' · ' + esc(Repo.get('suppliers', x.supplierId)?.name || '') : ''}</option>`).join('')}`;
  const row = i => `<div class="r" data-item="${esc(i.id)}"><div class="field" style="gap:4px"><select class="input" data-i-prod aria-label="Товар">${prodOptions(i.productId)}</select><input class="input" data-i-name placeholder="Назва позиції" value="${esc(i.name || '')}" aria-label="Назва позиції" ${i.productId ? 'hidden' : ''}></div>
    <input class="input num" data-i-qty inputmode="decimal" placeholder="шт" value="${isNum(i.qty) ? String(i.qty).replace('.', ',') : ''}" aria-label="Кількість одиниць"><input class="input num" data-i-price inputmode="decimal" placeholder="₴ за од." value="${isNum(i.unitPrice) ? String(i.unitPrice).replace('.', ',') : ''}" aria-label="Ціна за одиницю"><button type="button" class="btn sm ghost" data-i-del aria-label="Видалити позицію">✕</button></div>`;
  formModal({
    title: p ? 'Закупівля' : 'Нова закупівля', wide: true,
    fields: `${F.text('title', 'Назва', v.title, { req: true, full: true, ph: 'Напр.: Перша партія шкарпеток' })}
      ${F.select('supplierId', 'Постачальник', v.supplierId || '', supplierOptions())}
      ${F.select('status', 'Статус', v.status, Object.entries(Schema.PURCHASE_STATUSES))}
      ${F.date('expectedDate', 'Очікувана дата', v.expectedDate)}
      ${F.money('deliveryCost', 'Доставка, ₴', v.deliveryCost)}
      <div class="field full"><span class="lbl">Позиції</span><div class="items-head"><span>Товар</span><span>Кількість, шт</span><span>Ціна од., ₴</span><span></span></div><div class="items-edit" id="items-edit">${v.items.map(row).join('')}</div><div><button type="button" class="btn sm" id="item-add">+ Додати позицію</button></div><span class="hint">Ціна одиниці підставляється з картки товару (з урахуванням упаковки), її можна змінити.</span></div>
      <div class="full calc-preview" id="pur-preview"></div>
      <div class="full small muted" id="pur-minorder"></div>
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    onMount: m => {
      const box = m.querySelector('#items-edit'), form = m.querySelector('form');
      const read = () => [...box.querySelectorAll('[data-item]')].map(r => ({ id: r.dataset.item, productId: r.querySelector('[data-i-prod]').value || null, name: r.querySelector('[data-i-name]').value.trim(), qty: parseNum(r.querySelector('[data-i-qty]').value), unitPrice: parseNum(r.querySelector('[data-i-price]').value) }));
      const upd = () => {
        const items = read().map(i => ({ ...i, qty: isNum(i.qty) ? i.qty : null, unitPrice: isNum(i.unitPrice) ? i.unitPrice : null }));
        const t = Calc.purchaseTotal({ items, deliveryCost: parseNum(form.deliveryCost.value) });
        m.querySelector('#pur-preview').innerHTML = `<div><span>Товари</span><b>${fmtMoney(t.items)}</b></div><div><span>Доставка</span><b>${fmtMoney(t.delivery)}</b></div><div><span>Разом</span><b>${fmtMoney(t.total)}</b></div>`;
        const sup = form.supplierId.value && Repo.get('suppliers', form.supplierId.value);
        m.querySelector('#pur-minorder').textContent = sup ? (sup.minOrder ? `Мінімальне замовлення в «${sup.name}»: ${sup.minOrder}.` : `Мінімальне замовлення «${sup.name}» не записане.`) + (sup.deliveryTerms ? ` Доставка: ${sup.deliveryTerms}.` : '') : '';
      };
      m.querySelector('#item-add').onclick = () => { box.insertAdjacentHTML('beforeend', row({ id: uid() })); upd(); };
      box.addEventListener('click', e => { const b = e.target.closest('[data-i-del]'); if (b) { b.closest('[data-item]').remove(); upd(); } });
      box.addEventListener('change', e => {
        if (!e.target.matches('[data-i-prod]')) return;
        const r = e.target.closest('[data-item]'); const prod = e.target.value && Repo.get('products', e.target.value);
        r.querySelector('[data-i-name]').hidden = !!prod;
        if (prod) { const c = Calc.unitCost(prod); r.querySelector('[data-i-name]').value = prod.name; if (isNum(c)) r.querySelector('[data-i-price]').value = String(Math.round(c * 100) / 100).replace('.', ',');
          if (!form.supplierId.value && prod.supplierId) form.supplierId.value = prod.supplierId; }
        upd();
      });
      form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
    },
    read: (fd, form) => {
      const errors = {}; if (!g(fd, 'title')) errors.title = 'Вкажіть назву.';
      const items = [...form.querySelectorAll('[data-item]')].map(r => {
        const productId = r.querySelector('[data-i-prod]').value || null; const prod = productId && Repo.get('products', productId);
        const q = parseNum(r.querySelector('[data-i-qty]').value), pr = parseNum(r.querySelector('[data-i-price]').value);
        if (Number.isNaN(q) || (isNum(q) && q <= 0) || Number.isNaN(pr) || (isNum(pr) && pr < 0)) errors.items = true;
        return { id: r.dataset.item, productId, name: prod ? prod.name : r.querySelector('[data-i-name]').value.trim(), qty: isNum(q) ? q : null, unitPrice: isNum(pr) ? pr : null };
      }).filter(i => i.name || i.productId);
      const values = { title: g(fd, 'title'), supplierId: g(fd, 'supplierId') || null, status: g(fd, 'status'), expectedDate: dateField(fd, 'expectedDate', errors), deliveryCost: moneyField(fd, 'deliveryCost', errors), items, comment: g(fd, 'comment') };
      if (errors.items) { delete errors.items; errors.title = errors.title || 'Перевірте позиції: кількість має бути більшою за нуль, ціна не від’ємна.'; }
      return { errors, values };
    },
    onDelete: p ? async () => { if (await confirmDialog({ title: 'Видалити закупівлю?', text: `<p style="margin:0">«${esc(p.title)}» буде видалено.${p.expenseId ? ' Пов’язана стаття бюджету залишиться.' : ''}</p>` })) { await Repo.remove('purchases', p.id); toast('Закупівлю видалено'); } } : null,
    save: async vals => { if (p) { await Repo.update('purchases', p.id, vals); toast('Закупівлю збережено'); } else { await Repo.create('purchases', vals); toast('Закупівлю додано'); } },
  });
}
/** Створює одну статтю бюджету для закупівлі (категорія «Перша закупівля») і пов’язує їх. */
export async function purchaseToBudget(id) {
  const p = Repo.get('purchases', id); if (!p || p.expenseId) return;
  const t = Calc.purchaseTotal(p);
  const ok = await confirmDialog({ title: 'Внести закупівлю в бюджет?', ok: 'Внести', danger: false, text: `<p style="margin:0">Буде створено статтю «Закупівля: ${esc(p.title)}» у категорії «Перша закупівля» з плановою сумою <b>${fmtMoney(t.total)}</b> і сплаченою 0 ₴. Оплату потім позначте в бюджеті.</p>${t.missing.length ? `<div class="callout warn">${t.missing.length} позицій без ціни або кількості не входять у суму.</div>` : ''}` });
  if (!ok) return;
  const e = await Repo.create('expenses', { name: 'Закупівля: ' + p.title, categoryId: 'first_stock', planned: Math.round(t.total * 100) / 100, paid: 0, comment: 'Створено із закупівлі' });
  await Repo.update('purchases', p.id, { expenseId: e.id }); toast('Статтю додано в бюджет');
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
