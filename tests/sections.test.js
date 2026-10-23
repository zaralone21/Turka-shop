import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { DEFAULT_SECTIONS, SECTIONS_REV, guessSub, groupProducts, guessSection, normalizeSections, planRegroup, sectionsToText, sortProducts, textToSections } from '../src/core/sections.js';

const data = extra => Schema.normalize({ ...Schema.empty(), ...extra });

describe('розділи товарів', () => {
  it('за замовчуванням є шість розділів, підрозділи шкарпеток', () => {
    const d = data({});
    expect(d.settings.sections.map(s => s.name)).toEqual(['Труси', 'Шкарпетки', 'Піжами', 'Тапки', 'Колготи', 'Халати']);
    expect(d.settings.sections[1].subs).toEqual(expect.arrayContaining(['Махрові', 'Стрейч', 'Без резинки', 'Сліди', 'Бамбукові', 'Термо та вовняні']));
    d.settings.sections.forEach(s => expect(s.subs.length).toBeGreaterThan(5));
  });
  it('старі дані без розділів отримують типові, підрозділ товару зберігається', () => {
    const d = Schema.normalize({ settings: {}, products: [{ name: 'A', category: 'Шкарпетки', subcategory: 'Махрові' }] });
    expect(d.settings.sections).toHaveLength(DEFAULT_SECTIONS.length);
    expect(d.products[0].subcategory).toBe('Махрові');
  });
  it('редактор: текст ↔ розділи, дублікати й порожні рядки прибираються', () => {
    const list = textToSections('Шкарпетки: Махрові, Стрейч , ,Махрові\n\nТруси\nтруси\nХалати:');
    expect(list).toEqual([{ name: 'Шкарпетки', subs: ['Махрові', 'Стрейч'] }, { name: 'Труси', subs: [] }, { name: 'Халати', subs: [] }]);
    expect(textToSections(sectionsToText(list))).toEqual(list);
    expect(normalizeSections([{ name: '  ' }])).toEqual([]);
  });
  it('вгадує розділ і підрозділ за назвою', () => {
    const s = normalizeSections();
    expect(guessSection('Носки махрові чоловічі', s)).toEqual({ category: 'Шкарпетки', subcategory: 'Махрові' });
    expect(guessSection('Шкарпетки без резинки бамбук', s)).toEqual({ category: 'Шкарпетки', subcategory: 'Без резинки' });
    expect(guessSection('Тапочки флісові', s)).toEqual({ category: 'Тапки', subcategory: '' });
    expect(guessSection('Колготки 40 den', s)?.category).toBe('Колготи');
    expect(guessSection('Боксери чоловічі', s)?.category).toBe('Труси');
    expect(guessSection('Халат махровий', s)?.category).toBe('Халати');
    expect(guessSection('Парасолька', s)).toBeNull();
  });
  it('план розкладання: старі категорії → розділи, постачальники отримують розділи', () => {
    const d = data({
      suppliers: [{ id: 's1', name: 'Опт', categories: ['Домашні тапки'] }, { id: 's2', name: 'Без категорій', categories: [] }],
      products: [
        { id: 'p1', name: 'Тапки флісові', category: 'Домашні тапки', supplierId: 's1' },
        { id: 'p2', name: 'Носки стрейч', category: 'Шкарпетки', supplierId: 's2' },
        { id: 'p3', name: 'Шкарпетки', category: 'Шкарпетки', subcategory: 'Махрові' },
        { id: 'p4', name: 'Брелок', category: 'Аксесуари' },
      ],
    });
    const plan = planRegroup(d);
    expect(plan.products).toEqual([
      { id: 'p1', name: 'Тапки флісові', from: 'Домашні тапки', to: { category: 'Тапки', subcategory: '' } },
      { id: 'p2', name: 'Носки стрейч', from: 'Шкарпетки', to: { category: 'Шкарпетки', subcategory: 'Стрейч' } },
    ]);
    expect(plan.suppliers).toEqual([
      { id: 's1', name: 'Опт', to: { categories: ['Тапки'] } },
      { id: 's2', name: 'Без категорій', to: { categories: ['Шкарпетки'] } },
    ]);
  });
  it('групує за розділами в порядку налаштувань і сортує всередині', () => {
    const d = data({ products: [
      { id: 'a', name: 'Б', category: 'Шкарпетки', subcategory: 'Стрейч', retailPrice: 50 },
      { id: 'b', name: 'А', category: 'Шкарпетки', subcategory: 'Махрові', retailPrice: 90 },
      { id: 'c', name: 'В', category: 'Шкарпетки', retailPrice: 10 },
      { id: 'd', name: 'Г', category: 'Труси' },
      { id: 'e', name: 'Ґ', category: '' },
      { id: 'f', name: 'Д', category: 'Аксесуари' },
    ] });
    const g = groupProducts(d.products, d.settings.sections, 'name');
    expect(g.map(x => x.name)).toEqual(['Труси', 'Шкарпетки', 'Аксесуари', '']);
    expect(g[1].subs.map(x => [x.name, x.items.map(p => p.id)])).toEqual([['Махрові', ['b']], ['Стрейч', ['a']], ['', ['c']]]);
    expect(sortProducts(d.products.filter(p => p.category === 'Шкарпетки'), 'retail-desc').map(p => p.id)).toEqual(['b', 'a', 'c']);
    expect(sortProducts(d.products, 'retail-asc').slice(-1)[0].retailPrice).toBeNull();
  });
  it('збережені розділи один раз доповнюються новими типовими підрозділами', () => {
    const saved = { settings: { sections: [{ name: 'Шкарпетки', subs: ['Махрові', 'Мої'] }, { name: 'Аксесуари', subs: [] }] } };
    const d = Schema.normalize(saved);
    expect(d.settings.sectionsRev).toBe(SECTIONS_REV);
    const socks = d.settings.sections.find(s => s.name === 'Шкарпетки');
    expect(socks.subs.slice(0, 2)).toEqual(['Махрові', 'Мої']);
    expect(socks.subs).toContain('Сліди');
    expect(d.settings.sections.map(s => s.name)).toEqual(['Шкарпетки', 'Аксесуари', 'Труси', 'Піжами', 'Тапки', 'Колготи', 'Халати']);
    // після міграції прибрані користувачем підрозділи не повертаються
    const again = Schema.normalize({ settings: { sections: [{ name: 'Шкарпетки', subs: ['Мої'] }], sectionsRev: SECTIONS_REV } });
    expect(again.settings.sections).toEqual([{ name: 'Шкарпетки', subs: ['Мої'] }]);
  });
  it('розпізнає підрозділи в усіх розділах', () => {
    const s = normalizeSections();
    const sub = t => guessSection(t, s);
    expect(sub('Шкарпетки-сліди жіночі')).toEqual({ category: 'Шкарпетки', subcategory: 'Сліди' });
    expect(sub('Шкарпетки махрові без резинки')?.subcategory).toBe('Без резинки');
    expect(sub('Носки бамбукові чоловічі')?.subcategory).toBe('Бамбукові');
    expect(sub('Шкарпетки вовняні зимові')?.subcategory).toBe('Термо та вовняні');
    expect(sub('Колготки 20 den')?.subcategory).toBe('Тонкі (до 20 den)');
    expect(sub('Колготки 40 DEN')?.subcategory).toBe('Середні (30–40 den)');
    expect(sub('Колготки 70 den')?.subcategory).toBe('Щільні (50+ den)');
    expect(sub('Колготки ажурні')?.subcategory).toBe('Ажурні та сітка');
    expect(sub('Труси стрінги')?.subcategory).toBe('Стрінги');
    expect(sub('Трусики сліпи безшовні')?.subcategory).toBe('Безшовні');
    expect(sub('Піжама з шортами сатинова')?.subcategory).toBe('Шовкові та сатинові');
    expect(sub('Тапочки-зайчики')?.subcategory).toBe('Тапки-іграшки');
    expect(sub('Халат вафельний')?.subcategory).toBe('Вафельні');
    // власний підрозділ розпізнається за основою назви
    expect(guessSub('шкарпетки лляні', { name: 'Шкарпетки', subs: ['Лляні'] })).toBe('Лляні');
  });
  it('розкладання: товар уже в розділі отримує підрозділ навіть без назви розділу в назві', () => {
    const d = data({ products: [{ id: 'p1', name: 'Махра чоловіча', category: 'Шкарпетки' }, { id: 'p2', name: 'Сліди', category: 'Шкарпетки', subcategory: 'Мої' }] });
    expect(planRegroup(d).products).toEqual([{ id: 'p1', name: 'Махра чоловіча', from: 'Шкарпетки', to: { category: 'Шкарпетки', subcategory: 'Махрові' } }]);
  });
});
