
/* =====================================================================
   1. КОНСТАНТИ ТА УТИЛІТИ
   ===================================================================== */
export const APP_ID = 'turka-shop-dashboard';
export const SCHEMA_VERSION = 3;
export const KEYS = { data: 'turka-shop:data', demo: 'turka-shop:demo', mode: 'turka-shop:mode', cloudCache: 'turka-shop:cloud:', migrated: 'turka-shop:migrated:' };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const nowISO = () => new Date().toISOString();
/* ---------- Час: усі дати й години застосунку — за Києвом (Europe/Kyiv), незалежно від пристрою ---------- */
export const TZ = 'Europe/Kyiv';
const kyivFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/** Складові дати й часу в Києві для моменту `date`. */
export function kyivParts(date = new Date()) {
  const o = {}; for (const p of kyivFmt.formatToParts(date)) o[p.type] = p.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}`, y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, s: +o.second };
}
function kyivOffsetMs(date) { const p = kyivParts(date); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000; }
/** Київська дата 'YYYY-MM-DD' і час 'HH:MM' → момент в UTC (ISO). Враховує перехід на літній/зимовий час. */
export function kyivToUtc(dateISO, time = '09:00') {
  const [y, m, d] = dateISO.split('-').map(Number); const [h, mi] = (time || '09:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - kyivOffsetMs(new Date(guess));
  t = guess - kyivOffsetMs(new Date(t));
  return new Date(t).toISOString();
}
/** Сьогоднішня дата в Києві. */
export function todayISO() { return kyivParts().date; }
/** Дата через n днів від київської `dateISO`. */
export function addDaysISO(dateISO, n) { const [y, m, d] = dateISO.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }
/** Момент → 'ДД.ММ.РРРР, ГГ:ХХ' за Києвом. */
export function fmtKyiv(iso) { if (!iso) return '—'; const p = kyivParts(new Date(iso)); return fmtDate(p.date) + ', ' + p.time; }
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
/** Сума/відсоток зі справжнім знаком мінус: колір не єдине позначення збитку. */
export const signedMoney = n => isNum(n) ? (n < 0 ? '−' + fmtMoney(-n) : fmtMoney(n)) : '—';
export const signedPct = n => isNum(n) ? (n < 0 ? '−' + fmtPct(-n) : fmtPct(n)) : '—';
export function fmtNum(n) { return isNum(n) ? moneyFmt.format(n) : ''; }
/** Дата ДД.ММ.РРРР із 'YYYY-MM-DD' або ISO-часу. */
export function fmtDate(v, withTime) {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return `${d}.${m}.${y}`; }
  const d = new Date(v); if (isNaN(d)) return '—';
  const p = kyivParts(d); const s = fmtDate(p.date);
  return withTime ? s + ' ' + p.time : s;
}
export function daysFromToday(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = kyivParts(); const a = Date.UTC(t.y, t.m - 1, t.d);
  return Math.round((Date.UTC(y, m - 1, d) - a) / 86400000);
}
export function plural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }
export const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
export const uniq = arr => [...new Set(arr)];
export const byText = (a, b) => a.localeCompare(b, 'uk');
