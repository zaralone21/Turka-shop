
/* =====================================================================
   1. КОНСТАНТИ ТА УТИЛІТИ
   ===================================================================== */
export const APP_ID = 'turka-shop-dashboard';
export const SCHEMA_VERSION = 1;
export const KEYS = { data: 'turka-shop:data', demo: 'turka-shop:demo', mode: 'turka-shop:mode' };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const nowISO = () => new Date().toISOString();
export function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/** Число з рядка: приймає кому, пробіли. '' → null, нечислове → NaN. */
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[\s\u00a0\u202f₴%]/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
export const isNum = n => typeof n === 'number' && Number.isFinite(n);
export const moneyFmt = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function fmtMoney(n) { return isNum(n) ? moneyFmt.format(Math.round(n * 100) / 100) + ' ₴' : '—'; }
export function fmtPct(n) { return isNum(n) ? n.toFixed(1).replace('.', ',') + '%' : '—'; }
export function fmtNum(n) { return isNum(n) ? moneyFmt.format(n) : ''; }
/** Дата ДД.ММ.РРРР із 'YYYY-MM-DD' або ISO-часу. */
export function fmtDate(v, withTime) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return `${d}.${m}.${y}`; }
  const d = new Date(v); if (isNaN(d)) return '—';
  const s = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  return withTime ? s + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : s;
}
export function daysFromToday(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(); const a = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}
export function plural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
export const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const uniq = arr => [...new Set(arr)];
export const byText = (a, b) => a.localeCompare(b, 'uk');
