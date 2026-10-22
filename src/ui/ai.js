/* AI-менеджер. Повна реалізація — етап 3. */
export const AI = {
  statusPill: () => '<span class="pill">Потрібне підключення AI</span>',
  drawerHtml: () => '',
  afterRender: () => {},
};
import { VIEWS } from './shared.js';
VIEWS.ai = () => '<div class="empty"><p>AI-менеджер ще не підключений.</p></div>';
AI.open = () => {}; AI.close = () => {}; AI.ask = () => {};
