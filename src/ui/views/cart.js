import { cartGroups, cartTotals, deliveryId, itemFromProduct, lineSum, minOrderLabel, minOrderOf, minOrderProgress, perLabel, purchaseFromGroup, qtyText, refreshFromProduct, sourceChanges, supplierListText, unitShort, unitWord, packWord } from '../../core/cart.js';
import { Repo } from '../../core/repo.js';
import { byText, esc, fmtDate, fmtMoney, fmtNum, isNum, parseNum, plural, todayISO } from '../../core/utils.js';
import { copyText } from '../backup.js';
import { planCartImport } from '../../core/cartImport.js';
import { closeModal, openModal } from '../modal.js';
import { photoImg } from '../photos.js';
import { D, UI, VIEWS, toast } from '../shared.js';
import { svg } from '../shell.js';

/* ---------- Кошик закупівель: підбір товарів → заплановані закупівлі ---------- */
const items = () => D().cart.filter(x => x.kind === 'item');
export const cartItemFor = productId => items().find(i => i.productId === productId) || null;
const groups = () => cartGroups(D().cart, D().suppliers, byText);
const shortQty = it => `${fmtNum(it.qty)} ${it.buyBy === 'pack' ? 'уп.' : unitShort(it.unit)}`;

/** Кнопка «Кошик» з кількістю позицій і сумою: у каталозі та в закупівлях. */
export function cartButton() {
  const list = items(); const sum = list.reduce((s, i) => s + (lineSum(i) ?? 0), 0); const unknown = list.some(i => !isNum(i.price));
  return `<button class="btn cart-btn" data-act="go-cart" aria-label="Кошик: ${list.length} ${plural(list.length, 'позиція', 'позиції', 'позицій')}${list.length ? `, ${fmtMoney(sum)}` : ''}">${svg('purchases')}<span>Кошик</span>${list.length ? `<b class="cart-n">${list.length}</b><span class="cart-sum-s">${fmtMoney(sum)}${unknown ? '+' : ''}</span>` : ''}</button>`;
}
/** «До кошика» або «У кошику − 3 уп. +» для картки, рядка списку чи перегляду товару. */
export function cartControl(p, attr = 'data-act') {
  const it = cartItemFor(p.id);
  const a = v => (attr === 'data-act' ? `data-act="${v}"` : `data-pv-cart="${v}"`);
  if (!it) return `<button type="button" class="btn sm cart-add" ${a('cart-add')} data-id="${p.id}" aria-label="Додати до кошика: ${esc(p.name)}">${svg('plus')}До кошика</button>`;
  return `<span class="cart-ctl" ${attr === 'data-act' ? 'data-act="cart-noop"' : ''} role="group" aria-label="У кошику: ${esc(p.name)}"><button type="button" ${a('cart-dec')} data-id="${it.id}" aria-label="Зменшити кількість" ${it.qty <= 1 ? 'aria-disabled="true"' : ''}>−</button><span class="cart-q"><span class="k">У кошику</span>${shortQty(it)}</span><button type="button" ${a('cart-inc')} data-id="${it.id}" aria-label="Збільшити кількість">+</button></span>`;
}

async function saveCart(fn) {
  await fn();
  if (!Repo.status.cloud && Repo.status.lastError) throw new Error('браузер не зміг записати дані');
}
/** Додає товар; повторне додавання збільшує кількість наявної позиції. */
export async function addToCart(productId) {
  const p = Repo.get('products', productId); if (!p) return;
  const it = cartItemFor(productId);
  try {
    if (it) await saveCart(() => Repo.update('cart', it.id, { qty: it.qty + 1, selected: true }));
    else await saveCart(() => Repo.create('cart', itemFromProduct(p)));
    toast(it ? `У кошику: ${shortQty({ ...it, qty: it.qty + 1 })}` : 'Додано до кошика');
  } catch (e) { toast(`Не вдалося додати до кошика: ${e.message}`, 'error'); }
}
export async function stepCart(id, delta) {
  const it = Repo.get('cart', id); if (!it) return;
  const qty = it.qty + delta; if (qty < 1 || qty > 100000) return; // мінус не видаляє позицію
  try { await saveCart(() => Repo.update('cart', id, { qty })); } catch (e) { toast(`Не вдалося змінити кількість: ${e.message}`, 'error'); }
}

const money = v => (isNum(v) ? String(v).replace('.', ',') : '');
const deliveryText = v => (v === null ? 'Не врахована' : v === 0 ? 'Безкоштовно' : fmtMoney(v));
function itemRow(it, g) {
  const p = it.productId ? Repo.get('products', it.productId) : null;
  const ch = sourceChanges(it, p);
  const photo = p?.photos?.length ? photoImg(p.photos[0], '', it.name) : svg('products');
  const unitLine = it.buyBy === 'pack' ? `Упаковка${isNum(it.packQty) ? ` (${fmtNum(it.packQty)} ${unitWord(it.unit, it.packQty)})` : ', розмір невідомий'}` : it.unit === 'pair' ? 'Пара' : 'Штука';
  const sum = lineSum(it);
  return `<div class="ci ${it.selected ? '' : 'off'}" data-ci="${it.id}">
    <label class="ci-check"><input type="checkbox" data-act="cart-sel" data-id="${it.id}" ${it.selected ? 'checked' : ''} aria-label="Обрати: ${esc(it.name)}"></label>
    <span class="ci-photo">${photo}</span>
    <div class="ci-main"><b class="ci-name">${esc(it.name)}</b>${it.sku ? `<span class="ci-sku">арт. ${esc(it.sku)}</span>` : ''}
      ${it.url ? `<a class="ci-link" href="${esc(/^https?:\/\//i.test(it.url) ? it.url : 'https://' + it.url)}" target="_blank" rel="noopener noreferrer">Товар у постачальника ↗</a>` : ''}
      <span class="ci-unit">Одиниця закупівлі: ${unitLine}</span>
      ${!g.supplierId ? `<label class="ci-sup"><span>Постачальник:</span><select class="input" id="cart-s-${it.id}" data-act="cart-sup" data-id="${it.id}"><option value="">— оберіть —</option>${[...D().suppliers].sort((a, b) => byText(a.name, b.name)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      ${ch[0] === 'deleted' ? '<span class="ci-warn">Товар видалено з каталогу. Позиція збережена з попередніми даними.</span>'
        : ch.length ? `<span class="ci-warn">У каталозі змінилось: ${ch.join(', ')}. Перевірте позицію. <button type="button" class="btn sm" data-act="cart-refresh" data-id="${it.id}">Оновити з каталогу</button> <button type="button" class="btn sm ghost" data-act="cart-keep" data-id="${it.id}">Залишити як є</button></span>` : ''}
    </div>
    <div class="ci-qty"><span class="k">Кількість</span><span class="cart-ctl big"><button type="button" data-act="cart-dec" data-id="${it.id}" aria-label="Зменшити кількість" ${it.qty <= 1 ? 'aria-disabled="true"' : ''}>−</button><input class="input" id="cart-q-${it.id}" data-act="cart-qty" data-id="${it.id}" inputmode="numeric" value="${it.qty}" aria-label="Кількість, ${it.buyBy === 'pack' ? 'упаковок' : unitWord(it.unit, 5)}"><button type="button" data-act="cart-inc" data-id="${it.id}" aria-label="Збільшити кількість">+</button></span><span class="ci-qt ${it.buyBy === 'pack' && !isNum(it.packQty) ? 'warn' : ''}">${qtyText(it)}</span></div>
    <div class="ci-price"><span class="k">Ціна ${perLabel(it)}, ₴</span><input class="input" id="cart-p-${it.id}" data-act="cart-price" data-id="${it.id}" inputmode="decimal" value="${money(it.price)}" placeholder="Уточнити" aria-label="Закупівельна ціна ${perLabel(it)}">${!isNum(it.price) ? '<span class="ci-warn">Уточніть закупівельну ціну</span>' : isNum(it.src?.purchasePrice) && it.price !== it.src.purchasePrice && !ch.length ? `<span class="ci-note">У каталозі ${fmtMoney(it.src.purchasePrice)}</span>` : ''}</div>
    <div class="ci-sum"><span class="k">Сума</span><b>${isNum(sum) ? fmtMoney(sum) : '—'}</b></div>
    <button type="button" class="btn ghost icon ci-del" data-act="cart-del" data-id="${it.id}" aria-label="Видалити з кошика: ${esc(it.name)}">${svg('trash')}</button>
  </div>`;
}
function groupHtml(g) {
  const s = g.supplier; const sid = g.supplierId || 'none';
  const all = g.items.length && g.selected.length === g.items.length;
  const min = minOrderOf(s); const prog = minOrderProgress(min, g.selected);
  const site = s?.website ? (/^https?:\/\//i.test(s.website) ? s.website : 'https://' + s.website) : '';
  return `<section class="cart-group" aria-label="${esc(s ? s.name : 'Без постачальника')}">
    <header class="cg-head"><label class="ci-check"><input type="checkbox" data-act="cart-sel-all" data-sid="${sid}" ${all ? 'checked' : ''} aria-label="Вибрати всі товари ${esc(s ? s.name : 'без постачальника')}"></label>
      <div class="cg-title">${s ? `<button type="button" class="btn link cg-name" data-act="open-supplier" data-id="${s.id}">${esc(s.name)}</button>` : '<b class="cg-name">Без постачальника</b>'}<span class="muted small">Обрано ${g.selected.length} з ${g.items.length}</span></div>
      ${s ? `<div class="cg-acts"><button type="button" class="btn sm" data-act="cart-copy" data-sid="${sid}" ${g.selected.length ? '' : 'aria-disabled="true"'}>Скопіювати список</button>${site ? `<a class="btn sm ghost" href="${esc(site)}" target="_blank" rel="noopener noreferrer">Відкрити сайт постачальника ↗</a>` : ''}</div>` : ''}
    </header>
    ${!s ? '<p class="cg-note warn">Оберіть постачальника для кожного товару, щоб створити закупівлю. До того позиції лишаються тут.</p>' : ''}
    ${prog.map(x => `<p class="cg-note ${x.ok ? 'ok' : 'warn'}">${x.text}.${x.note ? ` <span class="muted">${x.note}</span>` : ''}</p>`).join('')}
    ${s && s.minOrder ? `<p class="cg-note muted">Умова постачальника: ${esc(s.minOrder)}${min ? '' : ' (записано текстом, тому автоматично не рахується)'}</p>` : ''}
    ${s && !s.minOrder && min ? `<p class="cg-note muted">Мінімальне замовлення: ${esc(minOrderLabel(min))}</p>` : ''}
    <div class="ci-list">${g.items.map(i => itemRow(i, g)).join('')}</div>
    ${s ? `<footer class="cg-foot"><div><span class="k">Сума обраних товарів</span><b>${fmtMoney(g.goods)}${g.incomplete ? ' <span class="pill warn">неповна</span>' : ''}</b></div>
      <label class="cg-deliv"><span class="k">Орієнтовна доставка, ₴</span><input class="input" id="cart-d-${sid}" data-act="cart-deliv" data-sid="${sid}" inputmode="decimal" value="${money(g.delivery)}" placeholder="Не врахована"></label>
      <div><span class="k">Разом із доставкою</span><b>${fmtMoney(g.total)}</b><span class="muted small">${g.delivery === null ? 'Доставка не врахована' : g.delivery === 0 ? 'Доставка безкоштовна' : ''}</span></div></footer>` : ''}
  </section>`;
}
function summaryHtml(t, gs) {
  const n = t.suppliers; const label = n === 1 ? 'Створити закупівлю' : 'Створити закупівлі';
  return `<aside class="cart-sum" aria-label="Підсумок кошика">
    <h2 class="cs-h">Підсумок</h2>
    <dl class="cs-kv"><dt>Обрано позицій</dt><dd>${t.positions}</dd><dt>Постачальників</dt><dd>${t.suppliers}</dd>
      <dt>Товари</dt><dd>${fmtMoney(t.goods)}${t.incomplete ? ' <span class="pill warn">неповна</span>' : ''}</dd>
      <dt>Доставка</dt><dd>${t.suppliers && t.noDelivery.length === t.suppliers ? 'Не врахована' : fmtMoney(t.delivery)}</dd></dl>
    <div class="cs-total"><span>Разом орієнтовно</span><b>${fmtMoney(t.total)}</b></div>
    ${t.noDelivery.length && t.suppliers ? `<p class="cs-note">Доставку не враховано для: ${t.noDelivery.map(g => esc(g.supplier ? g.supplier.name : 'без постачальника')).join(', ')}.</p>` : ''}
    ${t.incomplete ? `<p class="cs-note">Сума неповна: ${t.noPrice.length} ${plural(t.noPrice.length, 'позиція', 'позиції', 'позицій')} без закупівельної ціни.</p>` : ''}
    <button type="button" class="btn primary cs-go" data-act="cart-create" ${t.positions && !UI.cartBusy ? '' : 'aria-disabled="true"'}>${UI.cartBusy ? 'Створення…' : label}</button>
    <p class="cs-note muted">Закупівлі створюються зі статусом «Заплановано». Нічого не надсилається постачальникам.</p>
  </aside>
  <div class="cart-bar" aria-hidden="false"><div><span class="k">${t.positions} ${plural(t.positions, 'позиція', 'позиції', 'позицій')} · ${t.suppliers} ${plural(t.suppliers, 'постачальник', 'постачальники', 'постачальників')}</span><b>${fmtMoney(t.total)}${t.incomplete || t.noDelivery.length ? '*' : ''}</b></div><button type="button" class="btn primary" data-act="cart-create" ${t.positions && !UI.cartBusy ? '' : 'aria-disabled="true"'}>${UI.cartBusy ? 'Створення…' : label}</button></div>`;
}

const importBtn = `<label class="btn cart-import" title="Файл зі списком товарів з кошиків оптовиків">${svg('plus')}Імпорт у кошик<input type="file" accept=".json,application/json" data-act="cart-import-file" class="sr"></label>`;
VIEWS.cart = () => {
  const gs = groups(); const t = cartTotals(gs);
  const done = (UI.cartDone || []).filter(x => Repo.get('purchases', x.id));
  const top = `<div class="cart-top"><button type="button" class="btn ghost" data-act="cart-back">← До каталогу</button><p class="muted">Каталог → додати товари → перевірити кількості й суми → створити заплановані закупівлі за постачальниками.</p>${importBtn}</div>
    ${done.length ? `<div class="callout ok cart-done" role="status"><b>Створено ${done.length} ${plural(done.length, 'заплановану закупівлю', 'заплановані закупівлі', 'запланованих закупівель')}.</b> Вони не позначені оплаченими чи замовленими, а до бюджету вносяться кнопкою «Внести в бюджет» у закупівлі.<div class="row">${done.map(x => `<button type="button" class="btn sm" data-act="edit-purchase" data-id="${x.id}">${esc(x.title)}</button>`).join('')}<button type="button" class="btn sm ghost" data-act="go-purchases">Усі закупівлі</button></div></div>` : ''}
    ${UI.cartError ? `<div class="callout bad" role="alert">${esc(UI.cartError)}</div>` : ''}`;
  if (!gs.length) return top + `<div class="empty cart-empty"><p>Кошик порожній. Додайте товари кнопкою «До кошика» в каталозі.</p><div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="cart-back">Перейти до каталогу</button>${importBtn}</div></div>`;
  return top + `<div class="cart-layout"><div class="cart-groups">${gs.map(groupHtml).join('')}</div>${summaryHtml(t, gs)}</div>`;
};

/* ---------- дії ---------- */
function issuesDialog(t) {
  const rows = [
    ...(t.noPrice.length ? [`<p>Уточніть закупівельну ціну або зніміть вибір із ${t.noPrice.length === 1 ? 'позиції' : 'позицій'}:</p><ul>${t.noPrice.map(i => `<li>${esc(i.name)}</li>`).join('')}</ul>`] : []),
    ...(t.noSupplier ? ['<p>Для товарів у групі «Без постачальника» оберіть постачальника або зніміть з них вибір.</p>'] : []),
  ];
  openModal({ title: 'Перед створенням закупівель', narrow: true, body: `<div class="modal-b">${rows.join('')}</div>`, foot: '<div class="modal-f"><button class="btn primary" data-close>Зрозуміло</button></div>' });
}
function confirmCreate() {
  if (UI.cartBusy) return;
  const gs = groups(); const t = cartTotals(gs);
  if (!t.positions) return;
  if (t.noPrice.length || t.noSupplier) return issuesDialog(t);
  const active = gs.filter(g => g.selected.length);
  const n = active.length;
  const warn = active.flatMap(g => minOrderProgress(minOrderOf(g.supplier), g.selected).filter(x => !x.ok).map(x => `<li>${esc(g.supplier.name)}: ${x.text}.</li>`));
  openModal({ title: n === 1 ? 'Створити закупівлю' : 'Створити закупівлі', narrow: true,
    body: `<form class="modal-b" id="cart-create" novalidate><p style="margin:0"><b>Буде створено ${n} ${plural(n, 'заплановану закупівлю', 'заплановані закупівлі', 'запланованих закупівель')} у ${n} ${plural(n, 'постачальника', 'постачальників', 'постачальників')}.</b></p>
      <ul class="cc-list">${active.map(g => `<li><span>${esc(g.supplier.name)} · ${g.selected.length} ${plural(g.selected.length, 'позиція', 'позиції', 'позицій')}</span><b>${fmtMoney(g.total)}</b>${g.delivery === null ? '<span class="muted small">доставка не врахована</span>' : ''}</li>`).join('')}</ul>
      ${warn.length ? `<div class="callout warn"><b>Мінімальне замовлення ще не досягнуто:</b><ul>${warn.join('')}</ul>Закупівлі все одно можна створити як чернетки.</div>` : ''}
      <label class="field"><span class="lbl">Коментар до закупівель (необов’язково)</span><textarea class="input" name="comment" rows="2"></textarea></label>
      <p class="small muted" style="margin:0">Необрані позиції залишаться в кошику. Нічого не надсилається постачальникам.</p></form>`,
    foot: `<div class="modal-f"><button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="submit" form="cart-create">${n === 1 ? 'Створити закупівлю' : 'Створити закупівлі'}</button></div>`,
    onMount: m => { m.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const btn = m.querySelector('[type=submit]'); if (btn.disabled) return; btn.disabled = true; btn.textContent = 'Створення…'; createPurchases(e.target.comment.value.trim()); }); } });
}
/** Створює по одній закупівлі на постачальника. Кожна — разом із прибиранням своїх позицій з кошика. */
async function createPurchases(comment) {
  if (UI.cartBusy) return; UI.cartBusy = true; UI.cartError = ''; UI.cartDone = [];
  const created = [];
  try {
    for (const g of groups().filter(x => x.selected.length && x.supplierId)) {
      const title = `${g.supplier.name}: закупівля з кошика ${fmtDate(todayISO())}`;
      const pur = purchaseFromGroup(g, { title, comment });
      const drop = g.selected.map(i => i.id);
      if (g.selected.length === g.items.length) drop.push(deliveryId(g.supplierId));
      await Repo.transferCart(pur, drop);
      if (!Repo.status.cloud && Repo.status.lastError) throw new Error('браузер не зміг записати дані');
      created.push({ id: pur.id, title });
    }
  } catch (e) {
    UI.cartError = `Не вдалося створити всі закупівлі (${e.message}). ${created.length ? `Створено ${created.length}, їхні позиції прибрано з кошика. ` : ''}Решта позицій лишилась у кошику, повторне створення не продублює вже створені.`;
  }
  UI.cartBusy = false; UI.cartDone = created;
  closeModal(); render();
  if (created.length && !UI.cartError) toast(created.length === 1 ? 'Закупівлю створено' : `Створено закупівель: ${created.length}`);
}
let render = () => {};
export const bindCartRender = fn => { render = fn; };

const num = v => parseNum(String(v ?? ''));
export const CART_ACTIONS = {
  'cart-add': el => addToCart(el.dataset.id),
  'cart-noop': () => {}, // клік поруч із кнопками кількості не відкриває товар
  'cart-inc': el => stepCart(el.dataset.id, 1),
  'cart-dec': el => { if (el.getAttribute('aria-disabled') !== 'true') stepCart(el.dataset.id, -1); },
  'cart-del': async el => { const it = Repo.get('cart', el.dataset.id); if (!it) return; await Repo.remove('cart', it.id); toast('Позицію прибрано з кошика', null, () => Repo.create('cart', it)); },
  'cart-refresh': async el => { const it = Repo.get('cart', el.dataset.id); const p = it && Repo.get('products', it.productId); if (p) { await Repo.update('cart', it.id, refreshFromProduct(it, p)); toast('Позицію оновлено з каталогу'); } },
  'cart-keep': async el => { const it = Repo.get('cart', el.dataset.id); const p = it && Repo.get('products', it.productId); if (p) await Repo.update('cart', it.id, { src: refreshFromProduct(it, p).src }); },
  'cart-copy': el => { if (el.getAttribute('aria-disabled') === 'true') return toast('Оберіть хоча б один товар цього постачальника'); const g = groups().find(x => (x.supplierId || 'none') === el.dataset.sid); if (g) copyText(supplierListText(g)); },
  'cart-create': el => { if (el.getAttribute('aria-disabled') !== 'true') confirmCreate(); },
  'go-cart': () => { UI.catalogScroll = UI.page === 'products' ? window.scrollY : 0; UI.cartDone = []; UI.cartError = ''; },
};
/** Зміни полів і прапорців кошика (подія change). */
/** Перегляд імпорту: що додасться, що вже є, і лише після «Додати» запис. */
async function importCartFile(file) {
  if (!file) return;
  let obj; try { if (file.size > 2 * 1024 * 1024) throw new Error(); obj = JSON.parse(await file.text()); } catch { return toast('Файл не вдалося прочитати. Потрібен файл імпорту в кошик (.json).', 'error'); }
  const res = planCartImport(obj, D());
  if (!res.ok) return openModal({ title: 'Файл не підходить', narrow: true, body: `<div class="modal-b"><div class="callout bad"><ul style="margin:0;padding-left:18px">${res.errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div><p class="small muted" style="margin:0">Нічого не змінено.</p></div>`, foot: '<div class="modal-f"><button class="btn" data-close>Закрити</button></div>' });
  const { plan } = res; const bySup = new Map();
  for (const l of plan.lines) { const g = bySup.get(l.supplier) || { n: 0, sum: 0, skip: 0, lines: [] }; g.lines.push(l); if (l.inCart) g.skip++; else { g.n++; g.sum += (l.price ?? 0) * l.qty; } bySup.set(l.supplier, g); }
  const newP = plan.products.length, skip = plan.lines.filter(l => l.inCart).length, diff = plan.lines.filter(l => !l.isNewProduct && isNum(l.catalogPrice) && l.catalogPrice !== l.price);
  const qtyLabel = l => (l.pack ? `${fmtNum(l.qty)} ${packWord(l.qty)}${isNum(l.packQty) ? ` × ${fmtNum(l.packQty)}` : ''}` : `${fmtNum(l.qty)} ${unitShort(l.unit)}`);
  openModal({ title: 'Імпорт у кошик', wide: true,
    body: `<div class="modal-b imp">${obj.note ? `<p class="small muted" style="margin:0">${esc(String(obj.note).slice(0, 300))}</p>` : ''}
      <p style="margin:0"><b>До кошика додасться ${plan.cart.length} ${plural(plan.cart.length, 'позиція', 'позиції', 'позицій')}</b> від ${bySup.size} ${plural(bySup.size, 'постачальника', 'постачальників', 'постачальників')}. Нових товарів у каталозі: ${newP}, нових постачальників: ${plan.newSuppliers}.${skip ? ` Уже в кошику, пропускаються: ${skip}.` : ''}</p>
      ${diff.length ? `<div class="callout warn">${diff.length} ${plural(diff.length, 'товар уже є', 'товари вже є', 'товарів уже є')} у каталозі з іншою ціною. Ціна з файлу піде лише в кошик, каталог не зміниться.</div>` : ''}
      ${[...bySup].map(([name, g]) => `<details class="imp-g"><summary><b>${esc(name)}</b><span>${g.n} ${plural(g.n, 'позиція', 'позиції', 'позицій')} · ${fmtMoney(g.sum)}${g.skip ? ` · ${g.skip} уже в кошику` : ''}</span></summary>
        <ul>${g.lines.map(l => `<li class="${l.inCart ? 'muted' : ''}"><span>${esc(l.name)}${l.isNewProduct ? '' : ' <span class="pill">є в каталозі</span>'}${l.inCart ? ' <span class="pill">уже в кошику</span>' : ''}</span><span class="num">${qtyLabel(l)} · ${isNum(l.price) ? fmtMoney(l.price) : 'ціну уточнити'}</span></li>`).join('')}</ul></details>`).join('')}
      <p class="small muted" style="margin:0">Наявні товари й постачальники не змінюються. Нічого не надсилається постачальникам.</p></div>`,
    foot: `<div class="modal-f"><button class="btn" type="button" data-close>Скасувати</button><button class="btn primary" type="button" data-imp-ok ${plan.cart.length || newP ? '' : 'disabled'}>Додати до кошика</button></div>`,
    onMount: m => { m.querySelector('[data-imp-ok]').onclick = async e => {
      const b = e.currentTarget; if (b.disabled) return; b.disabled = true; b.textContent = 'Додавання…';
      try {
        await Repo.importCart(plan);
        if (!Repo.status.cloud && Repo.status.lastError) throw new Error('браузер не зміг записати дані');
        closeModal(); toast(`Додано до кошика: ${plan.cart.length}`);
      } catch (ex) { b.disabled = false; b.textContent = 'Додати до кошика'; toast(`Не вдалося імпортувати: ${ex.message}`, 'error'); }
    }; } });
}
export const CART_CHANGE = {
  'cart-import-file': el => { const f = el.files[0]; el.value = ''; importCartFile(f); },
  'cart-sel': el => Repo.update('cart', el.dataset.id, { selected: el.checked }),
  'cart-sel-all': el => { const g = groups().find(x => (x.supplierId || 'none') === el.dataset.sid); if (g) Repo.updateMany('cart', g.items.map(i => ({ id: i.id, fields: { selected: el.checked } }))); },
  'cart-qty': el => { const n = num(el.value); const it = Repo.get('cart', el.dataset.id); if (!it) return;
    if (!Number.isInteger(n) || n < 1 || n > 100000) { toast('Кількість — ціле число від 1. Щоб прибрати позицію, натисніть «Видалити».', 'error'); render(); return; }
    Repo.update('cart', it.id, { qty: n }); },
  'cart-price': el => { const n = num(el.value);
    if (Number.isNaN(n) || (n !== null && n < 0)) { toast('Ціна — невід’ємне число, наприклад 120 або 120,50. Порожнє поле означає «уточнити».', 'error'); render(); return; }
    Repo.update('cart', el.dataset.id, { price: n }); },
  'cart-deliv': el => { const n = num(el.value); const sid = el.dataset.sid === 'none' ? null : el.dataset.sid;
    if (Number.isNaN(n) || (n !== null && n < 0)) { toast('Доставка — невід’ємне число. Порожнє поле — «не врахована», 0 — безкоштовна.', 'error'); render(); return; }
    const id = deliveryId(sid); if (Repo.get('cart', id)) Repo.update('cart', id, { delivery: n }); else Repo.create('cart', { id, kind: 'supplier', supplierId: sid, delivery: n }); },
  'cart-sup': el => { if (el.value) Repo.update('cart', el.dataset.id, { supplierId: el.value }); },
};
