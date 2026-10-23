import { ToolError, runTool } from './aiTools.js';
import { kyivParts } from './utils.js';

/* Цикл розмови з AI-менеджером. Модель викликається через сервер (callModel),
   інструменти виконуються тут, над записами користувача.
   Історія повідомлень лише доповнюється (не редагується), як того вимагає API. */

export const MAX_STEPS = 10;
export const CHAT_SOFT_LIMIT = 150_000; // байт: далі варто почати нову розмову
export const CHAT_STORE_LIMIT = 170_000; // байт: більша розмова не вміститься в запис бази
const RESULT_LIMIT = 30_000;
const WEB_TOOLS = new Set(['web_search', 'web_fetch']);

export class AIError extends Error { constructor(code, message) { super(message || code); this.code = code; } }

/** Після переходу на резервну модель посеред відповіді блоки до позначки fallback не повертаються в історію. */
export function sanitizeAssistant(content) {
  const list = Array.isArray(content) ? content : [];
  const last = list.map(b => b.type).lastIndexOf('fallback');
  if (last < 0) return list;
  const drop = new Set(['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use']);
  return list.filter((b, i) => i >= last || !(drop.has(b.type) || /_tool_result$/.test(b.type)));
}
/** Текст відповіді для показу. Блоки з цитатами — частини одного абзацу; джерела додаються списком посилань. */
export function textOf(content) {
  let out = '', prevCited = false; const sources = new Map();
  for (const b of content) {
    if (b.type !== 'text') { prevCited = false; continue; }
    const cited = Array.isArray(b.citations) && b.citations.length;
    if (cited) b.citations.forEach(c => { if (c.url && /^https?:\/\//.test(c.url)) sources.set(c.url, c.title || c.url); });
    out += out && !cited && !prevCited ? '\n\n' + b.text : b.text;
    prevCited = !!cited;
  }
  out = out.trim();
  if (out && sources.size) out += '\n\nДжерела:\n' + [...sources].slice(0, 8).map(([u, t]) => `- [${t.replace(/[[\]]/g, '')}](${u})`).join('\n');
  return out;
}
const stamp = now => { const p = kyivParts(now); return `[Зараз: ${p.date} ${p.time}, Київ]`; };
const toolUses = msg => (msg && msg.role === 'assistant' && Array.isArray(msg.content) ? msg.content.filter(b => b.type === 'tool_use') : []);

/** Якщо попередній крок обірвався, на кожен виклик інструмента без відповіді додаємо відповідь «перервано». */
function danglingResults(messages) {
  const last = messages[messages.length - 1];
  return toolUses(last).map(t => ({ type: 'tool_result', tool_use_id: t.id, content: 'Перервано: користувач надіслав нове повідомлення.', is_error: true }));
}
export const chatSize = chat => JSON.stringify(chat.messages || []).length + JSON.stringify(chat.log || []).length;

/**
 * Один хід розмови. chat — {messages, log, notes}; повертає оновлений chat.
 * onUpdate(chat) викликається після кожного кроку, щоб інтерфейс показував прогрес.
 */
export async function runTurn({ chat, text, repo, callModel, now = () => new Date(), onUpdate = () => {} }) {
  chat = { ...chat, messages: [...(chat.messages || [])], log: [...(chat.log || [])] };
  const notes = (chat.notes || []).map(n => `[${n}]`).join('\n');
  chat.notes = [];
  chat.messages.push({ role: 'user', content: [...danglingResults(chat.messages), { type: 'text', text: `${stamp(now())}${notes ? '\n' + notes : ''}\n${text}` }] });
  chat.log.push({ role: 'user', text, at: now().toISOString() });
  onUpdate(chat);

  for (let step = 0; step < MAX_STEPS; step++) {
    let res;
    try { res = await callModel(chat.messages); }
    catch (e) { chat.log.push({ type: 'error', code: e.code || 'network', text: e.message }); onUpdate(chat); return chat; }

    if (res.stop_reason === 'refusal') {
      chat.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Не можу відповісти на цей запит.' }] });
      chat.log.push({ type: 'error', code: 'refusal', text: 'Модель відмовилась відповідати на цей запит. Спробуйте сформулювати інакше.' });
      onUpdate(chat); return chat;
    }
    const content = sanitizeAssistant(res.content);
    if (!content.length) { chat.log.push({ type: 'error', code: 'empty', text: 'Порожня відповідь моделі.' }); onUpdate(chat); return chat; }
    chat.messages.push({ role: 'assistant', content });
    const said = textOf(content);
    content.filter(b => b.type === 'server_tool_use' && WEB_TOOLS.has(b.name)).forEach(b => chat.log.push({ type: 'tool', name: b.name, at: now().toISOString() }));
    if (said) chat.log.push({ role: 'assistant', text: said, at: now().toISOString() });
    // Пошук і читання сайтів виконуються на сервері; довгий хід сервер ставить на паузу, і його треба продовжити тим самим запитом.
    if (res.stop_reason === 'pause_turn') { onUpdate(chat); continue; }

    const calls = content.filter(b => b.type === 'tool_use');
    if (!calls.length || res.stop_reason !== 'tool_use') {
      if (res.stop_reason === 'max_tokens') chat.log.push({ type: 'error', code: 'max_tokens', text: 'Відповідь обрізано: вона задовга.' });
      onUpdate(chat); return chat;
    }
    const results = [];
    for (const call of calls) {
      try {
        const { result, effect } = await runTool(call.name, call.input, { repo, now: now() });
        let out = JSON.stringify(result);
        if (out.length > RESULT_LIMIT) out = out.slice(0, RESULT_LIMIT) + '… [обрізано, уточніть запит]';
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out });
        chat.log.push({ type: 'tool', name: call.name, at: now().toISOString() });
        if (effect) chat.log.push({ ...effect, at: now().toISOString(), ...(effect.type === 'confirm' ? { state: 'pending', toolUseId: call.id } : {}) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: e instanceof ToolError ? 'Помилка: ' + e.message : 'Внутрішня помилка інструмента', is_error: true });
      }
    }
    chat.messages.push({ role: 'user', content: results });
    onUpdate(chat);
  }
  chat.log.push({ type: 'error', code: 'steps', text: 'Забагато кроків для одного запиту. Уточніть, що саме потрібно.' });
  onUpdate(chat); return chat;
}
