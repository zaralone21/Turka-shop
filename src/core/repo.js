import { Demo } from './demo.js';
import { Schema } from './schema.js';
import { createLocalStorageAdapter, createMemoryAdapter, localStorageWorks } from './storage.js';
import { KEYS, SCHEMA_VERSION, nowISO, uid } from './utils.js';

/* Репозиторій: єдина точка змін даних. Інтерфейс викликає лише ці методи.
   Адаптер сховища підставляється ззовні: браузер, пам'ять або хмара (Supabase). */
export function createRepo() {
  let adapter = null, data = null, listeners = [], retryTimer = null, saving = null, again = false;
  let changeLog = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  function remember(name, before, after, fields) {
    if (!before || !after || name === 'chats' || name === 'cart') return;
    const keys = Object.keys(fields).filter(k => !['id', 'createdAt', 'updatedAt', 'photos', 'files'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (!keys.length) return;
    const previous = {}, next = {};
    for (const k of keys) { previous[k] = before[k] ?? null; next[k] = after[k] ?? null; }
    changeLog.unshift({ id: uid(), collection: name, recordId: after.id, title: after.name || after.title || 'Запис', date: nowISO(), previous: clone(previous), next: clone(next), undone: false });
    changeLog = changeLog.slice(0, 60);
  }
  const status = { persistent: true, lastError: null, demo: false, loadError: null, cloud: false, sync: 'ok' };

  /** mode: 'real' | 'demo'; customAdapter — для хмари або тестів. */
  async function open(mode, customAdapter) {
    changeLog = [];
    status.demo = mode === 'demo';
    status.cloud = !!(customAdapter && customAdapter.kind === 'cloud');
    status.loadError = null; status.lastError = null; status.sync = 'ok';
    if (customAdapter) { adapter = customAdapter; status.persistent = true; }
    else {
      const ok = localStorageWorks(); status.persistent = ok;
      adapter = ok ? createLocalStorageAdapter(status.demo ? KEYS.demo : KEYS.data) : createMemoryAdapter();
    }
    let raw = null;
    try { raw = await adapter.load(); }
    catch (e) {
      if (status.cloud) { status.sync = 'offline'; raw = adapter.cached ? adapter.cached() : null; status.loadError = raw ? null : 'Не вдалося завантажити дані з сервера. Перевірте інтернет і оновіть сторінку.'; }
      else status.loadError = 'Збережені дані пошкоджені й не прочитались. Відновіть їх з резервної копії (імпорт).';
    }
    if (raw && Number(raw.schemaVersion) > SCHEMA_VERSION) {
      status.loadError = 'Дані збережено новішою версією застосунку. Оновіть сторінку; поки що зміни не зберігатимуться.';
      status.persistent = false; adapter = createMemoryAdapter();
    }
    data = raw ? Schema.normalize(Schema.migrate(raw)) : (status.demo ? Demo.build() : Schema.empty());
    if (status.demo && !raw) await persist();
    if (status.cloud && adapter.hasPending && adapter.hasPending(data)) await persist();
    emit();
  }
  async function persist() {
    data.meta.updatedAt = nowISO();
    if (saving) { again = true; return saving; }
    saving = (async () => {
      do {
        again = false;
        if (status.cloud) status.sync = 'syncing';
        try { await adapter.save(data); status.lastError = null; status.sync = 'ok'; clearTimeout(retryTimer); }
        catch (e) {
          if (status.cloud) {
            status.sync = e && e.offline ? 'offline' : 'error';
            status.lastError = e && e.offline ? null : 'Не вдалося синхронізувати зміни. Вони збережені на цьому пристрої й будуть надіслані повторно.';
            clearTimeout(retryTimer); retryTimer = setTimeout(() => persist().then(emit), 15000);
          } else status.lastError = 'Не вдалося зберегти зміни в браузері (можливо, закінчилось місце). Зробіть експорт, щоб не втратити дані.';
        }
      } while (again);
    })();
    try { await saving; } finally { saving = null; }
  }
  const emit = () => listeners.forEach(fn => fn());
  async function mutate(fn) { fn(data); const p = persist(); emit(); await p; emit(); }

  const col = name => data[name];
  return {
    open, status, onChange: fn => listeners.push(fn),
    get data() { return data; },
    get adapter() { return adapter; },
    list: col,
    get: (name, id) => data[name].find(x => x.id === id) || null,
    async create(name, fields) { const t = nowISO(); const rec = Schema.normalizeRecord(name, { ...fields, id: fields.id || uid(), createdAt: t, updatedAt: t }); await mutate(d => d[name].push(rec)); return rec; },
    async update(name, id, fields) { await mutate(d => { const i = d[name].findIndex(x => x.id === id); if (i >= 0) { const before = d[name][i]; const after = Schema.normalizeRecord(name, { ...before, ...fields, updatedAt: nowISO() }); remember(name, before, after, fields); d[name][i] = after; } }); },
    /** Кілька змін однієї колекції одним збереженням: [{id, fields}]. */
    async updateMany(name, changes) { const t = nowISO(); await mutate(d => { for (const c of changes) { const i = d[name].findIndex(x => x.id === c.id); if (i >= 0) { const before = d[name][i]; const after = Schema.normalizeRecord(name, { ...before, ...c.fields, updatedAt: t }); remember(name, before, after, c.fields); d[name][i] = after; } } }); },
    /** Кошик → закупівля одним збереженням: нова закупівля з'являється разом із прибиранням перенесених позицій. */
    async transferCart(purchase, cartIds) {
      const rec = Schema.normalizeRecord('purchases', purchase); const drop = new Set(cartIds);
      await mutate(d => { if (d.purchases.some(x => x.id === rec.id)) return; d.purchases.push(rec); d.cart = d.cart.filter(x => !drop.has(x.id)); });
      return rec;
    },
    get changes() { return clone(changeLog); },
    async undoChange(id) {
      const item = changeLog.find(x => x.id === id);
      if (!item || item.undone) throw new Error('Цю зміну вже скасовано або її немає в історії.');
      const record = data[item.collection]?.find(x => x.id === item.recordId);
      if (!record || Object.keys(item.next).some(k => JSON.stringify(record[k] ?? null) !== JSON.stringify(item.next[k]))) throw new Error('Запис уже змінено. Відкрийте його й перевірте поточні значення.');
      await mutate(d => { const i = d[item.collection].findIndex(x => x.id === item.recordId); d[item.collection][i] = Schema.normalizeRecord(item.collection, { ...d[item.collection][i], ...item.previous, updatedAt: nowISO() }); item.undone = true; });
    },
    /** Повертає запис до попереднього стану (для «Скасувати»). Якщо prev = null — видаляє створений запис. */
    async restore(name, id, prev) { await mutate(d => { d[name] = d[name].filter(x => x.id !== id); if (prev) d[name].push(Schema.normalizeRecord(name, { ...prev, updatedAt: nowISO() })); }); },
    async remove(name, id) { await mutate(d => { d[name] = d[name].filter(x => x.id !== id); }); },
    /** Видаляє постачальника. Пов'язані товари, нотатки й закупівлі залишаються, лише відв'язуються. */
    async removeSupplier(id) {
      await mutate(d => {
        d.suppliers = d.suppliers.filter(s => s.id !== id);
        [...d.products, ...d.notes, ...d.purchases].forEach(r => { if (r.supplierId === id) { r.supplierId = null; r.updatedAt = nowISO(); } });
        d.reminders.forEach(r => { if (r.link && r.link.type === 'supplier' && r.link.id === id) { r.link = null; r.updatedAt = nowISO(); } });
      });
    },
    linkedToSupplier: id => ({ products: data.products.filter(p => p.supplierId === id), notes: data.notes.filter(n => n.supplierId === id), purchases: data.purchases.filter(p => p.supplierId === id) }),
    async setSettings(patch) { await mutate(d => Object.assign(d.settings, patch)); },
    async addBudgetCategory(name) { const c = { id: 'c-' + uid().slice(0, 8), name, builtin: false, refundable: false }; await mutate(d => d.settings.budgetCategories.push(c)); return c; },
    async renameBudgetCategory(id, name) { await mutate(d => { const c = d.settings.budgetCategories.find(x => x.id === id); if (c && !c.builtin) c.name = name; }); },
    async removeBudgetCategory(id) {
      await mutate(d => {
        const c = d.settings.budgetCategories.find(x => x.id === id); if (!c || c.builtin) return;
        d.expenses.forEach(e => { if (e.categoryId === id) e.categoryId = 'other'; });
        d.settings.budgetCategories = d.settings.budgetCategories.filter(x => x.id !== id);
      });
    },
    exportObject() { return { ...JSON.parse(JSON.stringify(data)), exportedAt: nowISO() }; },
    async replaceAll(newData) { changeLog = []; data = Schema.normalize(newData); await persist(); emit(); },
    async reset() { changeLog = []; data = Schema.empty(); await persist(); emit(); },
    async reloadFromStorage() { try { const raw = await adapter.load(); if (raw) { data = Schema.normalize(Schema.migrate(raw)); emit(); } } catch {} },
    /** Зміна, що прийшла з іншого пристрою. Застосовується, якщо вона новіша за локальну версію. */
    applyRemote(collection, id, record, deleted) {
      if (!data) return false;
      if (collection === 'settings') { if (record && record.settings) { data.settings = Schema.normalize({ ...data, settings: record.settings }).settings; emit(); return true; } return false; }
      if (!Schema.COLLECTIONS.includes(collection)) return false;
      const i = data[collection].findIndex(x => x.id === id); const cur = i >= 0 ? data[collection][i] : null;
      if (deleted) { if (!cur) return false; data[collection].splice(i, 1); emit(); return true; }
      const rec = Schema.normalizeRecord(collection, record);
      if (cur && cur.updatedAt > rec.updatedAt) return false;
      if (cur) data[collection][i] = rec; else data[collection].push(rec);
      emit(); return true;
    },
    /** Повторна синхронізація: дочитати сервер і дослати локальні зміни. */
    async resync() {
      if (!status.cloud || !adapter.load) return;
      try { const raw = await adapter.load(); if (raw) { data = Schema.normalize(Schema.migrate(raw)); } status.sync = 'ok'; status.loadError = null; await persist(); }
      catch (e) { status.sync = 'offline'; }
      emit();
    },
  };
}

export const Repo = createRepo();
