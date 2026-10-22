import { createClient } from '@supabase/supabase-js';
import { createCloudAdapter } from './cloudAdapter.js';
import { Schema } from './schema.js';
import { KEYS } from './utils.js';

/* Підключення до Supabase: вхід, хмарне сховище, синхронізація в реальному часі.
   Адреса й публічний ключ потрапляють у збірку зі змінних середовища.
   Публічний (anon/publishable) ключ безпечний у браузері: доступ обмежують правила RLS у базі. */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const URL_ = env.VITE_SUPABASE_URL || '';
const KEY_ = env.VITE_SUPABASE_ANON_KEY || '';

const cacheFor = userId => ({
  read() { const s = localStorage.getItem(KEYS.cloudCache + userId); return s ? JSON.parse(s) : null; },
  write(obj) { localStorage.setItem(KEYS.cloudCache + userId, JSON.stringify(obj)); },
});

export const Cloud = {
  configured: !!(URL_ && KEY_),
  url: URL_,
  client: null, user: null, session: null, channel: null, pendingMigration: false,
  init() {
    if (!this.configured || this.client) return this.client;
    this.client = createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return this.client;
  },
  async currentSession() { if (!this.init()) return null; const { data } = await this.client.auth.getSession(); this.session = data.session; this.user = data.session?.user || null; return this.session; },
  onAuthChange(cb) { if (!this.init()) return; this.client.auth.onAuthStateChange((event, session) => { this.session = session; this.user = session?.user || null; cb(event, session); }); },
  async signIn(email, password) { const { error } = await this.client.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error; return { needsConfirm: !data.session };
  },
  async resetPassword(email) { const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#reset' }); if (error) throw error; },
  async updatePassword(password) { const { error } = await this.client.auth.updateUser({ password }); if (error) throw error; },
  async signOut() { this.unsubscribe(); await this.client.auth.signOut(); },
  adapter() { return createCloudAdapter({ client: this.client, userId: this.user.id, cache: cacheFor(this.user.id) }); },
  /** Слухає зміни своїх записів з інших пристроїв. */
  subscribe(repo) {
    this.unsubscribe();
    const uidv = this.user.id;
    this.channel = this.client.channel('records-' + uidv)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${uidv}` }, payload => {
        const row = payload.new && payload.new.collection ? payload.new : payload.old; if (!row || !row.collection) return;
        const deleted = payload.eventType === 'DELETE' || !!row.deleted;
        repo.applyRemote(row.collection, row.id, row.data, deleted);
        const ad = repo.adapter; if (!ad || !ad.markSynced) return;
        if (row.collection === 'settings') ad.markSynced('settings', 'main', ad.settingsData(repo.data), false);
        else { const cur = repo.get(row.collection, row.id); if (cur) ad.markSynced(row.collection, row.id, cur, false); else if (deleted) ad.markSynced(row.collection, row.id, null, true); }
      })
      .subscribe();
  },
  unsubscribe() { if (this.channel) { this.client.removeChannel(this.channel); this.channel = null; } },
  /** JWT поточного користувача для серверних функцій. */
  async token() { const s = await this.currentSession(); return s?.access_token || null; },
  functionsUrl(name) { return `${URL_}/functions/v1/${name}`; },
};

/* ---------- Перенесення записів із браузера в обліковий запис ---------- */
export function localLegacyData() {
  try { const raw = localStorage.getItem(KEYS.data); if (!raw) return null; const d = Schema.normalize(Schema.migrate(JSON.parse(raw))); return Schema.COLLECTIONS.some(k => d[k].length) || d.settings.totalBudget !== null ? d : null; } catch { return null; }
}
export const migrationFlagKey = userId => KEYS.migrated + userId;
export function countRecords(d) { return Schema.DATA_COLLECTIONS.reduce((n, k) => n + (d[k] ? d[k].length : 0), 0); }

/**
 * Додає локальні записи до даних облікового запису й перевіряє, що вони дійшли на сервер.
 * Записи з однаковим id не дублюються. Повертає {added, verified, missing}.
 */
export async function migrateLocalToCloud(repo, local, reloadServer) {
  const cur = repo.data; let added = 0;
  const next = JSON.parse(JSON.stringify(cur));
  for (const k of Schema.COLLECTIONS) for (const r of local[k] || []) if (!next[k].some(x => x.id === r.id)) { next[k].push(r); added++; }
  const serverWasEmpty = Schema.COLLECTIONS.every(k => !cur[k].length) && cur.settings.totalBudget === null;
  if (serverWasEmpty) next.settings = local.settings;
  await repo.replaceAll(next);
  if (repo.status.sync !== 'ok') return { added, verified: false, missing: [], error: repo.status.lastError || 'Немає зв’язку з сервером' };
  // Перевірка: перечитуємо сервер і шукаємо кожен перенесений запис.
  const server = await reloadServer();
  const missing = [];
  for (const k of Schema.COLLECTIONS) for (const r of local[k] || []) if (!server || !server[k].some(x => x.id === r.id)) missing.push(k + '/' + r.id);
  return { added, verified: missing.length === 0, missing };
}
