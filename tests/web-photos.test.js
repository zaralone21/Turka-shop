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

describe('AI пропонує фото товару', () => {
  const withProduct = photos => repoWith(d => d.products.push({ id: 'p1', name: 'Шкарпетки', photos }));
  it('лише показує фото на підтвердження, нічого не змінюючи', async () => {
    const repo = await withProduct([]);
    const { result, effect } = await runTool('propose_product_photos', { productId: 'p1', urls: ['https://jubi.ua/a.jpg', 'https://jubi.ua/a.jpg', 'http://x.ua/b.jpg', 'javascript:alert(1)', 'https://jubi.ua/c.webp'], source: 'https://jubi.ua/socks' }, { repo, now: new Date() });
    expect(result.pending).toBe(true);
    expect(effect).toMatchObject({ type: 'photos', state: 'pending', productId: 'p1', urls: ['https://jubi.ua/a.jpg', 'https://jubi.ua/c.webp'], source: 'https://jubi.ua/socks' });
    expect(repo.data.products[0].photos).toEqual([]);
  });
  it('не пропонує більше, ніж уміщається, і не працює з неіснуючим товаром', async () => {
    const full = Array.from({ length: 7 }, (_, i) => ({ id: 'f' + i, data: PNG }));
    const repo = await withProduct(full);
    const { effect } = await runTool('propose_product_photos', { productId: 'p1', urls: ['https://a.ua/1.jpg', 'https://a.ua/2.jpg'] }, { repo, now: new Date() });
    expect(effect.urls).toHaveLength(1);
    await expect(runTool('propose_product_photos', { productId: 'nope', urls: ['https://a.ua/1.jpg'] }, { repo, now: new Date() })).rejects.toThrow(/не знайдено/);
    await expect(runTool('propose_product_photos', { productId: 'p1', urls: ['ftp://a.ua/1.jpg'] }, { repo, now: new Date() })).rejects.toThrow(/https/);
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
