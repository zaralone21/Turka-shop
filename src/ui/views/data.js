import { Repo } from '../../core/repo.js';
import { fmtDate } from '../../core/utils.js';
import { D, VIEWS } from '../shared.js';

/* ---------- 8. Дані ---------- */
VIEWS.data = () => {
  const d = D(); const st = Repo.status;
  return `
  <div class="page-head"><div><h1>Дані та резервна копія</h1><p>Експорт, відновлення та демо-режим.</p></div></div>
  <div class="grid-2">
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Експорт</h2>
      <p class="small muted" style="margin:0">Зберігає всі записи (постачальники, товари, нотатки, завдання, бюджет, налаштування) в один JSON-файл. Робіть копію регулярно і перед очищенням браузера.</p>
      <div class="row"><button class="btn primary" data-act="export">Завантажити JSON</button><button class="btn" data-act="export-copy">Показати JSON для копіювання</button></div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Відновлення з файлу</h2>
      <p class="small muted" style="margin:0">Файл спершу перевіряється. Перед заміною поточних даних з’явиться підтвердження з кількістю записів.</p>
      <div class="row"><label class="btn primary" for="import-file">Вибрати JSON-файл</label><input type="file" id="import-file" accept="application/json,.json" class="sr" data-act="import-file"></div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Демо-режим</h2>
      <p class="small muted" style="margin:0">Відкриває окремий набір вигаданих прикладів, щоб подивитися, як усе виглядає заповненим. Ваші записи не змінюються.</p>
      <div class="row">${st.demo ? '<button class="btn" data-act="demo-exit">Повернутися до моїх даних</button><button class="btn" data-act="demo-reset">Скинути демо-дані</button>' : '<button class="btn" data-act="demo-enter">Відкрити демо</button>'}</div></section>
    <section class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Про сховище</h2>
      <dl class="kv small"><dt>Де зберігається</dt><dd>${st.persistent ? 'У цьому браузері на цьому пристрої' : 'Лише до перезавантаження сторінки'}</dd>
      <dt>Набір даних</dt><dd>${st.demo ? 'Демо' : 'Ваші записи'}</dd><dt>Версія структури</dt><dd>v${d.schemaVersion}</dd>
      <dt>Останні зміни</dt><dd>${fmtDate(d.meta.updatedAt, true)}</dd>
      <dt>Записів</dt><dd>${d.suppliers.length} постач. · ${d.products.length} тов. · ${d.notes.length} нот. · ${d.tasks.length} зав. · ${d.expenses.length} витр.</dd></dl>
      <p class="small muted" style="margin:0">Дані нікуди не надсилаються: немає аналітики й зовнішніх сервісів.</p>
      <div class="row"><button class="btn danger" data-act="reset-all">Видалити всі ${st.demo ? 'демо-' : ''}дані</button></div></section>
  </div>`;
};
