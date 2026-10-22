import { Demo } from './demo.js';
import { Schema } from './schema.js';
import { createLocalStorageAdapter, createMemoryAdapter, localStorageWorks } from './storage.js';
import { KEYS, SCHEMA_VERSION, nowISO, uid } from './utils.js';

/* Репозиторій: єдина точка змін даних. Інтерфейс викликає лише ці методи. */
export const Repo = (() => {
  let adapter = null, data = null, listeners = [];
  const status = { persistent: true, lastError: null, demo: false, loadError: null };

  async function open(mode) {
    status.demo = mode === 'demo';
    const ok = localStorageWorks();
    status.persistent = ok;
    adapter = ok ? createLocalStorageAdapter(status.demo ? KEYS.demo : KEYS.data) : createMemoryAdapter();
    status.loadError = null;
    let raw = null;
    try { raw = await adapter.load(); } catch (e) { status.loadError = 'Збережені дані пошкоджені й не прочитались. Відновіть їх з резервної копії (імпорт).'; }
    if (raw && Number(raw.schemaVersion) > SCHEMA_VERSION) {
      status.loadError = 'Дані збережено новішою версією застосунку. Щоб нічого не зіпсувати, зміни в цій версії не зберігатимуться.';
      status.persistent = false; adapter = createMemoryAdapter();
    }
    data = raw ? Schema.normalize(Schema.migrate(raw)) : (status.demo ? Demo.build() : Schema.empty());
    if (status.demo && !raw) await persist();
    emit();
  }
  async function persist() {
    data.meta.updatedAt = nowISO();
    try { await adapter.save(data); status.lastError = null; }
    catch (e) { status.lastError = 'Не вдалося зберегти зміни в браузері (можливо, закінчилось місце). Зробіть експорт, щоб не втратити дані.'; }
  }
  const emit = () => listeners.forEach(fn => fn());
  async function mutate(fn) { fn(data); await persist(); emit(); }

  const col = name => data[name];
  return {
    open, status, onChange: fn => listeners.push(fn),
    get data() { return data; },
    list: col,
    get: (name, id) => data[name].find(x => x.id === id) || null,
    async create(name, fields) { const t = nowISO(); const rec = Schema.normalizeRecord(name, { ...fields, id: fields.id || uid(), createdAt: t, updatedAt: t }); await mutate(d => d[name].push(rec)); return rec; },
    async update(name, id, fields) { await mutate(d => { const i = d[name].findIndex(x => x.id === id); if (i >= 0) d[name][i] = Schema.normalizeRecord(name, { ...d[name][i], ...fields, updatedAt: nowISO() }); }); },
    /** Повертає запис до попереднього стану (для «Скасувати»). Якщо prev = null — видаляє створений запис. */
    async restore(name, id, prev) { await mutate(d => { d[name] = d[name].filter(x => x.id !== id); if (prev) d[name].push(Schema.normalizeRecord(name, { ...prev, updatedAt: nowISO() })); }); },
    async remove(name, id) { await mutate(d => { d[name] = d[name].filter(x => x.id !== id); }); },
    /** Видаляє постачальника. Пов'язані товари й нотатки залишаються, лише відв'язуються. */
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
    async replaceAll(newData) { data = Schema.normalize(newData); await persist(); emit(); },
    async reset() { data = Schema.empty(); await persist(); emit(); },
    async reloadFromStorage() { try { const raw = await adapter.load(); if (raw) { data = Schema.normalize(Schema.migrate(raw)); emit(); } } catch {} },
  };
})();
