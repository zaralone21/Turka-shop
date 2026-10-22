import { Calc } from '../core/calc.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { esc, fmtDate, fmtMoney, fmtPct, parseNum, plural, splitList, todayISO, uid, uniq } from '../core/utils.js';
import { ACTIONS } from './events.js';
import { F, confirmDialog, dateField, formModal, g, moneyField, openModal, supplierOptions } from './modal.js';
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
  const { products, notes } = Repo.linkedToSupplier(id);
  const linked = products.length || notes.length
    ? `<div class="callout warn">З постачальником пов’язано: ${products.length} ${plural(products.length, 'товар', 'товари', 'товарів')} і ${notes.length} ${plural(notes.length, 'нотатка', 'нотатки', 'нотаток')}. Вони <b>не будуть видалені</b>: залишаться у своїх розділах з позначкою «без постачальника».</div>` : '';
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
