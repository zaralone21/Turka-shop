import { describe, it, expect } from 'vitest';
import { createCloudAdapter, stateToRows, rowsToState } from '../src/core/cloudAdapter.js';
import { migrateLocalToCloud } from '../src/core/cloud.js';
import { createRepo } from '../src/core/repo.js';
import { Schema } from '../src/core/schema.js';
import { createFakeDb, memCache } from './helpers/fakeSupabase.js';

const openRepo = async (db, user, cache = memCache()) => {
  const repo = createRepo();
  await repo.open('real', createCloudAdapter({ client: db.clientFor(user), userId: user, cache }));
  return repo;
};

describe('хмарне сховище', () => {
  it('стан ↔ рядки без втрат', () => {
    const d = Schema.empty(); d.suppliers.push(Schema.normalizeRecord('suppliers', { id: 's1', name: 'А' }));
    d.reminders.push(Schema.normalizeRecord('reminders', { id: 'r1', title: 'Подзвонити', date: '2026-10-23', time: '10:00' }));
    const rows = [...stateToRows(d).values()];
    expect(rows.find(r => r.id === 'r1').due_at).toBe('2026-10-23T07:00:00.000Z');
    const back = rowsToState(rows.map(r => ({ ...r, deleted: false })));
    expect(back.suppliers[0].name).toBe('А');
    expect(back.settings).toEqual(d.settings);
  });

  it('зберігає лише змінені записи', async () => {
    const db = createFakeDb(); const repo = await openRepo(db, 'u1');
    await repo.create('tasks', { title: 'Перша' });
    const before = JSON.stringify([...db.rows.values()].map(r => r.updated_at));
    await repo.create('notes', { title: 'Нотатка', body: '' });
    const notes = [...db.rows.values()].filter(r => r.collection === 'notes');
    expect(notes).toHaveLength(1);
    // попередні рядки не перезаписувались
    const tasks = [...db.rows.values()].filter(r => r.collection === 'tasks');
    expect(before).toContain(tasks[0].updated_at);
  });

  it('синхронізація між двома пристроями того самого користувача', async () => {
    const db = createFakeDb();
    const phone = await openRepo(db, 'u1'); const laptop = await openRepo(db, 'u1');
    const t = await phone.create('tasks', { title: 'Замовити тапки' });
    await laptop.resync();
    expect(laptop.get('tasks', t.id).title).toBe('Замовити тапки');
    await laptop.update('tasks', t.id, { status: 'done' });
    await phone.resync();
    expect(phone.get('tasks', t.id).status).toBe('done');
    await phone.remove('tasks', t.id);
    await laptop.resync();
    expect(laptop.get('tasks', t.id)).toBeNull();
    expect([...db.rows.values()].find(r => r.id === t.id).deleted).toBe(true);
  });

  it('зміна з іншого пристрою через realtime не відправляється назад', async () => {
    const db = createFakeDb();
    const a = await openRepo(db, 'u1'); const b = await openRepo(db, 'u1');
    const t = await a.create('tasks', { title: 'X' });
    const row = [...db.rows.values()].find(r => r.id === t.id);
    b.applyRemote('tasks', t.id, row.data, false); b.adapter.markSynced('tasks', t.id, b.get('tasks', t.id), false);
    expect(b.adapter.hasPending(b.data)).toBe(false);
  });

  it('старіша зміна з мережі не перезаписує новішу локальну', () => {
    const repo = createRepo();
    return repo.open('real', { kind: 'memory', load: async () => null, save: async () => {} }).then(async () => {
      const t = await repo.create('tasks', { title: 'Нова назва' });
      expect(repo.applyRemote('tasks', t.id, { ...t, title: 'Стара', updatedAt: '2000-01-01T00:00:00.000Z' }, false)).toBe(false);
      expect(repo.get('tasks', t.id).title).toBe('Нова назва');
    });
  });

  it('ізоляція: інший користувач не бачить і не може записати чужі дані', async () => {
    const db = createFakeDb();
    const a = await openRepo(db, 'alice'); await a.create('suppliers', { name: 'Секретний постачальник' });
    const b = await openRepo(db, 'bob');
    expect(b.data.suppliers).toHaveLength(0);
    const { error } = await db.clientFor('bob').from('records').upsert([{ user_id: 'alice', collection: 'tasks', id: 'x', data: {} }]);
    expect(error).toBeTruthy();
  });

  it('без інтернету зміни лишаються на пристрої й досилаються пізніше', async () => {
    const db = createFakeDb(); const cache = memCache();
    const repo = await openRepo(db, 'u1', cache);
    db.setOffline(true);
    const t = await repo.create('tasks', { title: 'Офлайн' });
    expect(repo.status.sync).toBe('offline');
    expect([...db.rows.values()].some(r => r.id === t.id)).toBe(false);
    // Сторінку перезавантажили, інтернету ще немає → дані з локальної копії
    const again = await openRepo(db, 'u1', cache);
    expect(again.get('tasks', t.id).title).toBe('Офлайн');
    db.setOffline(false);
    await again.resync();
    expect([...db.rows.values()].find(r => r.id === t.id).data.title).toBe('Офлайн');
    // Новий пристрій бачить запис
    const other = await openRepo(db, 'u1');
    expect(other.get('tasks', t.id)).not.toBeNull();
  });
});

describe('перенесення записів із браузера', () => {
  const legacy = () => {
    const d = Schema.empty(); d.settings.totalBudget = 150000;
    d.suppliers.push(Schema.normalizeRecord('suppliers', { id: 's1', name: 'Шкарпетки опт' }));
    d.products.push(Schema.normalizeRecord('products', { id: 'p1', name: 'Шкарпетки', supplierId: 's1', purchasePrice: 25 }));
    d.expenses.push(Schema.normalizeRecord('expenses', { id: 'e1', title: 'Оренда', amount: 12000, status: 'paid', categoryId: 'rent' }));
    return d;
  };
  it('переносить усе й підтверджує перевіркою на сервері', async () => {
    const db = createFakeDb(); const repo = await openRepo(db, 'u1');
    const reload = async () => rowsToState([...db.rows.values()].filter(r => r.user_id === 'u1'));
    const r = await migrateLocalToCloud(repo, legacy(), reload);
    expect(r).toMatchObject({ added: 3, verified: true, missing: [] });
    expect(repo.data.settings.totalBudget).toBe(150000);
    const fresh = await openRepo(db, 'u1');
    expect(fresh.get('products', 'p1').purchasePrice).toBe(25);
  });
  it('повторне перенесення не дублює записи і не чіпає наявні налаштування', async () => {
    const db = createFakeDb(); const repo = await openRepo(db, 'u1');
    await repo.setSettings({ totalBudget: 99000 });
    const reload = async () => rowsToState([...db.rows.values()]);
    await migrateLocalToCloud(repo, legacy(), reload);
    const r2 = await migrateLocalToCloud(repo, legacy(), reload);
    expect(r2.added).toBe(0);
    expect(repo.data.suppliers).toHaveLength(1);
    expect(repo.data.settings.totalBudget).toBe(99000);
  });
  it('без зв’язку повідомляє про помилку і не позначає перенесення успішним', async () => {
    const db = createFakeDb(); const repo = await openRepo(db, 'u1');
    db.setOffline(true);
    const r = await migrateLocalToCloud(repo, legacy(), async () => null);
    expect(r.verified).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
