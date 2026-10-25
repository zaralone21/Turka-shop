import './styles.css';
import { Cloud } from './core/cloud.js';
import { Repo } from './core/repo.js';
import { renderAuth } from './ui/auth.js';
import { openData } from './ui/session.js';
import { UI, resolvePage, sectionOf } from './ui/shared.js';
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
import './ui/views/opening.js';
import './ui/views/premises.js';
import './ui/views/fitout.js';
import './ui/views/monthly.js';
import './ui/ai.js';
import './ui/events.js';
import { OPENING_ACTIONS } from './ui/opening.js';
import { ACTIONS } from './ui/events.js';
import { initNotifications } from './ui/notifications.js';
import { AI } from './ui/ai.js';
import { initTheme, toggleTheme } from './ui/theme.js';

/* Запуск застосунку. */
Object.assign(ACTIONS, OPENING_ACTIONS, { 'theme-toggle': () => toggleTheme() });
initTheme();
/* Шапка й нижнє меню стають щільнішими, коли під ними прокручується вміст. */
const onScroll = () => document.documentElement.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
Repo.onChange(render);
document.documentElement.lang = 'uk';
(async () => {
  const h = resolvePage(location.hash.slice(1)); if (h) { UI.page = h; const sec = sectionOf(h); if (sec) UI.lastTab[sec] = h; }
  if (Cloud.configured) {
    Cloud.init();
    let opened = false;
    Cloud.onAuthChange(async event => {
      if (event === 'PASSWORD_RECOVERY') { renderAuth('newpass'); return; }
      if (event === 'SIGNED_IN' && !opened) { opened = true; await openData(); initNotifications(render); AI.refreshStatus(true); }
      if (event === 'SIGNED_OUT') { opened = false; AI.refreshStatus(true); renderAuth(); }
    });
    await Cloud.currentSession();
    if (Cloud.user && !opened) { opened = true; await openData(); initNotifications(render); AI.refreshStatus(true); }
    else if (!Cloud.user) renderAuth();
    const resync = () => { if (Cloud.user && Repo.status.cloud) Repo.resync(); };
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
  } else {
    await openData(); initNotifications(render); AI.refreshStatus(true);
  }
})();
