import { Cloud, countRecords, localLegacyData, migrationFlagKey } from '../../core/cloud.js';
import { Repo } from '../../core/repo.js';
import { esc, fmtDate } from '../../core/utils.js';
import { D, VIEWS } from '../shared.js';

/* ---------- Дані й акаунт ---------- */
function accountPanel() {
  const st = Repo.status;
  if (!Cloud.configured) return `<section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Обліковий запис</h2>
    <div class="callout warn">Сервер ще не підключений. Зараз записи зберігаються лише в цьому браузері, вхід і синхронізація недоступні.</div>
    <p class="small muted" style="margin:0">Після підключення Supabase тут з’явиться вхід, а записи з браузера можна буде перенести в обліковий запис.</p></section>`;
  const syncTxt = { ok: 'Синхронізовано', syncing: 'Синхронізація…', offline: 'Немає зв’язку. Зміни збережено на пристрої й буде надіслано пізніше', error: 'Помилка синхронізації' }[st.sync] || '';
  return `<section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Обліковий запис</h2>
    <dl class="kv small"><dt>Email</dt><dd>${esc(Cloud.user?.email || '')}</dd><dt>Синхронізація</dt><dd>${syncTxt}</dd><dt>Сховище</dt><dd>База Supabase, доступ лише для вашого облікового запису</dd></dl>
    <div class="row"><button class="btn" data-act="resync">Синхронізувати зараз</button><button class="btn" data-act="change-password">Змінити пароль</button><button class="btn danger" data-act="sign-out">Вийти</button></div></section>`;
}
function migrationPanel() {
  if (!Cloud.user) return '';
  const legacy = localLegacyData(); if (!legacy) return '';
  const done = localStorage.getItem(migrationFlagKey(Cloud.user.id));
  return `<section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Записи з цього браузера</h2>
    <p class="small" style="margin:0">У браузері збережено ${countRecords(legacy)} записів зі старої версії застосунку.</p>
    ${done ? `<div class="callout info">Перенесено й перевірено ${fmtDate(done, true)}. Старі дані ще лежать у браузері як запасна копія.</div><div class="row"><button class="btn" data-act="legacy-backup">Завантажити їх копію</button><button class="btn danger" data-act="legacy-clear">Очистити старі дані браузера</button></div>`
      : `<div class="row"><button class="btn primary" data-act="migrate-open">Перенести в обліковий запис</button></div>`}</section>`;
}
VIEWS.data = () => {
  const d = D(); const st = Repo.status; const cloud = !!Cloud.user && !st.demo;
  return `
  <div class="grid-2">
    ${accountPanel()}
    ${migrationPanel()}
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Резервна копія</h2>
      <p class="small muted" style="margin:0">Усі записи (постачальники, товари, закупівлі, нотатки, завдання, нагадування, бюджет, чати AI) в одному JSON-файлі. ${cloud ? 'Дані вже зберігаються на сервері, але власна копія не завадить.' : 'Робіть копію регулярно і перед очищенням браузера.'}</p>
      <div class="row"><button class="btn primary" data-act="export">Завантажити JSON</button><button class="btn" data-act="export-copy">Показати JSON</button></div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Відновлення з файлу</h2>
      <p class="small muted" style="margin:0">Файл спершу перевіряється. Перед заміною ${cloud ? 'даних облікового запису' : 'поточних даних'} з’явиться підтвердження з кількістю записів.</p>
      <div class="row"><label class="btn" for="import-file">Вибрати JSON-файл</label><input type="file" id="import-file" accept="application/json,.json" class="sr" data-act="import-file"></div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Демо-режим</h2>
      <p class="small muted" style="margin:0">Окремий набір вигаданих прикладів у цьому браузері. Ваші записи не змінюються.</p>
      <div class="row">${st.demo ? '<button class="btn" data-act="demo-exit">Повернутися до моїх даних</button><button class="btn" data-act="demo-reset">Скинути демо-дані</button>' : '<button class="btn" data-act="demo-enter">Відкрити демо</button>'}</div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Про дані</h2>
      <dl class="kv small"><dt>Набір даних</dt><dd>${st.demo ? 'Демо' : cloud ? 'Обліковий запис' : 'Цей браузер'}</dd><dt>Версія структури</dt><dd>v${d.schemaVersion}</dd>
      <dt>Останні зміни</dt><dd>${fmtDate(d.meta.updatedAt, true)}</dd>
      <dt>Записів</dt><dd>${countRecords(d)}</dd></dl>
      <p class="small muted" style="margin:0">Без сторонньої аналітики. AI-менеджер отримує лише дані, потрібні для конкретного запиту.</p>
      <div class="row"><button class="btn danger" data-act="reset-all">Видалити всі ${st.demo ? 'демо-' : ''}дані</button></div></section>
  </div>`;
};
