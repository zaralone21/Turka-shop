import { Cloud, countRecords, localLegacyData, migrateLocalToCloud, migrationFlagKey } from '../core/cloud.js';
import { Repo } from '../core/repo.js';
import { Schema } from '../core/schema.js';
import { KEYS, esc, fmtDate, nowISO } from '../core/utils.js';
import { renderAuth } from './auth.js';
import { exportJSON } from './backup.js';
import { closeModal, confirmDialog, openModal } from './modal.js';
import { render } from './shell.js';
import { toast } from './shared.js';

/* Відкриває потрібний набір даних: демо, обліковий запис (хмара) або браузер. */
export async function openData() {
  let demo = false; try { demo = localStorage.getItem(KEYS.mode) === 'demo'; } catch {}
  if (demo) { Cloud.unsubscribe?.(); await Repo.open('demo'); return; }
  if (Cloud.configured) {
    if (!Cloud.user) { renderAuth(); return; }
    await Repo.open('real', Cloud.adapter());
    Cloud.subscribe(Repo);
    checkMigration(true);
    return;
  }
  await Repo.open('real');
}
export function checkMigration(autoOpen) {
  const legacy = localLegacyData();
  Cloud.pendingMigration = !!legacy && !localStorage.getItem(migrationFlagKey(Cloud.user.id));
  if (Cloud.pendingMigration && autoOpen) migrationDialog();
}

/* Перенесення записів зі старої версії (браузер) в обліковий запис. */
export function migrationDialog() {
  const legacy = localLegacyData(); if (!legacy || !Cloud.user) return;
  const parts = Schema.DATA_COLLECTIONS.filter(k => legacy[k].length).map(k => `${Schema.LABELS[k]}: ${legacy[k].length}`).join(', ');
  openModal({ title: 'Перенести записи в обліковий запис', body: `<div class="modal-b">
    <p style="margin:0">У цьому браузері знайдено <b>${countRecords(legacy)}</b> записів (${esc(parts) || 'лише налаштування бюджету'}).</p>
    <div class="callout info"><b>Крок 1.</b> Завантажте резервну копію цих записів, щоб мати їх у файлі за будь-яких умов.<div class="row" style="margin-top:8px"><button class="btn" id="mig-backup">Завантажити резервну копію</button><span class="small" id="mig-backup-ok"></span></div></div>
    <div class="callout info"><b>Крок 2.</b> Перенесіть записи. Наявні в обліковому записі дані не видаляються, однакові записи не дублюються. Старі дані в браузері залишаться, доки ви самі не очистите їх.</div>
    <div id="mig-result"></div></div>`,
    foot: `<div class="modal-f"><button class="btn" data-close>Пізніше</button><button class="btn primary" id="mig-go">Перенести</button></div>`,
    onMount: m => {
      m.querySelector('#mig-backup').onclick = async () => { await exportJSON(legacy, '-browser'); m.querySelector('#mig-backup-ok').textContent = '✓ Копію завантажено'; };
      m.querySelector('#mig-go').onclick = async () => {
        const btn = m.querySelector('#mig-go'); btn.disabled = true; btn.textContent = 'Переношу…';
        const res = await migrateLocalToCloud(Repo, legacy, () => Repo.adapter.load());
        const box = m.querySelector('#mig-result');
        if (res.verified) {
          localStorage.setItem(migrationFlagKey(Cloud.user.id), nowISO()); Cloud.pendingMigration = false;
          box.innerHTML = `<div class="callout info">Готово: перенесено ${res.added} нових записів, усі ${countRecords(legacy)} перевірено на сервері. Старі дані браузера поки збережені, очистити їх можна в розділі «Дані й акаунт».</div>`;
          btn.textContent = 'Перенесено'; render();
        } else {
          box.innerHTML = `<div class="callout bad">Перенесення не підтверджено${res.error ? ': ' + esc(res.error) : ` (не знайдено на сервері: ${res.missing.length})`}. Старі дані не чіпали. Спробуйте ще раз, коли буде зв’язок.</div>`;
          btn.disabled = false; btn.textContent = 'Спробувати ще раз';
        }
      };
    } });
}
export async function clearLegacy() {
  if (!Cloud.user || !localStorage.getItem(migrationFlagKey(Cloud.user.id))) { toast('Спершу перенесіть і перевірте записи', 'error'); return; }
  const ok = await confirmDialog({ title: 'Очистити старі дані браузера?', ok: 'Очистити', text: '<p style="margin:0">Записи вже перенесено й перевірено в обліковому записі. Буде видалено лише стару копію в цьому браузері.</p><div class="callout warn">Якщо сумніваєтеся, спершу завантажте її копію.</div>' });
  if (!ok) return;
  localStorage.removeItem(KEYS.data); toast('Старі дані браузера очищено'); render();
}
