import { Schema } from './schema.js';
import { APP_ID, SCHEMA_VERSION } from './utils.js';

/* Адаптер сховища для Supabase: кожен запис — окремий рядок таблиці records.
   Зберігає лише змінені записи, тримає локальну копію для роботи без інтернету
   і при поверненні зв'язку досилає незбережені зміни. */
const DEL = '\u0000deleted';
const keyOf = (c, id) => c + '/' + id;
const SETTINGS_KEY = keyOf('settings', 'main');

/** Стан застосунку → рядки для бази. */
export function stateToRows(state) {
  const rows = new Map();
  for (const c of Schema.COLLECTIONS) for (const r of state[c] || []) rows.set(keyOf(c, r.id), { collection: c, id: r.id, data: r, due_at: c === 'reminders' ? (r.fireAt || null) : null });
  rows.set(SETTINGS_KEY, { collection: 'settings', id: 'main', data: { schemaVersion: state.schemaVersion || SCHEMA_VERSION, settings: state.settings }, due_at: null });
  return rows;
}
/** Рядки з бази → стан застосунку (null, якщо в обліковому записі ще нічого немає). */
export function rowsToState(rows) {
  const live = rows.filter(r => !r.deleted);
  if (!live.length) return null;
  const st = { app: APP_ID, schemaVersion: SCHEMA_VERSION };
  for (const c of Schema.COLLECTIONS) st[c] = [];
  for (const r of live) {
    if (r.collection === 'settings' && r.id === 'main') { st.settings = r.data.settings; st.schemaVersion = r.data.schemaVersion || SCHEMA_VERSION; }
    else if (st[r.collection]) st[r.collection].push(r.data);
  }
  return st;
}
const snapshot = state => { const m = new Map(); for (const [k, row] of stateToRows(state)) m.set(k, JSON.stringify(row.data)); return m; };
const isOfflineError = e => { const m = String((e && (e.message || e.details)) || e || ''); return /fetch|network|offline|timeout|Load failed/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false); };
const wrap = e => Object.assign(new Error((e && e.message) || 'Помилка сервера'), { offline: isOfflineError(e), cause: e });

/**
 * client — Supabase client; userId — id користувача; cache — {read(), write(obj)} для локальної копії.
 */
export function createCloudAdapter({ client, userId, cache }) {
  let synced = new Map();
  const writeCache = state => { try { cache && cache.write({ userId, state, synced: Object.fromEntries(synced) }); } catch { /* немає місця — не критично */ } };
  const readCache = () => { try { const c = cache && cache.read(); return c && c.userId === userId ? c : null; } catch { return null; } };

  function diff(state) {
    const snap = snapshot(state); const out = [];
    for (const [k, json] of snap) if (synced.get(k) !== json) out.push({ k, json });
    for (const [k, v] of synced) if (v !== DEL && !snap.has(k)) out.push({ k, json: null });
    return out;
  }

  return {
    kind: 'cloud',
    async load() {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client.from('records').select('collection,id,data,deleted,updated_at').eq('user_id', userId).order('collection').order('id').range(from, from + 999);
        if (error) throw wrap(error);
        rows.push(...data); if (data.length < 1000) break;
      }
      synced = new Map(rows.map(r => [keyOf(r.collection, r.id), r.deleted ? DEL : JSON.stringify(r.data)]));
      let state = rowsToState(rows);
      // Незбережені зміни з цього пристрою (зроблені без інтернету) накладаються поверх серверних.
      const c = readCache();
      if (c && c.state) {
        const prev = new Map(Object.entries(c.synced || {})); const local = snapshot(c.state);
        const pending = [...local.keys()].filter(k => local.get(k) !== prev.get(k));
        const deletedLocally = [...prev.keys()].filter(k => prev.get(k) !== DEL && !local.has(k));
        if (pending.length || deletedLocally.length) {
          state = state || { ...Schema.empty(), suppliers: [], products: [], notes: [], tasks: [], expenses: [], purchases: [], reminders: [], chats: [] };
          const localRows = stateToRows(c.state);
          for (const k of pending) {
            const row = localRows.get(k);
            if (k === SETTINGS_KEY) { state.settings = row.data.settings; continue; }
            const list = state[row.collection] || (state[row.collection] = []);
            const i = list.findIndex(x => x.id === row.id);
            if (i >= 0 && (list[i].updatedAt || '') > (row.data.updatedAt || '')) continue; // на сервері новіша версія
            if (i >= 0) list[i] = row.data; else list.push(row.data);
          }
          for (const k of deletedLocally) { const [col, ...rest] = k.split('/'); const id = rest.join('/'); if (state[col]) state[col] = state[col].filter(x => x.id !== id); }
        }
      }
      if (state) writeCache(state);
      return state;
    },
    cached() { const c = readCache(); return c ? c.state : null; },
    hasPending(state) { return diff(state).length > 0; },
    async save(state) {
      writeCache(state);
      const changes = diff(state); if (!changes.length) return;
      const rows = stateToRows(state); const now = new Date().toISOString();
      const payload = changes.map(({ k, json }) => {
        if (json === null) { const [collection, ...rest] = k.split('/'); return { user_id: userId, collection, id: rest.join('/'), data: {}, deleted: true, due_at: null, updated_at: now }; }
        const r = rows.get(k); return { user_id: userId, collection: r.collection, id: r.id, data: r.data, deleted: false, due_at: r.due_at, updated_at: now };
      });
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await client.from('records').upsert(chunk, { onConflict: 'user_id,collection,id' });
        if (error) throw wrap(error);
        for (const p of chunk) synced.set(keyOf(p.collection, p.id), p.deleted ? DEL : JSON.stringify(p.data));
      }
      writeCache(state);
    },
    /** Позначає запис як уже збережений на сервері (після зміни з іншого пристрою). */
    markSynced(collection, id, data, deleted) { synced.set(keyOf(collection, id), deleted ? DEL : JSON.stringify(data)); },
    settingsData(state) { return stateToRows(state).get(SETTINGS_KEY).data; },
  };
}
