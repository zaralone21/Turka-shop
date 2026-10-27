import { Calc } from '../core/calc.js';
import { parseQuick, searchWorkspace, paymentSchedule, firstBuySummary, SEARCH_COLLECTIONS } from '../core/workspace.js';
import { Repo } from '../core/repo.js';
import { esc, fmtMoney, fmtDate, fmtKyiv, todayISO, isNum } from '../core/utils.js';
import { D, VIEWS, toast, supplierName } from './shared.js';
import { ACTIONS } from './events.js';
import { F, openModal, closeModal, formModal, g, moneyField, dateField, confirmDialog, modalEl } from './modal.js';
import { purchaseForm } from './forms.js';
import { svg, render } from './shell.js';

export function searchDialog() {
  openModal({ title: 'Пошук у всіх записах', body: `<div class="modal-b"><input class="input" id="workspace-search" aria-label="Пошук у всіх записах" placeholder="Назва, контакт, артикул або слово з нотатки…"><div id="workspace-results" class="workspace-results" role="status">Введіть запит.</div></div>`, onMount: m => {
    const input = m.querySelector('input'), results = m.querySelector('#workspace-results');
    input.oninput = () => {
      const found = searchWorkspace(D(), input.value);
      results.innerHTML = !input.value.trim() ? 'Введіть запит.' : !found.length ? 'Нічого не знайдено.' : found.map((r, i) => `<button class="search-result" data-result="${i}"><small>${r.label}</small><b>${esc(r.title)}</b><span>${esc(r.detail)}</span></button>`).join('');
      results.querySelectorAll('button').forEach(b => b.onclick = () => { const r = found[+b.dataset.result]; closeModal(); ACTIONS['open-ref']({ dataset: { col: r.collection, id: r.id } }); });
    };
  } });
}

export function quickRecord(raw = '') {
  openModal({ title: 'Швидкий запис', body: `<form class="modal-b" id="quick-entry"><label class="field"><span class="lbl">Що потрібно записати?</span><input class="input" name="text" value="${esc(raw)}" placeholder="Стелаж — 2 500 грн або завтра написати постачальнику" required></label><p class="small muted">Далі перевірите тип запису, назву, суму й дату.</p><button class="btn primary" type="submit">Далі</button></form>`, onMount: m => {
    m.querySelector('form').onsubmit = e => { e.preventDefault(); const text = m.querySelector('input').value.trim(); if (text) quickReview(text); };
  } });
}
function quickReview(raw) {
  const p = parseQuick(raw);
  formModal({ title: 'Перевірте запис', fields: `${F.select('type', 'Зберегти як', p.type, [['note','Нотатка'],['task','Завдання'],['expense','Планова витрата']], { full: true })}${F.text('title','Назва',p.title,{ full:true,req:true })}${F.money('amount','Планова сума, ₴',p.amount)}${F.date('date','Дата',p.date)}<p class="small muted full" id="quick-hint"></p>`,
    onMount: m => { const type = m.querySelector('[name=type]'), amount = m.querySelector('[name=amount]'), date = m.querySelector('[name=date]'); const update = () => { amount.closest('.field').hidden = type.value !== 'expense'; date.closest('.field').hidden = type.value === 'note'; m.querySelector('#quick-hint').textContent = type.value === 'expense' ? 'Це запланована витрата, не позначка про оплату. Дата — термін платежу.' : type.value === 'task' ? 'Дата — термін завдання. Можна залишити порожньою.' : 'Початковий текст збережеться в нотатці.'; }; type.onchange = update; update(); },
    read: fd => { const errors = {}, type = g(fd,'type'), title = g(fd,'title'); if (!title) errors.title = 'Вкажіть назву.'; const amount = type === 'expense' ? moneyField(fd,'amount',errors) : null; if (type === 'expense' && amount === null) errors.amount = 'Вкажіть суму.'; const date = type !== 'note' ? dateField(fd,'date',errors) : ''; return { errors, values: { type,title,amount,date } }; },
    save: async v => { const input=document.getElementById('home-quick'); if(input)input.value=''; if (v.type === 'expense') await Repo.create('expenses',{ name:v.title,categoryId:'other',planned:v.amount,paid:0,dueDate:v.date }); else if (v.type === 'task') await Repo.create('tasks',{title:v.title,deadline:v.date,status:'planned',priority:'medium'}); else await Repo.create('notes',{title:v.title,body:raw}); toast('Запис збережено'); }
  });
}

const FIELD_NAMES = { purchasePrice:'Закупівельна ціна',retailPrice:'Роздрібна ціна',planned:'Планова сума',paid:'Сплачено',amount:'Сума',status:'Статус',deadline:'Дедлайн',dueDate:'Термін платежу',title:'Назва',name:'Назва',payDay:'День оплати',paidMonth:'Оплачений місяць',rentPaidMonth:'Оплачений місяць оренди',items:'Позиції закупівлі',firstPurchase:'Перша закупівля',body:'Текст',pinned:'Закріплено' };
const display = v => v === null || v === '' ? '—' : typeof v === 'object' ? 'Список або деталі запису' : String(v).slice(0,120);
export function historyDialog() {
  const log = Repo.changes;
  openModal({ title:'Історія змін цього сеансу',body:`<div class="modal-b"><p class="small muted">До 60 останніх редагувань на цьому пристрої. Після перезавантаження або зміни облікового запису історія очищується. Фото, файли й видалення сюди не входять.</p>${log.length ? log.map(x => `<article class="change-row"><small>${esc(SEARCH_COLLECTIONS[x.collection] || x.collection)} · ${esc(fmtKyiv(x.date))}</small><b>${esc(x.title)}</b>${Object.keys(x.next).map(k => `<div class="small"><span class="muted">${esc(FIELD_NAMES[k] || k)}:</span> ${esc(display(x.previous[k]))} → ${esc(display(x.next[k]))}</div>`).join('')}<button class="btn sm" data-undo="${x.id}" ${x.undone ? 'disabled' : ''}>${x.undone ? 'Скасовано' : 'Скасувати зміну'}</button></article>`).join('') : '<p>У цьому сеансі редагувань ще не було.</p>'}</div>`,onMount:m=>m.querySelectorAll('[data-undo]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try { await Repo.undoChange(b.dataset.undo); toast('Зміну скасовано'); historyDialog(); } catch(e) {toast(e.message,'error'); b.disabled=false;} }) });
}

VIEWS.payments = () => {
  const today=todayISO(), rows=paymentSchedule(D(),today), dated=rows.filter(x=>x.date), unknown=rows.filter(x=>!x.date);
  const next7=new Date(today+'T12:00:00Z'); next7.setUTCDate(next7.getUTCDate()+7); const until=next7.toISOString().slice(0,10);
  const near=dated.filter(x=>x.date<=until), total=near.reduce((s,x)=>s+(x.amount||0),0);
  const row=x=>`<div class="payment-row"><div><b>${esc(x.title)}</b><small>${x.kind} · ${x.date?fmtDate(x.date):'Термін не задано'}${x.date && x.date<today?' · оплату не позначено':''}</small>${x.paidMonth?`<small>Позначено оплату за ${x.paidMonth} <button class="btn link" data-act="payment-unmark" data-col="${x.collection}" data-id="${x.id}">Прибрати позначку</button></small>`:''}</div><strong>${x.amount===null?'Сума не задана':fmtMoney(x.amount)}</strong><button class="btn sm" data-act="open-ref" data-col="${x.collection}" data-id="${x.id}">Змінити</button>${x.date && isNum(x.amount) ? `<button class="btn sm" data-act="payment-paid" data-col="${x.collection}" data-id="${x.id}">Сплачено</button>`:''}</div>`;
  const groups=[['Минулі дати без позначки оплати',dated.filter(x=>x.date<today)],['Сьогодні та наступні 7 днів',dated.filter(x=>x.date>=today && x.date<=until)],['Пізніше',dated.filter(x=>x.date>until)],['Без дати',unknown]];
  return `<div class="page-head"><p>Разові платежі та найближча оплата щомісячних витрат.</p><button class="btn" data-act="add-expense">+ Витрата</button></div><div class="panel"><span class="small muted">До ${fmtDate(until)}, включно з минулими датами</span><h2 class="payment-total">${fmtMoney(total)}</h2><p class="small muted">${near.filter(x=>x.amount===null).length ? 'Частина сум не задана й не входить у підсумок. ' : ''}Щомісячні платежі показані за поточний місяць; давні борги не визначаються автоматично.</p></div>${rows.length?groups.filter(([,xs])=>xs.length).map(([title,xs])=>`<section class="panel"><h2>${title}</h2>${xs.map(row).join('')}</section>`).join(''):'<div class="panel"><p>Платежів поки немає. Додайте витрату з датою або день оплати щомісячної статті.</p></div>'}`;
};

async function markPaid(el) {
  const col=el.dataset.col,id=el.dataset.id, x=paymentSchedule(D()).find(r=>r.collection===col && r.id===id); if(!x || !x.date || !isNum(x.amount)) return;
  const recurring=col!=='expenses';
  if(!await confirmDialog({title:'Позначити платіж сплаченим?',ok:'Позначити сплаченим',danger:false,text:`<p>${esc(x.title)} · ${fmtDate(x.date)} · <b>${fmtMoney(x.amount)}</b></p><p class="small muted">${recurring?'Це позначка в календарі за цей місяць. Окрему статтю бюджету не буде створено.':'У наявній витраті буде оновлено фактично сплачену суму.'} Це запис обліку, переказ грошей не виконується.</p>`})) return;
  if(recurring) await Repo.update(col,id,{[col==='premises'?'rentPaidMonth':'paidMonth']:x.month});
  else {const e=Repo.get(col,id); if(e && isNum(e.planned)) await Repo.update(col,id,{paid:Math.max(e.planned,e.paid||0)});}
  toast('Оплату записано. Скасування доступне в історії змін.');
}

VIEWS.firstbuy = () => {
  const s=firstBuySummary(D());
  return `<div class="page-head"><p>Один список для стартового асортименту. Позначайте наявні закупівлі як перші або створіть нову.</p><button class="btn primary" data-act="first-buy-add">+ Додати закупівлю</button></div><div class="tiles"><div class="tile"><span class="k">${s.costIncomplete ? 'Відома сума закупівлі' : 'Закупівля з доставкою'}</span><b class="v">${fmtMoney(s.cost)}</b></div><div class="tile"><span class="k">Одиниць товару</span><b class="v">${s.qty}</b></div><div class="tile"><span class="k">Потенційна виручка</span><b class="v">${s.revenue===null?'—':fmtMoney(s.revenue)}</b></div></div><p class="small muted">${s.missing ? `${s.missing} позицій без кількості або цін: прогноз не розраховується. ` : ''}Виручка передбачає продаж усього за вказаною ціною. ${s.gross!==null ? 'Різниця після закупівлі й доставки: '+fmtMoney(s.gross)+', до інших витрат.' : ''} Закупівлі включаються в бюджет лише кнопкою «Внести в бюджет».</p>${s.orders.length?s.orders.map(p=>`<section class="panel"><div class="panel-head"><h2>${esc(p.title)}</h2><button class="btn sm" data-act="edit-purchase" data-id="${p.id}">Змінити</button></div><p class="small muted">${esc(supplierName(p.supplierId)||'Постачальник не вказаний')} · доставка ${fmtMoney(p.deliveryCost || 0)}</p>${!p.expenseId ? `<button class="btn sm" data-act="purchase-to-budget" data-id="${p.id}">Внести в бюджет</button>` : ''}${(()=>{const t=Calc.purchaseLines(p);const ln=new Map(t.lines.map(l=>[l.id,l]));const dc=t.discountPct>0;return `${dc?`<p class="small muted">Знижка постачальника ${String(t.discountPct).replace('.',',')}%: −${fmtMoney(t.discount)}, товари до оплати ${fmtMoney(t.items)}.</p>`:''}<div class="table-wrap firstbuy-table"><table class="t"><thead><tr><th>Товар</th><th>К-сть</th><th>Закупівля / од.</th>${dc?'<th>Зі знижкою / од.</th>':''}<th>Роздріб / од.</th><th>Закупівля разом</th></tr></thead><tbody>${p.items.map(i=>{const l=ln.get(i.id);return `<tr><td>${esc(i.name)}</td><td>${i.qty??'—'}</td><td>${i.unitPrice===null?'—':fmtMoney(i.unitPrice)}</td>${dc?`<td>${l?fmtMoney(l.unitNet):'—'}</td>`:''}<td>${i.retailPrice==null?'—':fmtMoney(i.retailPrice)}</td><td>${l?fmtMoney(l.net):'—'}</td></tr>`;}).join('')}</tbody></table></div>`;})()}</section>`).join(''):'<div class="panel"><p>Стартовий список порожній. У формі закупівлі є позначка «Перша закупівля до відкриття».</p></div>'}`;
};

Object.assign(ACTIONS, {
  'workspace-search':searchDialog,'quick-record':()=>quickRecord(),'change-history':historyDialog,'payment-paid':markPaid,
  'first-buy-add':()=>purchaseForm(null,{firstPurchase:true,title:'Перша закупівля'}),
  'payment-unmark':async el=>{const col=el.dataset.col; if(!['monthly','premises'].includes(col))return; if(await confirmDialog({title:'Прибрати позначку оплати?',ok:'Прибрати',danger:false,text:'<p>Поточний місяць знову з’явиться в календарі без позначки оплати. Суми бюджету не зміняться.</p>'})){await Repo.update(col,el.dataset.id,{[col==='premises'?'rentPaidMonth':'paidMonth']:''});toast('Позначку прибрано');}},
  'toggle-store-open':async()=>{ const opened=!!D().settings.storeOpened; if(await confirmDialog({title:opened?'Повернути підготовку на головну?':'Магазин уже відкрито?',ok:opened?'Повернути':'Так, відкрито',danger:false,text:'<p>Зміниться лише видимість блоку підготовки на головній. План і записи залишаться в розділі відкриття.</p>'})){await Repo.setSettings({storeOpened:!opened});render();} }
});

document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k' && !modalEl){e.preventDefault();searchDialog();}});
document.addEventListener('submit',e=>{if(e.target.dataset.form==='workspace-quick'){e.preventDefault(); const value=e.target.elements.q.value.trim(); if(value) quickReview(value);}});



