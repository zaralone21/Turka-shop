import { Cloud } from '../core/cloud.js';
import { esc, uid } from '../core/utils.js';

/* Фото товарів. Після входу файли зберігаються в приватному сховищі Supabase (кожен бачить лише свою теку),
   у записі товару лишається тільки шлях. Без входу (або без зв'язку) фото зменшується й зберігається в самому записі. */
const BUCKET = 'product-photos';
export const MAX_PHOTOS = 8;
/** Фото без входу зберігаються в самому записі, а запис у базі має обмеження розміру. */
export const LOCAL_BYTES = 150_000;
export const dataBytes = list => list.reduce((s, p) => s + (p.data ? p.data.length : 0), 0);
const CLOUD_SIZE = 1600, LOCAL_SIZE = 800;
const urls = new Map(); // шлях → {url, until}

const cloudOn = () => !!(Cloud.user && Cloud.client);
const storage = () => Cloud.client.storage.from(BUCKET);

/** Зменшує фото до maxSide пікселів по довшій стороні й перетворює на JPEG. */
async function shrink(file, maxSide, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Не вдалося обробити фото'))), 'image/jpeg', quality));
}
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/** Зберігає одне фото. Повертає {id, path} (сховище) або {id, data} (у записі). */
export async function savePhoto(productId, file) {
  if (!/^image\//.test(file.type)) throw new Error(`«${file.name}» не є зображенням`);
  const id = uid();
  if (cloudOn()) {
    try {
      const blob = await shrink(file, CLOUD_SIZE, 0.85);
      const path = `${Cloud.user.id}/${productId}/${id}.jpg`;
      const { error } = await storage().upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      return { id, path };
    } catch (e) { if (navigator.onLine) throw new Error('Не вдалося завантажити фото на сервер'); }
  }
  return { id, data: await toDataUrl(await shrink(file, LOCAL_SIZE, 0.75)) };
}
/** Видаляє файли зі сховища (записи в самому товарі зникають разом із ним). */
export async function deletePhotos(photos) {
  const paths = (photos || []).map(p => p.path).filter(Boolean);
  if (!paths.length || !cloudOn()) return;
  try { await storage().remove(paths); } catch {}
  paths.forEach(p => urls.delete(p));
}

/** HTML мініатюри. Фото зі сховища отримують адресу після показу (hydratePhotos). */
export function photoImg(p, cls = 'thumb', alt = '') {
  if (!p) return '';
  if (p.data) return `<img class="${cls}" src="${esc(p.data)}" alt="${esc(alt)}" loading="lazy">`;
  const hit = urls.get(p.path);
  return `<img class="${cls}" ${hit && hit.until > Date.now() ? `src="${esc(hit.url)}"` : `data-photo="${esc(p.path)}"`} alt="${esc(alt)}" loading="lazy">`;
}
/** Підставляє тимчасові адреси для фото зі сховища в межах root. */
export async function hydratePhotos(root) {
  const imgs = [...root.querySelectorAll('img[data-photo]')];
  if (!imgs.length || !cloudOn()) return;
  const paths = [...new Set(imgs.map(i => i.dataset.photo))].filter(p => !(urls.get(p)?.until > Date.now()));
  if (paths.length) {
    try {
      const { data } = await storage().createSignedUrls(paths, 3600);
      (data || []).forEach(x => { if (x.signedUrl) urls.set(x.path, { url: x.signedUrl, until: Date.now() + 3500_000 }); });
    } catch { return; }
  }
  imgs.forEach(i => { const hit = urls.get(i.dataset.photo); if (hit) { i.src = hit.url; i.removeAttribute('data-photo'); } });
}
/** Сервер завантажує фото за посиланням у сховище користувача. Повертає {id, path}. */
export async function importPhoto(productId, url) {
  if (!cloudOn()) throw new Error('Увійдіть в обліковий запис, щоб додавати фото за посиланням');
  const token = await Cloud.token();
  let r;
  try { r = await fetch(Cloud.functionsUrl('import-photo'), { method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: Cloud.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, url }) }); }
  catch { throw new Error('немає зв’язку з сервером'); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || !j.path) throw new Error(j.detail || 'не вдалося завантажити зображення');
  return { id: j.id, path: j.path };
}
