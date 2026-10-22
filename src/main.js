import './styles.css';
import { Repo } from './core/repo.js';
import { KEYS } from './core/utils.js';
import { setDownloadsApi } from './ui/backup.js';
import { PAGES, UI } from './ui/shared.js';
import { render } from './ui/shell.js';
import './ui/views/home.js';
import './ui/views/suppliers.js';
import './ui/views/products.js';
import './ui/views/notes.js';
import './ui/views/planner.js';
import './ui/views/budget.js';
import './ui/views/breakeven.js';
import './ui/views/data.js';
import './ui/events.js';

/* =====================================================================
   9. ЗАПУСК
   ===================================================================== */
Repo.onChange(render);
document.documentElement.lang = 'uk';
(async () => {
  const h = location.hash.slice(1); if (PAGES.some(p => p[0] === h)) UI.page = h;
  let mode = 'real'; try { if (localStorage.getItem(KEYS.mode) === 'demo') mode = 'demo'; } catch {}
  await Repo.open(mode);
  try { if (window.claude && window.claude.use) setDownloadsApi(await window.claude.use('downloads')); } catch { setDownloadsApi(null); }
})();
