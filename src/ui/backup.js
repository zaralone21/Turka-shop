import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { esc, fmtDate, todayISO } from '../core/utils.js';
import { confirmDialog, openModal } from './modal.js';
import { D, toast } from './shared.js';

/* --- експорт / імпорт --- */
export let downloadsApi = null;
export function setDownloadsApi(api) { downloadsApi = api; }
export async function exportJSON() {
  const obj = Repo.exportObject(); const json = JSON.stringify(obj, null, 2);
  const name = `turka-shop-backup-${todayISO()}${Repo.status.demo ? '-demo' : ''}.json`;
  if (downloadsApi) {
    try { await downloadsApi.save({ filename: name, data: json }); toast('Файл резервної копії збережено'); return; }
    catch (e) { if (e && e.code === 'declined') { toast('Збереження скасовано'); return; } }
  }
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {}
  showJSON(json, 'Якщо файл не завантажився, скопіюйте текст нижче й збережіть його у файл з розширенням .json.');
}
export function showJSON(json, note) {
  openModal({ title: 'Резервна копія (JSON)', body: `<div class="modal-b"><p class="small muted" style="margin:0">${note || 'Скопіюйте текст і збережіть у файл з розширенням .json.'}</p><textarea class="input num" id="json-out" rows="12" readonly style="font-family:ui-monospace,Menlo,monospace;font-size:.8rem">${esc(json)}</textarea></div>`,
    foot: `<div class="modal-f"><button class="btn" data-close>Закрити</button><button class="btn primary" id="copy-json">Копіювати</button></div>`,
    onMount: m => { m.querySelector('#copy-json').onclick = () => copyText(json, m.querySelector('#json-out')); } });
}
export async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Скопійовано'); }
  catch { if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); toast('Виділено. Натисніть Ctrl+C / ⌘+C.'); } else toast('Не вдалося скопіювати автоматично', 'error'); }
}
export async function importFile(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { toast('Файл завеликий для резервної копії', 'error'); return; }
  let obj; try { obj = JSON.parse(await file.text()); }
  catch { openModal({ title: 'Файл не підходить', narrow: true, body: '<div class="modal-b"><div class="callout bad">Це не JSON-файл або він пошкоджений. Виберіть файл, створений кнопкою «Експорт».</div></div>', foot: '<div class="modal-f"><button class="btn" data-close>Зрозуміло</button></div>' }); return; }
  const res = Schema.validateImport(obj);
  if (!res.ok) { openModal({ title: 'Файл не пройшов перевірку', narrow: true, body: `<div class="modal-b"><div class="callout bad"><ul style="margin:0;padding-left:18px">${res.errors.slice(0, 6).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${res.errors.length > 6 ? `<p style="margin:6px 0 0">…і ще ${res.errors.length - 6}</p>` : ''}</div><p class="small muted" style="margin:0">Поточні дані не змінено.</p></div>`, foot: '<div class="modal-f"><button class="btn" data-close>Закрити</button></div>' }); return; }
  const c = res.counts, cur = D();
  const ok = await confirmDialog({ title: 'Замінити поточні дані?', ok: 'Замінити дані', text: `
    <p style="margin:0">Файл перевірено${obj.exportedAt ? `, експорт від ${fmtDate(obj.exportedAt, true)}` : ''}. У ньому:</p>
    <p class="small" style="margin:0">${c.suppliers} постачальників · ${c.products} товарів · ${c.notes} нотаток · ${c.tasks} завдань · ${c.expenses} витрат</p>
    <div class="callout warn">Поточні ${Repo.status.demo ? 'демо-' : ''}дані (${cur.suppliers.length} постач., ${cur.products.length} тов., ${cur.notes.length} нот., ${cur.tasks.length} зав., ${cur.expenses.length} витр.) буде повністю замінено. Якщо вони потрібні, спершу зробіть експорт.</div>` });
  if (ok) { await Repo.replaceAll(res.data); toast('Дані відновлено з файлу'); }
}
