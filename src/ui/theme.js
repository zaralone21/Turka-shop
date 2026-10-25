/* Світла й темна теми. Тему до першого показу ставить скрипт в index.html;
   тут — перемикання без перемальовування сторінки, тож форми, введений текст,
   прокрутка й чат лишаються як були. */
const KEY = 'komfort-theme';
const html = document.documentElement;
const saved = () => { try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : null; } catch { return null; } };
const system = () => (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const currentTheme = () => (html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
export const themeLabel = () => (currentTheme() === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему');

function apply(t, animate) {
  if (animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    html.classList.add('theme-anim'); clearTimeout(apply.timer);
    apply.timer = setTimeout(() => html.classList.remove('theme-anim'), 300);
  }
  html.setAttribute('data-theme', t);
  html.style.background = '';
  document.querySelectorAll('.theme-btn').forEach(b => { b.setAttribute('aria-label', themeLabel()); b.title = themeLabel(); b.setAttribute('aria-pressed', String(t === 'dark')); });
}

/** Вибір у меню «Ще»: світла, темна або як у системі. */
export const themeMode = () => saved() || 'system';
export function setThemeMode(mode) {
  try { if (mode === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch {}
  apply(mode === 'system' ? system() : mode, true);
  document.querySelectorAll('[data-theme-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeMode === mode)));
}
export function toggleTheme() {
  const t = currentTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, t); } catch {}
  apply(t, true);
}

/* Поки людина не обрала тему сама, стежимо за системною. */
export function initTheme() {
  apply(saved() || system(), false);
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!saved()) apply(system(), true); });
}
