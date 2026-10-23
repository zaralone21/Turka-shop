import { Cloud } from '../core/cloud.js';
import { fireAt, isDue } from '../core/reminders.js';
import { Repo } from '../core/repo.js';
import { esc, fmtKyiv } from '../core/utils.js';
import { closeModal, openModal } from './modal.js';
import { D, toast } from './shared.js';

/* ---------- Сповіщення ----------
   1) Центр сповіщень у застосунку: нагадування, час яких настав, і журнал сервера.
   2) Web push: сервер щохвилини перевіряє нагадування й надсилає їх на пристрої,
      навіть коли сторінку закрито (лише якщо сервер і ключі VAPID налаштовано).
   3) Поки сторінка відкрита, застосунок і сам помічає нагадування, що настали. */
const N = { list: [], channel: null, rerender: () => {} };
const P = { state: 'unknown', publicKey: null, subscribed: false, busy: false, note: '' };

/** Непрочитані серверні сповіщення про нагадування, які вже не чекають дії (щоб не рахувати двічі). */
export function notifUnread() {
  const due = new Set(D().reminders.filter(r => isDue(r)).map(r => r.id));
  return N.list.filter(n => !n.read_at && !due.has(n.reminder_id)).length;
}

async function loadServer() {
  if (!Cloud.user || !Cloud.client) { N.list = []; return; }
  const { data, error } = await Cloud.client.from('notifications').select('id,reminder_id,fire_at,title,body,created_at,read_at,push_sent').order('created_at', { ascending: false }).limit(50);
  if (!error) N.list = data;
}
function subscribeServer() {
  if (!Cloud.user || !Cloud.client) return;
  if (N.channel) Cloud.client.removeChannel(N.channel);
  N.channel = Cloud.client.channel('notif-' + Cloud.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${Cloud.user.id}` }, p => {
      if (N.list.some(n => n.id === p.new.id)) return;
      N.list.unshift(p.new); N.rerender();
      if (!seen.has(p.new.reminder_id + p.new.fire_at)) { seen.add(p.new.reminder_id + p.new.fire_at); toast('🔔 ' + p.new.title); }
    }).subscribe();
}

export function openNotifCenter() {
  const due = D().reminders.filter(r => isDue(r)).sort((a, b) => (fireAt(a) < fireAt(b) ? -1 : 1));
  const hist = N.list.slice(0, 30);
  openModal({ title: 'Сповіщення', narrow: true, body: `<div class="modal-b">
    <h3 style="margin:0 0 6px">Потребують дії</h3>
    ${due.length ? `<div class="list">${due.map(r => `<div class="notif"><div class="t"><div class="nm">${esc(r.title)}</div><div class="small muted">${fmtKyiv(fireAt(r))}</div></div><div class="row" style="gap:6px"><button class="btn sm" data-n-done="${r.id}">Виконано</button><button class="btn sm ghost" data-n-snooze="${r.id}">Відкласти</button></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Нічого не чекає.</p>'}
    ${Cloud.user ? `<h3 style="margin:16px 0 6px">Надіслані сервером</h3>${hist.length ? `<div class="list">${hist.map(n => `<div class="notif ${n.read_at ? '' : 'unread'}"><div class="t"><div class="nm">${esc(n.title)}</div><div class="small muted">${fmtKyiv(n.fire_at)}${n.push_sent ? ' · push доставлено на ' + n.push_sent : ''}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Сервер ще не надсилав сповіщень.</p>'}` : ''}
    <p class="small muted" style="margin:14px 0 0"><button class="btn link" data-n-settings>Налаштувати push-сповіщення</button></p></div>`,
    onMount: m => {
      m.querySelector('[data-n-settings]').onclick = () => { closeModal(); location.hash = 'reminders'; };
    } });
  markRead();
}
async function markRead() {
  const ids = N.list.filter(n => !n.read_at).map(n => n.id); if (!ids.length || !Cloud.client) return;
  const now = new Date().toISOString();
  const { error } = await Cloud.client.from('notifications').update({ read_at: now }).in('id', ids);
  if (!error) { N.list.forEach(n => { if (ids.includes(n.id)) n.read_at = now; }); N.rerender(); }
}

/* ---------- Web push ---------- */
const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const b64ToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
async function fnHeaders() { const t = await Cloud.token(); return { Authorization: 'Bearer ' + t, apikey: Cloud.anonKey, 'Content-Type': 'application/json' }; }
async function registration() { return navigator.serviceWorker.register('./sw.js', { scope: './' }); }

async function refreshPush() {
  if (!Cloud.configured) { P.state = 'no_server'; return; }
  if (!Cloud.user) { P.state = 'signed_out'; return; }
  if (!supported()) { P.state = isIOS() && !standalone() ? 'ios_install' : 'unsupported'; return; }
  try {
    const r = await fetch(Cloud.functionsUrl('push'), { headers: await fnHeaders() });
    const j = r.status === 404 ? { configured: false } : await r.json();
    if (!j.configured) { P.state = 'not_configured'; return; }
    P.publicKey = j.publicKey;
  } catch { P.state = 'offline'; return; }
  if (Notification.permission === 'denied') { P.state = 'denied'; return; }
  const reg = await navigator.serviceWorker.getRegistration('./');
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) {
    const { data } = await Cloud.client.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
    if (!data) await saveSubscription(sub).catch(() => {});
  }
  P.subscribed = !!sub; P.state = sub ? 'on' : 'off';
}
async function saveSubscription(sub) {
  const j = sub.toJSON();
  const row = { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) };
  await Cloud.client.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await Cloud.client.from('push_subscriptions').insert(row);
  if (error) throw error;
}
async function enablePush() {
  P.busy = true; P.note = ''; N.rerender();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { P.state = perm === 'denied' ? 'denied' : 'off'; P.note = 'Дозвіл на сповіщення не надано.'; return; }
    const reg = await registration(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(P.publicKey) });
    try { await saveSubscription(sub); }
    catch { await sub.unsubscribe(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(P.publicKey) }); await saveSubscription(sub); }
    P.state = 'on'; P.subscribed = true; P.note = 'Сповіщення увімкнено. Надішліть тестове, щоб перевірити.';
  } catch (e) { P.note = 'Не вдалося увімкнути: ' + (e.message || e); }
  finally { P.busy = false; N.rerender(); }
}
async function disablePush() {
  P.busy = true; N.rerender();
  try {
    const reg = await navigator.serviceWorker.getRegistration('./'); const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await Cloud.client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    P.state = 'off'; P.subscribed = false; P.note = 'Сповіщення на цьому пристрої вимкнено.';
  } catch (e) { P.note = 'Не вдалося вимкнути: ' + (e.message || e); }
  finally { P.busy = false; N.rerender(); }
}
async function testPush() {
  P.busy = true; P.note = ''; N.rerender();
  try {
    const reg = await navigator.serviceWorker.getRegistration('./'); const sub = reg && await reg.pushManager.getSubscription();
    const r = await fetch(Cloud.functionsUrl('push'), { method: 'POST', headers: await fnHeaders(), body: JSON.stringify({ endpoint: sub?.endpoint }) });
    const j = await r.json().catch(() => ({}));
    P.note = r.ok && j.sent ? 'Тестове сповіщення надіслано. Якщо воно не з’явилось, перевірте налаштування сповіщень системи.' : j.error === 'no_subscriptions' ? 'Цей пристрій не підписаний. Увімкніть сповіщення ще раз.' : 'Сервер не зміг доставити сповіщення на цей пристрій.';
  } catch { P.note = 'Немає зв’язку з сервером.'; }
  finally { P.busy = false; N.rerender(); }
}

const PUSH_TEXT = {
  unknown: ['', 'Перевіряю…'],
  no_server: ['warn', 'Сервер сповіщень не підключено. Нагадування видно в застосунку (дзвіночок), але коли сторінку закрито, вони не прийдуть.'],
  signed_out: ['warn', 'Увійдіть в обліковий запис, щоб отримувати сповіщення.'],
  not_configured: ['warn', 'Сервер працює, але push-ключі (VAPID) ще не налаштовано. Нагадування видно лише в застосунку.'],
  unsupported: ['warn', 'Цей браузер не підтримує push-сповіщення. Нагадування видно в застосунку.'],
  ios_install: ['warn', 'На iPhone і iPad сповіщення працюють лише з іконки на головному екрані: «Поділитися» → «На початковий екран», відкрийте застосунок звідти й увімкніть сповіщення.'],
  denied: ['bad', 'Сповіщення заблоковані в налаштуваннях браузера для цього сайту. Дозвольте їх там і оновіть сторінку.'],
  offline: ['warn', 'Не вдалося перевірити сервер сповіщень. Перевірте інтернет.'],
  off: ['', 'Сповіщення на цьому пристрої вимкнені. Нагадування видно в застосунку.'],
  on: ['ok', 'Увімкнено на цьому пристрої: нагадування прийдуть, навіть коли сторінку закрито.'],
};
export function pushPanelHtml() {
  if (P.state === 'unknown') refreshPush().then(() => N.rerender());
  const [cls, text] = PUSH_TEXT[P.state] || PUSH_TEXT.unknown;
  const btns = P.state === 'off' ? `<button class="btn primary sm" data-act="push-enable" ${P.busy ? 'disabled' : ''}>Увімкнути сповіщення</button>`
    : P.state === 'on' ? `<button class="btn sm" data-act="push-test" ${P.busy ? 'disabled' : ''}>Надіслати тестове</button><button class="btn sm ghost" data-act="push-disable" ${P.busy ? 'disabled' : ''}>Вимкнути на цьому пристрої</button>` : '';
  return `<section class="panel push-panel"><div class="panel-head"><h2>Сповіщення</h2><span class="pill ${cls === 'ok' ? 'ok' : cls}">${P.state === 'on' ? 'Увімкнено' : P.state === 'off' ? 'Вимкнено' : P.state === 'unknown' ? '…' : 'Недоступно'}</span></div>
    <p class="small" style="margin:0">${esc(text)}</p>${P.note ? `<p class="small muted" style="margin:6px 0 0" role="status">${esc(P.note)}</p>` : ''}${btns ? `<div class="row" style="margin-top:10px">${btns}</div>` : ''}</section>`;
}
export const PUSH_ACTIONS = { 'push-enable': () => enablePush(), 'push-disable': () => disablePush(), 'push-test': () => testPush() };

/* ---------- Поки сторінка відкрита ---------- */
const seen = new Set();
function tick() {
  const due = D().reminders.filter(r => isDue(r));
  let fresh = false;
  for (const r of due) {
    const key = r.id + fireAt(r); if (seen.has(key)) continue; seen.add(key); fresh = true;
    // Якщо push увімкнено, система вже покаже сповіщення; у застосунку лише оновлюємо лічильник.
    if (P.state !== 'on' && document.visibilityState === 'visible') toast('🔔 ' + r.title);
  }
  if (fresh) N.rerender();
}
export function initNotifications(rerender) {
  if (rerender) N.rerender = rerender;
  if (!Repo.data) return;
  D().reminders.filter(r => isDue(r)).forEach(r => seen.add(r.id + fireAt(r))); // не показуємо старі як нові
  P.state = 'unknown'; P.note = '';
  loadServer().then(() => N.rerender()); subscribeServer();
  clearInterval(initNotifications.timer); initNotifications.timer = setInterval(tick, 30000);
}
