import { Cloud } from '../core/cloud.js';
import { esc } from '../core/utils.js';
import { root } from './shared.js';
import { brandHtml, themeBtn } from './shell.js';

/* Екран входу. Без входу дані облікового запису недоступні. */
const MSG = {
  'Invalid login credentials': 'Неправильний email або пароль.',
  'Email not confirmed': 'Email ще не підтверджено. Перевірте пошту й перейдіть за посиланням з листа.',
  'User already registered': 'Такий email уже зареєстровано. Увійдіть або відновіть пароль.',
};
const tr = e => MSG[e?.message] || (/password/i.test(e?.message || '') && /6|short|weak/i.test(e?.message || '') ? 'Пароль закороткий: потрібно щонайменше 8 символів.' : /rate|limit/i.test(e?.message || '') ? 'Забагато спроб. Зачекайте кілька хвилин.' : /fetch|network/i.test(e?.message || '') ? 'Немає зв’язку з сервером. Перевірте інтернет.' : 'Не вдалося: ' + (e?.message || 'невідома помилка'));

export function renderAuth(mode = 'signin', note = '') {
  const titles = { signin: 'Вхід', signup: 'Реєстрація', forgot: 'Відновлення пароля', newpass: 'Новий пароль' };
  const btn = { signin: 'Увійти', signup: 'Зареєструватися', forgot: 'Надіслати лист', newpass: 'Зберегти пароль' };
  root.innerHTML = `<div class="auth"><div class="auth-top">${themeBtn()}</div><form class="panel" id="auth-form" novalidate>
    ${brandHtml()}
    <div><h1 style="font-size:1.45rem">${titles[mode]}</h1><p class="small muted" style="margin:4px 0 0">Робочий дашборд відкриття магазину білизни, шкарпеток і тапок.</p></div>
    ${note ? `<div class="callout info">${note}</div>` : ''}<div class="form-error" hidden></div>
    ${mode !== 'newpass' ? '<label class="field"><span class="lbl">Email</span><input class="input" id="auth-email" name="email" type="email" autocomplete="email" required></label>' : ''}
    ${mode === 'signin' || mode === 'signup' || mode === 'newpass' ? `<label class="field"><span class="lbl">Пароль</span><input class="input" id="auth-pass" name="password" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}" minlength="8" required>${mode !== 'signin' ? '<span class="hint">Щонайменше 8 символів.</span>' : ''}</label>` : ''}
    <button class="btn primary" type="submit">${btn[mode]}</button>
    <div class="row small" style="justify-content:space-between">${mode === 'signin' ? '<button type="button" class="btn link" data-auth="signup">Створити обліковий запис</button><button type="button" class="btn link" data-auth="forgot">Забули пароль?</button>' : mode !== 'newpass' ? '<button type="button" class="btn link" data-auth="signin">← До входу</button>' : ''}</div>
  </form></div>`;
  const form = root.querySelector('#auth-form'); const err = form.querySelector('.form-error');
  root.querySelectorAll('[data-auth]').forEach(b => b.onclick = () => renderAuth(b.dataset.auth));
  form.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const email = form.email?.value.trim(), password = form.password?.value || '';
    if (form.email && !/^\S+@\S+\.\S+$/.test(email)) { err.hidden = false; err.textContent = 'Вкажіть коректний email.'; return; }
    if (form.password && mode !== 'signin' && password.length < 8) { err.hidden = false; err.textContent = 'Пароль має містити щонайменше 8 символів.'; return; }
    const b = form.querySelector('button[type=submit]'); b.disabled = true;
    try {
      if (mode === 'signin') await Cloud.signIn(email, password);
      else if (mode === 'signup') { const r = await Cloud.signUp(email, password); if (r.needsConfirm) renderAuth('signin', `Ми надіслали лист на <b>${esc(email)}</b>. Підтвердьте email за посиланням і поверніться сюди, щоб увійти.`); }
      else if (mode === 'forgot') { await Cloud.resetPassword(email); renderAuth('signin', 'Якщо такий email зареєстровано, на нього прийде лист із посиланням для нового пароля.'); }
      else if (mode === 'newpass') { await Cloud.updatePassword(password); location.hash = ''; location.reload(); }
    } catch (ex) { err.hidden = false; err.textContent = tr(ex); b.disabled = false; }
  };
}
