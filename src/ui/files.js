import { Cloud } from '../core/cloud.js';
import { uid } from '../core/utils.js';
import { shrink } from './photos.js';

/* Файли приміщення (фото, заміри, скани документів) — лише в приватному сховищі після входу.
   У записі приміщення лишається шлях <user_id>/<id приміщення>/<id файлу>.<розширення>. */
const BUCKET = 'premises-files';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
export const filesAvailable = () => !!(Cloud.user && Cloud.client);
const storage = () => Cloud.client.storage.from(BUCKET);

/** Завантажує файл у сховище. Фото зменшуються до 2000 px, PDF зберігається як є. */
export async function uploadPremisesFile(premisesId, file, kind) {
  if (!filesAvailable()) throw new Error('Увійдіть в обліковий запис, щоб додавати файли');
  const isPdf = file.type === 'application/pdf';
  if (!isPdf && !/^image\/(jpeg|png|webp|heic)$/.test(file.type)) throw new Error(`«${file.name}»: можна додати фото (JPEG, PNG, WebP, HEIC) або PDF`);
  let blob = file, ext = 'pdf', type = 'application/pdf';
  if (!isPdf) {
    try { blob = await shrink(file, 2000, 0.85); ext = 'jpg'; type = 'image/jpeg'; }
    catch { ext = file.type.split('/')[1].replace('jpeg', 'jpg'); type = file.type; }
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error(`«${file.name}» більший за 10 МБ`);
  const id = uid(); const path = `${Cloud.user.id}/${premisesId}/${id}.${ext}`;
  const { error } = await storage().upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error('Не вдалося завантажити файл на сервер');
  return { id, path, name: file.name.slice(0, 200), type, size: blob.size, kind };
}
export async function deletePremisesFiles(files) {
  const paths = (files || []).map(f => f.path).filter(Boolean);
  if (!paths.length || !filesAvailable()) return;
  try { await storage().remove(paths); } catch {}
}
/** Тимчасове посилання на файл (1 година). */
export async function fileUrl(path) {
  if (!filesAvailable()) return null;
  const { data } = await storage().createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}
/** Мініатюри фото приміщення в межах root (img[data-pfile]). */
export async function hydrateFiles(root) {
  const imgs = [...root.querySelectorAll('img[data-pfile]')];
  if (!imgs.length || !filesAvailable()) return;
  try {
    const { data } = await storage().createSignedUrls([...new Set(imgs.map(i => i.dataset.pfile))], 3600);
    const map = new Map((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl]));
    imgs.forEach(i => { const u = map.get(i.dataset.pfile); if (u) { i.src = u; i.removeAttribute('data-pfile'); } });
  } catch {}
}
