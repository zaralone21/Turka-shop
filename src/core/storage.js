/* =====================================================================
   3. СХОВИЩЕ: адаптери з однаковим асинхронним інтерфейсом load/save/clear.
   Щоб підключити сервер/БД, достатньо написати новий адаптер з тим самим інтерфейсом.
   ===================================================================== */
export function createLocalStorageAdapter(key) {
  return {
    kind: 'browser',
    async load() { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; },
    async save(data) { localStorage.setItem(key, JSON.stringify(data)); },
    async clear() { localStorage.removeItem(key); },
  };
}
export function createMemoryAdapter() {
  let mem = null;
  return { kind: 'memory', async load() { return mem ? JSON.parse(mem) : null; }, async save(d) { mem = JSON.stringify(d); }, async clear() { mem = null; } };
}
export function localStorageWorks() { try { const k = '__turka_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; } }
