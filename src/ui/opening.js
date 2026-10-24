import { FITOUT_STATUSES, budgetCat, MONTHLY_KINDS, PREMISES_STATUSES, fitoutCategories, fitoutLink, monthlySummary, nextPayDate, premisesBudgetPlan, premisesTitle } from '../core/opening.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { esc, fmtDate, fmtKyiv, fmtMoney, isNum, parseNum, plural, uid } from '../core/utils.js';
import { ACTIONS, go } from './events.js';
import { deletePremisesFiles, fileUrl, filesAvailable, uploadPremisesFile } from './files.js';
import { once, syncExpensePlanned } from './budgetSync.js';
import { taskForm, expenseForm } from './forms.js';
import { F, confirmDialog, dateField, formModal, g, moneyField, openModal } from './modal.js';
import { D, UI, toast } from './shared.js';
import { render } from './shell.js';

/* =====================================================================
   ПІДГОТОВКА ДО ВІДКРИТТЯ: форми й дії для приміщення, облаштування, щомісячних витрат.
   Будь-які фінансові записи створюються лише після підтвердження з точними сумами.
   ===================================================================== */
const dayField = (fd, key, errors) => { const v = g(fd, key); if (!v) return null; const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 31) { errors[key] = 'День місяця від 1 до 31.'; return null; } return n; };
const optNum = (fd, key, errors) => { const n = parseNum(fd.get(key)); if (n === null) return null; if (Number.isNaN(n) || n < 0) { errors[key] = 'Введіть невід’ємне число.'; return null; } return n; };

/* ---------- Приміщення ---------- */
export function premisesForm(id) {
  const p = id ? Repo.get('premises', id) : null; const v = p || { status: 'selected', otherPayments: [] };
  const payRow = o => `<div class="r pay-row" data-pay="${esc(o.id)}"><input class="input" data-pay-name placeholder="Напр.: комісія ріелтора" value="${esc(o.name || '')}" aria-label="Назва платежу"><input class="input num" data-pay-amount inputmode="decimal" placeholder="₴" value="${isNum(o.amount) ? String(o.amount).replace('.', ',') : ''}" aria-label="Сума"><button type="button" class="btn sm ghost" data-pay-del aria-label="Видалити платіж">✕</button></div>`;
  formModal({
    title: p ? 'Приміщення' : 'Нове приміщення', wide: true,
    fields: `<p class="small muted full" style="margin:0">Заповнюйте лише те, що відомо напевно. Невідомі поля можна лишити порожніми.</p>
      ${F.text('address', 'Адреса', v.address, { full: true, ph: 'Місто, вулиця, будинок' })}
      ${F.text('name', 'Коротка назва', v.name, { ph: 'Напр.: ТЦ «Центральний», 1 поверх' })}
      ${F.select('status', 'Статус', v.status, Object.entries(PREMISES_STATUSES), { hint: 'Орендованим приміщення вважається лише з підписаним договором.' })}
      ${F.money('area', 'Площа, м²', v.area)}
      ${F.text('mapUrl', 'Посилання на карту', v.mapUrl, { ph: 'https://maps…' })}
      <h3 class="full form-sub">Орендодавець</h3>
      ${F.text('landlordName', 'Ім’я або компанія', v.landlordName)}
      ${F.text('landlordPhone', 'Телефон', v.landlordPhone, { type: 'tel' })}
      ${F.text('landlordContact', 'Інший контакт', v.landlordContact, { full: true, ph: 'Telegram, Viber, e-mail' })}
      <h3 class="full form-sub">Гроші</h3>
      ${F.money('rent', 'Оренда за місяць, ₴', v.rent)}
      ${F.money('deposit', 'Депозит, ₴', v.deposit)}
      ${F.text('payDay', 'День щомісячної оплати', v.payDay ?? '', { mode: 'numeric', ph: '1–31' })}
      <div class="field full"><span class="lbl">Інші початкові платежі</span><div id="pay-edit" class="pay-edit">${v.otherPayments.map(payRow).join('')}</div><div><button type="button" class="btn sm" id="pay-add">+ Платіж</button></div></div>
      <h3 class="full form-sub">Терміни</h3>
      ${F.date('leaseStart', 'Початок оренди', v.leaseStart)}
      ${F.date('leaseEnd', 'Завершення договору', v.leaseEnd)}
      ${F.date('holidayFrom', 'Орендні канікули з', v.holidayFrom)}
      ${F.date('holidayTo', 'Орендні канікули до', v.holidayTo)}
      ${F.area('holidayTerms', 'Умови канікул', v.holidayTerms, { rows: 2, ph: 'Що саме погоджено: без оренди, лише комунальні…' })}
      <h3 class="full form-sub">Комунальні</h3>
      ${F.area('utilitiesIncluded', 'Входить в оренду', v.utilitiesIncluded, { rows: 2, full: false })}
      ${F.area('utilitiesSeparate', 'Оплачується окремо', v.utilitiesSeparate, { rows: 2, full: false })}
      <h3 class="full form-sub">Заміри й домовленості</h3>
      ${F.area('measurements', 'Заміри', v.measurements, { rows: 3, ph: 'Довжина стін, висота стелі, вікна, розетки…' })}
      ${F.area('notes', 'Нотатки про домовленості', v.notes, { rows: 3 })}`,
    onMount: m => {
      const box = m.querySelector('#pay-edit');
      m.querySelector('#pay-add').onclick = () => { box.insertAdjacentHTML('beforeend', payRow({ id: uid() })); box.lastElementChild.querySelector('[data-pay-name]').focus(); };
      box.addEventListener('click', e => { const b = e.target.closest('[data-pay-del]'); if (b) b.closest('[data-pay]').remove(); });
    },
    read: (fd, form) => {
      const errors = {};
      const otherPayments = [...form.querySelectorAll('[data-pay]')].map(r => {
        const n = parseNum(r.querySelector('[data-pay-amount]').value); if (Number.isNaN(n) || (isNum(n) && n < 0)) errors.rent = errors.rent || 'Перевірте суми інших платежів.';
        return { id: r.dataset.pay, name: r.querySelector('[data-pay-name]').value.trim(), amount: isNum(n) ? n : null };
      }).filter(o => o.name || o.amount !== null);
      const values = {
        address: g(fd, 'address'), name: g(fd, 'name'), status: g(fd, 'status'), area: optNum(fd, 'area', errors), mapUrl: g(fd, 'mapUrl'),
        landlordName: g(fd, 'landlordName'), landlordPhone: g(fd, 'landlordPhone'), landlordContact: g(fd, 'landlordContact'),
        rent: moneyField(fd, 'rent', errors), deposit: moneyField(fd, 'deposit', errors), payDay: dayField(fd, 'payDay', errors), otherPayments,
        leaseStart: dateField(fd, 'leaseStart', errors), leaseEnd: dateField(fd, 'leaseEnd', errors), holidayFrom: dateField(fd, 'holidayFrom', errors), holidayTo: dateField(fd, 'holidayTo', errors), holidayTerms: g(fd, 'holidayTerms'),
        utilitiesIncluded: g(fd, 'utilitiesIncluded'), utilitiesSeparate: g(fd, 'utilitiesSeparate'), measurements: g(fd, 'measurements'), notes: g(fd, 'notes'),
      };
      if (!values.address && !values.name) errors.address = 'Вкажіть адресу або коротку назву.';
      if (values.leaseStart && values.leaseEnd && values.leaseEnd < values.leaseStart) errors.leaseEnd = 'Завершення раніше за початок.';
      if (values.holidayFrom && values.holidayTo && values.holidayTo < values.holidayFrom) errors.holidayTo = 'Кінець канікул раніше за початок.';
      return { errors, values };
    },
    onDelete: p ? () => deletePremises(p.id) : null,
    save: async vals => {
      if (p) { await Repo.update('premises', p.id, vals); toast('Приміщення збережено'); }
      else { const c = await Repo.create('premises', { ...vals, files: [] }); UI.premisesId = c.id; toast('Приміщення додано'); go('premises'); }
    },
  });
}
async function deletePremises(id) {
  const p = Repo.get('premises', id); if (!p) return;
  const linked = D().expenses.filter(e => e.source && e.source.type === 'premises' && e.source.id === id);
  const ok = await confirmDialog({ title: 'Видалити приміщення?', text: `<p style="margin:0">«${esc(premisesTitle(p))}» буде видалено разом із файлами (${p.files.length}).${linked.length ? ` Статті бюджету (${linked.length}) залишаться, їх можна прибрати в бюджеті.` : ''}</p>` });
  if (!ok) return;
  await Repo.remove('premises', id); deletePremisesFiles(p.files); UI.premisesId = null; toast('Приміщення видалено');
}

/** Показує точні суми оренди, депозиту й інших платежів і після підтвердження створює або оновлює статті бюджету. */
export const premisesToBudget = once(async id => {
  const pr = Repo.get('premises', id); if (!pr) return;
  const plan = premisesBudgetPlan(D(), pr);
  const todo = plan.filter(x => x.action === 'create' || x.action === 'update');
  const line = x => x.action === 'create' ? `<li>Створити «${esc(x.name)}»: план <b>${fmtMoney(x.amount)}</b>, сплачено 0 ₴</li>`
    : x.action === 'update' ? `<li>Оновити план «${esc(x.expense.name)}»: ${fmtMoney(x.from)} → <b>${fmtMoney(x.amount)}</b>. Сплачене (${fmtMoney(x.expense.paid ?? 0)}) не змінюється.</li>`
    : x.action === 'same' ? `<li class="muted">${esc(x.label)}: уже в бюджеті, ${fmtMoney(x.amount)}</li>`
    : `<li class="muted">${esc(x.label)}: суму не вказано, пропускаю</li>`;
  if (!todo.length) { toast(plan.some(x => x.action === 'same') ? 'Усі суми вже в бюджеті' : 'Спершу вкажіть суми оренди чи депозиту'); return; }
  const ok = await confirmDialog({ title: 'Внести платежі приміщення в бюджет', ok: 'Підтвердити', danger: false,
    text: `<ul class="small" style="margin:0;padding-left:18px">${plan.map(line).join('')}</ul>${pr.status === 'signed' || pr.status === 'keys' ? '' : '<div class="callout warn" style="margin-top:10px">Договір ще не підписано: це планові суми, а не підтверджені умови.</div>'}${pr.holidayFrom ? '<p class="small muted">Є орендні канікули: перевірте, чи потрібно платити за перший місяць.</p>' : ''}` });
  if (!ok) return;
  const fresh = premisesBudgetPlan(D(), Repo.get('premises', id)); // ще раз перед записом: дані могли змінитися
  for (const x of fresh) {
    if (x.action === 'create') await Repo.create('expenses', { name: x.name, categoryId: budgetCat(D(), x.categoryId), planned: x.amount, paid: 0, comment: 'Створено з розділу «Приміщення»', source: { type: 'premises', id, part: x.part } });
    else if (x.action === 'update') await Repo.update('expenses', x.expense.id, { planned: x.amount });
  }
  toast('Бюджет оновлено');
});

/** Щомісячне нагадування про оплату оренди. Повторно не створюється, якщо вже є. */
export async function rentReminder(id) {
  const pr = Repo.get('premises', id); if (!pr) return;
  const existing = pr.rentReminderId && Repo.get('reminders', pr.rentReminderId);
  if (existing) { ACTIONS['edit-reminder']({ dataset: { id: existing.id } }); return; }
  if (!pr.payDay) { toast('Спершу вкажіть день щомісячної оплати', 'error'); return; }
  const date = nextPayDate(pr.payDay);
  const ok = await confirmDialog({ title: 'Нагадування про оренду', ok: 'Створити', danger: false, text: `<p style="margin:0">Щомісячне нагадування «Оплатити оренду${isNum(pr.rent) ? ' ' + fmtMoney(pr.rent) : ''}» ${fmtDate(date)} о 10:00, далі щомісяця.</p>` });
  if (!ok) return;
  const r = await Repo.create('reminders', { title: `Оплатити оренду${isNum(pr.rent) ? ' ' + fmtMoney(pr.rent) : ''}: ${premisesTitle(pr)}`, date, time: '10:00', repeat: 'monthly', status: 'planned', link: { type: 'premises', id: pr.id } });
  await Repo.update('premises', pr.id, { rentReminderId: r.id });
  toast(`Нагадування на ${fmtKyiv(r.fireAt)}`);
}

export async function addPremisesFiles(id, kind, fileList) {
  const pr = Repo.get('premises', id); if (!pr) return;
  if (!filesAvailable()) { toast('Файли зберігаються в приватному сховищі. Увійдіть в обліковий запис, щоб їх додавати.', 'error'); return; }
  const files = [...fileList]; if (!files.length) return;
  toast(`Завантаження: ${files.length} ${plural(files.length, 'файл', 'файли', 'файлів')}…`);
  const added = [];
  for (const f of files) { try { added.push(await uploadPremisesFile(id, f, kind)); } catch (e) { toast(e.message || 'Не вдалося додати файл', 'error'); } }
  if (!added.length) return;
  await Repo.update('premises', id, { files: [...Repo.get('premises', id).files, ...added] });
  toast(`Додано ${added.length} ${plural(added.length, 'файл', 'файли', 'файлів')}`);
}
async function removePremisesFile(id, fileId) {
  const pr = Repo.get('premises', id); const f = pr && pr.files.find(x => x.id === fileId); if (!f) return;
  if (!await confirmDialog({ title: 'Видалити файл?', text: `<p style="margin:0">«${esc(f.name)}» буде видалено зі сховища.</p>` })) return;
  await Repo.update('premises', id, { files: pr.files.filter(x => x.id !== fileId) }); deletePremisesFiles([f]); toast('Файл видалено');
}
async function openPremisesFile(path) {
  const w = window.open('', '_blank');
  const url = await fileUrl(path).catch(() => null);
  if (!url) { w && w.close(); toast('Не вдалося відкрити файл', 'error'); return; }
  if (w) w.location = url; else location.href = url;
}

/* ---------- Облаштування ---------- */
export function fitoutForm(id) {
  const it = id ? Repo.get('fitout', id) : null; const d = D();
  const v = it || { status: 'undecided', priority: 'medium', category: UI.f.fitCat || 'shelves' };
  const taskOpts = [['', '— без завдання —'], ...d.tasks.filter(t => t.status !== 'done' || t.id === v.taskId).map(t => [t.id, t.title])];
  const expOpts = [['', '— не пов’язано —'], ...d.expenses.map(e => [e.id, `${e.name} · план ${fmtMoney(e.planned ?? 0)}`])];
  formModal({
    title: it ? 'Позиція облаштування' : 'Нова позиція облаштування', wide: true,
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true, ph: 'Напр.: Стелаж настінний для шкарпеток' })}
      ${F.select('category', 'Категорія', v.category, fitoutCategories(d).map(c => [c.id, c.name]))}
      ${F.select('status', 'Статус', v.status, Object.entries(FITOUT_STATUSES))}
      ${F.money('qty', 'Кількість', v.qty)}
      ${F.text('size', 'Розміри', v.size, { ph: 'Напр.: 120×40×200 см' })}
      ${F.text('url', 'Посилання', v.url, { ph: 'https://…' })}
      ${F.text('vendor', 'Виконавець або продавець', v.vendor)}
      ${F.money('planned', 'Планова сума, ₴', v.planned, { hint: 'Оцінка на всю позицію. Сплачене береться з пов’язаної статті бюджету.' })}
      ${F.date('deadline', 'Термін', v.deadline)}
      ${F.select('priority', 'Пріоритет', v.priority, Object.entries(Schema.PRIORITIES))}
      ${F.select('taskId', 'Пов’язане завдання', v.taskId || '', taskOpts)}
      ${F.select('expenseId', 'Стаття бюджету', v.expenseId || '', expOpts, { hint: 'Можна прив’язати наявну статтю або пізніше натиснути «Внести в бюджет».' })}
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}`,
    read: fd => {
      const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      const qty = optNum(fd, 'qty', errors);
      return { errors, values: { name: g(fd, 'name'), category: g(fd, 'category'), status: g(fd, 'status'), qty, size: g(fd, 'size'), url: g(fd, 'url'), vendor: g(fd, 'vendor'),
        planned: moneyField(fd, 'planned', errors), deadline: dateField(fd, 'deadline', errors), priority: g(fd, 'priority'), taskId: g(fd, 'taskId') || null, expenseId: g(fd, 'expenseId') || null, comment: g(fd, 'comment') } };
    },
    onDelete: it ? async () => { if (await confirmDialog({ title: 'Видалити позицію?', text: `<p style="margin:0">«${esc(it.name)}» буде видалено.${it.expenseId ? ' Пов’язана стаття бюджету залишиться.' : ''}</p>` })) { await Repo.remove('fitout', it.id); toast('Позицію видалено'); } } : null,
    save: async vals => {
      if (it) { await Repo.update('fitout', it.id, vals); toast('Позицію збережено'); await offerFitoutSync(it.id); }
      else { await Repo.create('fitout', vals); toast('Позицію додано'); }
    },
  });
}
/** Після зміни планової суми пропонує оновити план пов'язаної статті (було → стане). */
async function offerFitoutSync(id) {
  const it = Repo.get('fitout', id); if (!it) return;
  const st = fitoutLink(D(), it);
  if (st.state !== 'mismatch') return;
  const shared = D().fitout.filter(x => x.expenseId === it.expenseId).length > 1;
  if (shared) return; // спільну статтю кількох позицій не переписуємо автоматичною пропозицією
  await syncExpensePlanned(st.expense.id, st.amount, `Планова сума позиції «${it.name}» відрізняється від бюджету.`);
}
export const fitoutToBudget = once(async id => {
  const it = Repo.get('fitout', id); if (!it) return;
  const d = D(); const st = fitoutLink(d, it);
  if (st.state === 'ok' || st.state === 'mismatch') { toast('Позиція вже пов’язана зі статтею бюджету'); return; }
  if (!isNum(it.planned)) { toast('Спершу вкажіть планову суму позиції', 'error'); return; }
  // стаття, створена раніше з цієї позиції (наприклад, на іншому пристрої), використовується повторно
  const prev = d.expenses.find(e => e.source && e.source.type === 'fitout' && e.source.id === it.id);
  const cat = fitoutCategories(d).find(c => c.id === it.category) || { budget: 'other' };
  const catName = d.settings.budgetCategories.find(c => c.id === cat.budget)?.name || 'Інше';
  const ok = await confirmDialog({ title: 'Внести в бюджет?', ok: prev ? 'Прив’язати' : 'Внести', danger: false,
    text: prev ? `<p style="margin:0">У бюджеті вже є стаття «${esc(prev.name)}» (план ${fmtMoney(prev.planned ?? 0)}), створена з цієї позиції. Її буде прив’язано знову, нова не створюється.</p>`
      : `<p style="margin:0">Буде створено статтю «Облаштування: ${esc(it.name)}» у категорії «${esc(catName)}» з плановою сумою <b>${fmtMoney(it.planned)}</b> і сплаченою 0 ₴.</p>` });
  if (!ok) return;
  const e = prev || await Repo.create('expenses', { name: 'Облаштування: ' + it.name, categoryId: budgetCat(D(), cat.budget), planned: Math.round(it.planned * 100) / 100, paid: 0, comment: 'Створено з розділу «Облаштування»', source: { type: 'fitout', id: it.id } });
  await Repo.update('fitout', it.id, { expenseId: e.id }); toast(prev ? 'Статтю прив’язано' : 'Статтю додано в бюджет');
});
export const fitoutTask = once(async id => {
  const it = Repo.get('fitout', id); if (!it) return;
  if (it.taskId && Repo.get('tasks', it.taskId)) { taskForm(it.taskId); return; }
  const t = await Repo.create('tasks', { title: 'Облаштування: ' + it.name, deadline: it.deadline, priority: it.priority, status: 'planned', prep: true, description: [it.vendor && 'Виконавець: ' + it.vendor, it.url].filter(Boolean).join('\n') });
  await Repo.update('fitout', it.id, { taskId: t.id }); toast('Завдання створено й позначено як підготовку до відкриття');
});
export function fitoutCatsModal() {
  const draw = () => `<div class="modal-b"><div class="list">${fitoutCategories(D()).map(c => `<div class="li"><div class="t">${c.builtin ? esc(c.name) : `<input class="input" value="${esc(c.name)}" data-fcat-name="${c.id}" aria-label="Назва категорії">`}<div class="small muted">${c.builtin ? 'Стандартна' : 'Власна'} · позицій: ${D().fitout.filter(i => i.category === c.id).length}</div></div>${c.builtin ? '' : `<button class="btn sm danger" data-fcat-del="${c.id}">Видалити</button>`}</div>`).join('')}</div>
    <form class="row" id="fcat-form"><input class="input" style="flex:1 1 200px" id="fcat-new" placeholder="Нова категорія, напр.: Кондиціонер" aria-label="Нова категорія"><button class="btn primary" type="submit">Додати</button></form></div>`;
  const save = list => Repo.setSettings({ fitoutCategories: list });
  openModal({ title: 'Категорії облаштування', body: draw(), foot: '<div class="modal-f"><button class="btn" data-close>Готово</button></div>', onMount: m => {
    m.querySelector('#fcat-form').onsubmit = async e => { e.preventDefault(); const name = m.querySelector('#fcat-new').value.trim(); if (!name) return;
      if (fitoutCategories(D()).some(c => c.name.toLowerCase() === name.toLowerCase())) { toast('Така категорія вже є', 'error'); return; }
      await save([...D().settings.fitoutCategories, { id: 'fc-' + uid().slice(0, 8), name }]); fitoutCatsModal(); };
    m.querySelectorAll('[data-fcat-name]').forEach(inp => inp.addEventListener('change', async () => { const v = inp.value.trim(); if (v) await save(D().settings.fitoutCategories.map(c => c.id === inp.dataset.fcatName ? { ...c, name: v } : c)); }));
    m.querySelectorAll('[data-fcat-del]').forEach(b => b.onclick = async () => { const id = b.dataset.fcatDel; const n = D().fitout.filter(i => i.category === id).length;
      if (!await confirmDialog({ title: 'Видалити категорію?', text: `<p style="margin:0">${n ? `${n} ${plural(n, 'позиція перейде', 'позиції перейдуть', 'позицій перейдуть')} у «Обладнання». ` : ''}Позиції не видаляються.</p>` })) { fitoutCatsModal(); return; }
      await save(D().settings.fitoutCategories.filter(c => c.id !== id));
      const moved = D().fitout.filter(i => i.category === id); if (moved.length) await Repo.updateMany('fitout', moved.map(i => ({ id: i.id, fields: { category: 'equipment' } })));
      fitoutCatsModal(); });
  } });
}

/* ---------- Щомісячні витрати ---------- */
export function monthlyForm(id, preset = {}) {
  const it = id ? Repo.get('monthly', id) : null; const v = it || { kind: preset.kind || 'utilities', name: preset.name || '' };
  const rentFromPremises = !!monthlySummary(D()).rent;
  formModal({
    title: it ? 'Щомісячна витрата' : 'Нова щомісячна витрата',
    fields: `${F.text('name', 'Назва', v.name, { req: true, full: true, ph: 'Напр.: Світло й вода' })}
      ${F.select('kind', 'Тип', v.kind, Object.entries(MONTHLY_KINDS))}
      ${F.money('amount', 'Сума на місяць, ₴', v.amount, { hint: 'Можна лишити порожньою, якщо ще невідомо.' })}
      ${F.text('payDay', 'День оплати', v.payDay ?? '', { mode: 'numeric', ph: '1–31' })}
      ${F.area('comment', 'Коментар', v.comment, { rows: 2 })}
      ${rentFromPremises ? '<p class="small muted full" style="margin:0">Оренда вже підтягується з розділу «Приміщення». Окрема стаття з типом «Оренда» не додається до суми, щоб не порахувати її двічі.</p>' : ''}`,
    read: fd => { const errors = {}; if (!g(fd, 'name')) errors.name = 'Вкажіть назву.';
      return { errors, values: { name: g(fd, 'name'), kind: g(fd, 'kind'), amount: moneyField(fd, 'amount', errors), payDay: dayField(fd, 'payDay', errors), comment: g(fd, 'comment') } }; },
    onDelete: it ? async () => { if (await confirmDialog({ title: 'Видалити статтю?', text: `<p style="margin:0">«${esc(it.name)}» буде видалено.${it.reminderId ? ' Нагадування про оплату залишиться.' : ''}</p>` })) { await Repo.remove('monthly', it.id); toast('Статтю видалено'); } } : null,
    save: async vals => { if (it) { await Repo.update('monthly', it.id, vals); toast('Збережено'); } else { await Repo.create('monthly', vals); toast('Статтю додано'); } },
  });
}
export const monthlyDefaults = once(async () => {
  const d = D(); const have = new Set(d.monthly.map(m => m.kind));
  const kinds = Object.keys(MONTHLY_KINDS).filter(k => !have.has(k) && !(k === 'rent' && monthlySummary(d).rent));
  if (!kinds.length) { toast('Типові статті вже додано'); return; }
  for (const k of kinds) await Repo.create('monthly', { name: MONTHLY_KINDS[k], kind: k, amount: null });
  toast('Додано типові статті. Суми впишіть, коли будуть відомі.');
});
export async function monthlyReminder(id) {
  const it = Repo.get('monthly', id); if (!it) return;
  const existing = it.reminderId && Repo.get('reminders', it.reminderId);
  if (existing) { ACTIONS['edit-reminder']({ dataset: { id: existing.id } }); return; }
  if (!it.payDay) { toast('Спершу вкажіть день оплати', 'error'); monthlyForm(id); return; }
  const date = nextPayDate(it.payDay);
  const ok = await confirmDialog({ title: 'Нагадування про оплату', ok: 'Створити', danger: false, text: `<p style="margin:0">«Оплатити: ${esc(it.name)}» ${fmtDate(date)} о 10:00, далі щомісяця.</p>` });
  if (!ok) return;
  const r = await Repo.create('reminders', { title: `Оплатити: ${it.name}${isNum(it.amount) ? ' ' + fmtMoney(it.amount) : ''}`, date, time: '10:00', repeat: 'monthly', status: 'planned', link: { type: 'monthly', id: it.id } });
  await Repo.update('monthly', it.id, { reminderId: r.id }); toast(`Нагадування на ${fmtKyiv(r.fireAt)}`);
}
/** Підставляє суму щомісячних витрат у калькулятор беззбитковості (з підтвердженням «було → стане»). */
export async function monthlyToBreakeven() {
  const s = monthlySummary(D()); const be = D().settings.breakeven;
  if (!(s.total > 0)) { toast('Спершу вкажіть суми щомісячних витрат', 'error'); return; }
  const ok = await confirmDialog({ title: 'Підставити в беззбитковість?', ok: 'Підставити', danger: false,
    text: `<p style="margin:0">Постійні витрати на місяць: ${be.fixed ? esc(be.fixed) + ' ₴' : 'не вказано'} → <b>${fmtMoney(s.total)}</b>.</p>${s.missing.length ? `<div class="callout warn" style="margin-top:10px">${s.missing.length} ${plural(s.missing.length, 'стаття', 'статті', 'статей')} без суми не враховано.</div>` : ''}${s.rent && !s.rent.confirmed ? '<p class="small muted">Оренда взята з приміщення, договір щодо якого ще не підписано.</p>' : ''}` });
  if (!ok) return;
  await Repo.setSettings({ breakeven: { ...be, fixed: String(s.total).replace('.', ',') } }); toast('Підставлено в калькулятор');
}

/* ---------- Дата відкриття ---------- */
export function openingDateForm() {
  formModal({ title: 'Планова дата відкриття',
    fields: `${F.date('openingDate', 'Дата', D().settings.openingDate, { full: true, hint: 'Орієнтир для плану. Її можна змінити будь-коли.' })}`,
    read: fd => { const errors = {}; return { errors, values: { openingDate: dateField(fd, 'openingDate', errors) } }; },
    save: async v => { await Repo.setSettings({ openingDate: v.openingDate || '' }); toast(v.openingDate ? 'Дату відкриття збережено' : 'Дату прибрано'); },
  });
}

/* ---------- Перехід до запису за посиланням (підказки на головній, AI) ---------- */
export function openRef(collection, id) {
  const open = { suppliers: () => ACTIONS['open-supplier']({ dataset: { id } }), tasks: () => taskForm(id), purchases: () => ACTIONS['edit-purchase']({ dataset: { id } }),
    expenses: () => expenseForm(id), reminders: () => ACTIONS['edit-reminder']({ dataset: { id } }), fitout: () => fitoutForm(id), monthly: () => monthlyForm(id),
    premises: () => { UI.premisesId = id; go('premises'); }, products: () => ACTIONS['edit-product']({ dataset: { id } }), notes: () => ACTIONS['edit-note']({ dataset: { id } }) }[collection];
  if (open && (collection === 'premises' || Repo.get(collection, id))) open(); else toast('Запис не знайдено', 'error');
}

/** Дії розділів відкриття; підключаються до спільного обробника в main.js. */
export const OPENING_ACTIONS = {
  'add-premises': () => premisesForm(), 'edit-premises': el => premisesForm(el.dataset.id), 'pick-premises': el => { UI.premisesId = el.dataset.id; render(); },
  'premises-budget': el => premisesToBudget(el.dataset.id), 'premises-reminder': el => rentReminder(el.dataset.id),
  'premises-file-del': el => removePremisesFile(el.dataset.id, el.dataset.file), 'premises-file-open': el => openPremisesFile(el.dataset.path),
  'add-fitout': () => fitoutForm(), 'edit-fitout': el => fitoutForm(el.dataset.id), 'fitout-budget': el => fitoutToBudget(el.dataset.id), 'fitout-task': el => fitoutTask(el.dataset.id),
  'fitout-sync': el => { const it = Repo.get('fitout', el.dataset.id); const st = it && fitoutLink(D(), it); if (st && st.state === 'mismatch') syncExpensePlanned(st.expense.id, st.amount, `Планова сума позиції «${it.name}» відрізняється від бюджету.`); },
  'fitout-cats': () => fitoutCatsModal(), 'fit-cat': el => { UI.f.fitCat = el.dataset.v; render(); }, 'fit-status': el => { UI.f.fitStatus = el.dataset.v; render(); },
  'add-monthly': () => monthlyForm(), 'edit-monthly': el => monthlyForm(el.dataset.id), 'monthly-defaults': () => monthlyDefaults(), 'monthly-reminder': el => monthlyReminder(el.dataset.id), 'monthly-to-be': () => monthlyToBreakeven(),
  'opening-date': () => openingDateForm(), 'open-ref': el => openRef(el.dataset.col, el.dataset.id),
};

/** Вибір файлів для приміщення (input type=file з data-pfile-kind). */
document.addEventListener('change', e => {
  const el = e.target; if (!el.matches || !el.matches('input[type=file][data-pfile-kind]')) return;
  const files = [...el.files]; el.value = '';
  addPremisesFiles(el.dataset.id, el.dataset.pfileKind, files);
});
