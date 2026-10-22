import './styles.css';
import { Cloud } from './core/cloud.js';
import { Repo } from './core/repo.js';
import { renderAuth } from './ui/auth.js';
import { openData } from './ui/session.js';
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
import './ui/views/purchases.js';
import './ui/views/reminders.js';
import './ui/ai.js';
import './ui/events.js';
import { initNotifications } from './ui/notifications.js';
import { AI } from './ui/ai.js';

/* Запуск застосунку. */
Repo.onChange(render);
document.documentElement.lang = 'uk';
(async () => {
  const h = location.hash.slice(1); if (PAGES.some(p => p[0] === h)) UI.page = h;
  if (Cloud.configured) {
    Cloud.init();
    let opened = false;
    Cloud.onAuthChange(async event => {
      if (event === 'PASSWORD_RECOVERY') { renderAuth('newpass'); return; }
      if (event === 'SIGNED_IN' && !opened) { opened = true; await openData(); initNotifications(); AI.refreshStatus(true); }
      if (event === 'SIGNED_OUT') { opened = false; AI.refreshStatus(true); renderAuth(); }
    });
    await Cloud.currentSession();
    if (Cloud.user && !opened) { opened = true; await openData(); initNotifications(); AI.refreshStatus(true); }
    else if (!Cloud.user) renderAuth();
    const resync = () => { if (Cloud.user && Repo.status.cloud) Repo.resync(); };
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
  } else {
    await openData(); initNotifications(); AI.refreshStatus(true);
  }
})();
