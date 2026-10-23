import { describe, it, expect } from 'vitest';
import { runTurn, sanitizeAssistant, textOf } from '../src/core/aiAgent.js';
import { planChanges, runTool } from '../src/core/aiTools.js';
import { createRepo } from '../src/core/repo.js';
import { Schema } from '../src/core/schema.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
async function repoWith(fill) {
  const repo = createRepo(); const d = Schema.empty(); fill && fill(d);
  await repo.open('real', { kind: 'memory', load: async () => JSON.parse(JSON.stringify(d)), save: async () => {} });
  return repo;
}

describe('фото товарів у записах', () => {
  it('зберігає коректні фото й відкидає небезпечні значення', () => {
    const p = Schema.normalizeRecord('products', { id: 'p1', name: 'Тапки', photos: [
      { id: 'a', path: '11111111-1111-1111-1111-111111111111/p1/a.jpg' },
      { id: 'b', data: PNG },
      { id: 'c', path: '../інший/шлях.jpg' },
      { id: 'd', data: 'javascript:alert(1)' },
      { id: 'e', data: 'data:image/svg+xml;base64,PHN2Zz4=' },
      'рядок', null,
    ] });
    expect(p.photos).toEqual([{ id: 'a', path: '11111111-1111-1111-1111-111111111111/p1/a.jpg' }, { id: 'b', data: PNG }]);
    expect(Schema.normalizeRecord('products', { id: 'p2', name: 'Без фото' }).photos).toEqual([]);
  });
  it('AI не отримує вмісту фото й не може їх змінити', async () => {
    const repo = await repoWith(d => d.products.push({ id: 'p1', name: 'Тапки', photos: [{ id: 'b', data: PNG }] }));
    const { result } = await runTool('get_record', { collection: 'products', id: 'p1' }, { repo, now: new Date() });
    expect(result.photos).toBe(1);
    expect(JSON.stringify(result)).not.toContain('base64');
    const plan = planChanges(repo.data, [{ action: 'update', collection: 'products', id: 'p1', fields: { photos: [], name: 'Тапки домашні' } }]);
    expect(plan[0].diff.map(x => x.field)).toEqual(['name']);
  });
});

describe('AI: пошук у мережі й сайти', () => {
  it('продовжує хід після паузи сервера й показує, що переглядав сайт', async () => {
    const repo = await repoWith();
    const calls = [];
    const replies = [
      { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 'srv1', name: 'web_fetch', input: { url: 'https://jubi.ua' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'web_fetch_tool_result', tool_use_id: 'srv1', content: { type: 'web_fetch_result' } }, { type: 'text', text: 'Шкарпетки по ' }, { type: 'text', text: '45 грн', citations: [{ type: 'web_page_location', url: 'https://jubi.ua/socks', title: 'Jubi' }] }, { type: 'text', text: ' за пару.' }] },
    ];
    const chat = await runTurn({ chat: { messages: [], log: [] }, text: 'Подивись ціни на jubi.ua', repo, callModel: async m => { calls.push(JSON.parse(JSON.stringify(m))); return replies.shift(); } });
    expect(calls).toHaveLength(2);
    expect(calls[1].at(-1).role).toBe('assistant'); // продовження без нового повідомлення користувача
    expect(chat.log.filter(e => e.type === 'tool').map(e => e.name)).toEqual(['web_fetch']);
    const answer = chat.log.filter(e => e.role === 'assistant').map(e => e.text).join('\n');
    expect(answer).toContain('Шкарпетки по 45 грн за пару.');
    expect(answer).toContain('[Jubi](https://jubi.ua/socks)');
  });
  it('джерела лише з http(s)-адрес', () => {
    expect(textOf([{ type: 'text', text: 'x', citations: [{ url: 'javascript:alert(1)', title: 't' }] }])).toBe('x');
  });
  it('після переходу на резервну модель серверні виклики до позначки теж прибираються', () => {
    const out = sanitizeAssistant([
      { type: 'server_tool_use', id: 's1', name: 'web_search' }, { type: 'web_search_tool_result', tool_use_id: 's1' },
      { type: 'fallback' }, { type: 'text', text: 'ok' },
    ]);
    expect(out.map(b => b.type)).toEqual(['fallback', 'text']);
  });
});

describe('AI додає фото до товарів одразу, партією', () => {
  const two = () => repoWith(d => d.products.push({ id: 'p1', name: 'Шкарпетки', photos: [] }, { id: 'p2', name: 'Тапки', photos: Array.from({ length: 8 }, (_, i) => ({ id: 'f' + i, data: PNG })) }));
  it('додає фото до кількох товарів, пропускаючи некоректне', async () => {
    const repo = await two(); const calls = [];
    const importPhoto = async (pid, url) => { calls.push([pid, url]); if (url.includes('bad')) throw new Error('файл більший за 5 МБ'); return { id: 'n' + calls.length, path: `u/${pid}/n${calls.length}.jpg` }; };
    const { result, effect } = await runTool('add_product_photos', { items: [
      { productId: 'p1', urls: ['https://jubi.ua/a.jpg', 'https://jubi.ua/a.jpg', 'http://x.ua/b.jpg', 'https://jubi.ua/bad.jpg'] },
      { productId: 'p2', urls: ['https://jubi.ua/c.jpg'] },
      { productId: 'nope', urls: ['https://jubi.ua/d.jpg'] },
    ], source: 'https://jubi.ua' }, { repo, now: new Date(), importPhoto });
    expect(calls).toEqual([['p1', 'https://jubi.ua/a.jpg'], ['p1', 'https://jubi.ua/bad.jpg']]);
    expect(result.added).toBe(1);
    expect(repo.data.products[0].photos).toEqual([{ id: 'n1', path: 'u/p1/n1.jpg' }]);
    expect(effect.items.map(x => [x.productId, x.added.length, x.failed.length])).toEqual([['p1', 1, 1], ['p2', 0, 1], ['nope', 0, 1]]);
  });
  it('без входу чесно відмовляє', async () => {
    const repo = await two();
    await expect(runTool('add_product_photos', { items: [{ productId: 'p1', urls: ['https://a.ua/1.jpg'] }] }, { repo, now: new Date() })).rejects.toThrow(/входу/);
  });
});

describe('робоче середовище AI зберігається між кроками й повідомленнями', () => {
  it('передає id середовища назад моделі', async () => {
    const repo = await repoWith();
    const seen = [];
    const replies = [
      { stop_reason: 'pause_turn', container: 'cnt_1', content: [{ type: 'server_tool_use', id: 's1', name: 'web_fetch', input: {} }] },
      { stop_reason: 'end_turn', container: 'cnt_1', content: [{ type: 'text', text: 'готово' }] },
    ];
    const chat = await runTurn({ chat: { messages: [], log: [], container: null }, text: 'x', repo, callModel: async (m, c) => { seen.push(c); return replies.shift(); } });
    expect(seen).toEqual([null, 'cnt_1']);
    expect(chat.container).toBe('cnt_1');
    const next = await runTurn({ chat, text: 'далі', repo, callModel: async (m, c) => { seen.push(c); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ок' }] }; } });
    expect(seen.at(-1)).toBe('cnt_1');
    expect(next.container).toBe('cnt_1');
  });
});

describe('продовження закритої розмови', () => {
  it('збирає видимий текст і обрізає початок, якщо задовго', async () => {
    const { transcriptOf } = await import('../src/core/aiAgent.js');
    const log = [{ role: 'user', text: 'підбери шкарпетки' }, { type: 'tool', name: 'web_fetch' }, { role: 'assistant', text: 'Знайшов 20 позицій' }, { type: 'created', collection: 'tasks', id: 't1', title: 'Подзвонити' }];
    expect(transcriptOf(log)).toBe('Користувач: підбери шкарпетки\n\nAI: Знайшов 20 позицій\n\n[Створено tasks/t1: Подзвонити]');
    const long = transcriptOf([{ role: 'user', text: 'a'.repeat(500) }, { role: 'assistant', text: 'кінець' }], 100);
    expect(long.startsWith('…')).toBe(true);
    expect(long.endsWith('AI: кінець')).toBe(true);
  });
});
