import { describe, it, expect } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { createRepo } from '../src/core/repo.js';
import { createMemoryAdapter } from '../src/core/storage.js';
import { parseQuick, paymentSchedule, searchWorkspace, firstBuySummary } from '../src/core/workspace.js';
const data = extra => Schema.normalize({ ...Schema.empty(), ...extra });

describe('швидкий запис і пошук', () => {
  it('розпізнає суму з пробілами й залишає назву', () => { expect(parseQuick('Стелаж — 2 500 грн','2026-10-26')).toMatchObject({type:'expense',title:'Стелаж',amount:2500}); expect(parseQuick('Доставка: 150,50','2026-10-26').amount).toBe(150.5); });
  it('розпізнає відносні дати через зміну місяця та року', () => { expect(parseQuick('завтра написати','2026-12-31')).toMatchObject({type:'task',title:'написати',date:'2027-01-01'}); expect(parseQuick('післязавтра забрати','2026-10-31').date).toBe('2026-11-02'); });
  it('не плутає телефон із сумою й не зберігає від’ємну суму', () => { expect(parseQuick('Телефон +380671234567').amount).toBeNull(); expect(parseQuick('Повернення — -100 грн').type).toBe('note'); });
  it('не перетворює неіснуючу календарну дату', () => { expect(parseQuick('Оплата 31.02.2026','2026-01-01').date).toBe(''); expect(parseQuick('Оплата 28.02.2026','2026-01-01').date).toBe('2026-02-28'); });
  it('шукає всі слова в назві, тексті та контактах', () => { const d=data({notes:[{title:'Оренда',body:'Галина домовились про канікули'}],suppliers:[{name:'Milena',instagram:'@socks',phone:'067123'}]}); expect(searchWorkspace(d,'ОРЕНДА канікули')).toHaveLength(1); expect(searchWorkspace(d,'socks')[0].collection).toBe('suppliers'); expect(searchWorkspace(d,'')).toEqual([]); });
});

describe('календар платежів', () => {
  it('показує лише залишок разової витрати, оплачені виключає', () => { const rows=paymentSchedule(data({expenses:[{name:'A',planned:100,paid:30,dueDate:'2026-10-20'},{name:'B',planned:80,paid:80}]}),'2026-10-26'); expect(rows).toHaveLength(1); expect(rows[0].amount).toBe(70); });
  it('не губить невідомі суми та дати', () => { expect(paymentSchedule(data({expenses:[{name:'A'}]}),'2026-10-26')[0]).toMatchObject({amount:null,date:''}); });
  it('переносить оплату на наступний місяць і обмежує день довжиною місяця', () => { const d=data({monthly:[{name:'Оплата',amount:100,payDay:31,paidMonth:'2026-01'}]}); expect(paymentSchedule(d,'2026-01-20')[0].date).toBe('2026-02-28'); d.monthly[0].paidMonth='2026-12'; expect(paymentSchedule(d,'2026-12-20')[0].date).toBe('2027-01-31'); });
  it('оренду з приміщення враховує один раз', () => { const d=data({premises:[{id:'p',name:'Точка',rent:6000,payDay:5,status:'keys'}],monthly:[{name:'Оренда-дубль',kind:'rent',amount:6000,payDay:5}]}); const rows=paymentSchedule(d,'2026-10-26'); expect(rows).toHaveLength(1); expect(rows[0].collection).toBe('premises'); });
});

describe('перша закупівля', () => {
  it('рахує одиниці, закупівлю й доставку та не враховує скасоване', () => { const d=data({purchases:[{firstPurchase:true,items:[{name:'Шкарпетки',qty:10,unitPrice:20,retailPrice:50}],deliveryCost:30},{firstPurchase:true,status:'cancelled',items:[{name:'X',qty:10,unitPrice:500}]}]}); expect(firstBuySummary(d)).toMatchObject({cost:230,qty:10,revenue:500,gross:270}); });
  it('не показує неповний прогноз як повний', () => { const d=data({purchases:[{firstPurchase:true,items:[{name:'A',qty:1,unitPrice:20}]}]}); expect(firstBuySummary(d)).toMatchObject({revenue:null,gross:null,missing:1}); });
});

describe('скасування редагувань', () => {
  const repo = async () => { const r=createRepo(); await r.open('real',createMemoryAdapter()); return r; };
  it('відновлює попередню ціну, зберігаючи інші подальші зміни', async () => { const r=await repo(); const p=await r.create('products',{name:'A',retailPrice:50}); await r.update('products',p.id,{retailPrice:60}); const change=r.changes[0]; await r.update('products',p.id,{name:'B'}); await r.undoChange(change.id); expect(r.get('products',p.id)).toMatchObject({retailPrice:50,name:'B'}); });
  it('не перезаписує новішу зміну тієї самої ціни', async () => { const r=await repo(); const p=await r.create('products',{name:'A',retailPrice:50}); await r.update('products',p.id,{retailPrice:60}); const change=r.changes[0]; await r.update('products',p.id,{retailPrice:70}); await expect(r.undoChange(change.id)).rejects.toThrow('уже змінено'); expect(r.get('products',p.id).retailPrice).toBe(70); });
  it('не дозволяє повторне скасування й очищує історію при зміні набору даних', async () => { const r=await repo(); const n=await r.create('notes',{title:'A'}); await r.update('notes',n.id,{title:'B'}); const change=r.changes[0]; await r.undoChange(change.id); await expect(r.undoChange(change.id)).rejects.toThrow(); await r.open('demo',createMemoryAdapter()); expect(r.changes).toEqual([]); });
});
