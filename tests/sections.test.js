import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { DEFAULT_SECTIONS, SECTIONS_REV, guessSub, groupProducts, guessSection, normalizeSections, planRegroup, sectionsToText, sortProducts, textToSections } from '../src/core/sections.js';

const data = extra => Schema.normalize({ ...Schema.empty(), ...extra });

describe('розділи товарів', () => {
  it('за замовчуванням шість розділів з невеликим набором підрозділів', () => {
    const d = data({});
    expect(d.settings.sections.map(s => s.name)).toEqual(['Труси', 'Шкарпетки', 'Піжами', 'Тапки', 'Колготи', 'Халати']);
    expect(d.settings.sections[1].subs).toEqual(['Класичні', 'З принтом', 'Зимові', 'Спортивні', 'Короткі та сліди', 'Без резинки', 'Дитячі']);
    d.settings.sections.forEach(s => expect(s.subs.length).toBeLessThanOrEqual(7));
  });
  it('старі дані без розділів отримують типові, підрозділ товару зберігається', () => {
    const d = Schema.normalize({ settings: {}, products: [{ name: 'A', category: 'Шкарпетки', subcategory: 'Зимові' }] });
    expect(d.settings.sections).toHaveLength(DEFAULT_SECTIONS.length);
    expect(d.products[0].subcategory).toBe('Зимові');
  });
  it('редактор: текст ↔ розділи, дублікати й порожні рядки прибираються', () => {
    const list = textToSections('Шкарпетки: Махрові, Стрейч , ,Махрові\n\nТруси\nтруси\nХалати:');
    expect(list).toEqual([{ name: 'Шкарпетки', subs: ['Махрові', 'Стрейч'] }, { name: 'Труси', subs: [] }, { name: 'Халати', subs: [] }]);
    expect(textToSections(sectionsToText(list))).toEqual(list);
    expect(normalizeSections([{ name: '  ' }])).toEqual([]);
  });
  it('кожна шкарпетка отримує підрозділ: за словами в назві, інакше «Класичні»', () => {
    const s = normalizeSections();
    const sub = t => guessSection(t, s)?.subcategory;
    expect(sub('02 – Шкарпетки жіночі з написом білі')).toBe('З принтом');
    expect(sub('47 – Шкарпетки чоловічі вишиванка чорні')).toBe('З принтом');
    expect(sub('63 – Шкарпетки жіночі з вишивкою білі')).toBe('З принтом');
    expect(sub('50 – Шкарпетки чоловічі зимові темні')).toBe('Зимові');
    expect(sub('Носки махрові чоловічі')).toBe('Зимові');
    expect(sub('Шкарпетки-сліди жіночі')).toBe('Короткі та сліди');
    expect(sub('Шкарпетки медичні без резинки')).toBe('Без резинки');
    expect(sub('Шкарпетки дитячі зимові')).toBe('Дитячі');
    expect(sub('Шкарпетки спортивні')).toBe('Спортивні');
    expect(sub('Шкарпетки чоловічі чорні')).toBe('Класичні');
    expect(sub('Шкарпетки стрейч бамбук')).toBe('Класичні');
  });
  it('підрозділи інших розділів', () => {
    const s = normalizeSections();
    const g = t => guessSection(t, s);
    expect(g('Тапочки флісові')).toEqual({ category: 'Тапки', subcategory: 'Інші' });
    expect(g('Тапочки-зайчики')?.subcategory).toBe('Тапки-іграшки');
    expect(g('Колготки 20 den')?.subcategory).toBe('Тонкі (до 20 den)');
    expect(g('Колготки 40 DEN')?.subcategory).toBe('Середні (30–40 den)');
    expect(g('Колготки 70 den')?.subcategory).toBe('Щільні (50+ den)');
    expect(g('Колготки ажурні')?.subcategory).toBe('Фантазійні');
    expect(g('Колготки')?.subcategory).toBe('Інші');
    expect(g('Боксери чоловічі')).toEqual({ category: 'Труси', subcategory: 'Боксери та шорти' });
    expect(g('Труси стрінги')?.subcategory).toBe('Стрінги та бразиліана');
    expect(g('Піжама з шортами')?.subcategory).toBe('З шортами');
    expect(g('Піжама велюрова зі штанами')?.subcategory).toBe('Теплі');
    expect(g('Халат вафельний')?.subcategory).toBe('Махрові та вафельні');
    expect(g('Парасолька')).toBeNull();
    // власний підрозділ розпізнається за основою назви
    expect(guessSub('шкарпетки лляні', { name: 'Шкарпетки', subs: ['Лляні'] })).toBe('Лляні');
  });
  it('оновлення збережених розділів: старі типові підрозділи замінюються, власні лишаються', () => {
    const saved = { settings: { sectionsRev: 2, sections: [{ name: 'Шкарпетки', subs: ['Махрові', 'Мої', 'Стрейч'] }, { name: 'Аксесуари', subs: [] }] } };
    const d = Schema.normalize(saved);
    expect(d.settings.sectionsRev).toBe(SECTIONS_REV);
    expect(d.settings.sections.find(s => s.name === 'Шкарпетки').subs).toEqual(['Класичні', 'З принтом', 'Зимові', 'Спортивні', 'Короткі та сліди', 'Без резинки', 'Дитячі', 'Мої']);
    expect(d.settings.sections.map(s => s.name)).toEqual(['Шкарпетки', 'Аксесуари', 'Труси', 'Піжами', 'Тапки', 'Колготи', 'Халати']);
    // після оновлення зміни користувача не перезаписуються
    const again = Schema.normalize({ settings: { sections: [{ name: 'Шкарпетки', subs: ['Мої'] }], sectionsRev: SECTIONS_REV } });
    expect(again.settings.sections).toEqual([{ name: 'Шкарпетки', subs: ['Мої'] }]);
  });
  it('розкладання: товари без підрозділу й зі старим підрозділом отримують новий, решта не змінюється', () => {
    const d = data({
      suppliers: [{ id: 's1', name: 'Опт', categories: ['Домашні тапки'] }, { id: 's2', name: 'Без категорій', categories: [] }],
      products: [
        { id: 'p1', name: 'Тапки флісові', category: 'Домашні тапки', supplierId: 's1' },
        { id: 'p2', name: 'Шкарпетки чоловічі зимові', category: 'Шкарпетки', supplierId: 's2' },
        { id: 'p3', name: 'Шкарпетки', category: 'Шкарпетки', subcategory: 'З принтом' },
        { id: 'p4', name: 'Брелок', category: 'Аксесуари' },
        { id: 'p5', name: 'Махра чоловіча', category: 'Шкарпетки', subcategory: 'Махрові' },
        { id: 'p6', name: 'Шкарпетки чорні', category: 'Шкарпетки' },
      ],
    });
    const plan = planRegroup(d);
    expect(plan.products).toEqual([
      { id: 'p1', name: 'Тапки флісові', from: 'Домашні тапки', to: { category: 'Тапки', subcategory: 'Інші' } },
      { id: 'p2', name: 'Шкарпетки чоловічі зимові', from: 'Шкарпетки', to: { category: 'Шкарпетки', subcategory: 'Зимові' } },
      { id: 'p5', name: 'Махра чоловіча', from: 'Шкарпетки › Махрові', to: { category: 'Шкарпетки', subcategory: 'Зимові' } },
      { id: 'p6', name: 'Шкарпетки чорні', from: 'Шкарпетки', to: { category: 'Шкарпетки', subcategory: 'Класичні' } },
    ]);
    expect(plan.suppliers).toEqual([
      { id: 's1', name: 'Опт', to: { categories: ['Тапки'] } },
      { id: 's2', name: 'Без категорій', to: { categories: ['Шкарпетки'] } },
    ]);
    // після застосування плану всі шкарпетки мають підрозділ і план порожній
    plan.products.forEach(x => Object.assign(d.products.find(p => p.id === x.id), x.to));
    expect(d.products.filter(p => p.category === 'Шкарпетки').every(p => p.subcategory)).toBe(true);
    expect(planRegroup(d).products).toEqual([]);
  });
  it('групує за розділами в порядку налаштувань і сортує всередині', () => {
    const d = data({ products: [
      { id: 'a', name: 'Б', category: 'Шкарпетки', subcategory: 'Зимові', retailPrice: 50 },
      { id: 'b', name: 'А', category: 'Шкарпетки', subcategory: 'З принтом', retailPrice: 90 },
      { id: 'c', name: 'В', category: 'Шкарпетки', retailPrice: 10 },
      { id: 'd', name: 'Г', category: 'Труси' },
      { id: 'e', name: 'Ґ', category: '' },
      { id: 'f', name: 'Д', category: 'Аксесуари' },
    ] });
    const g = groupProducts(d.products, d.settings.sections, 'name');
    expect(g.map(x => x.name)).toEqual(['Труси', 'Шкарпетки', 'Аксесуари', '']);
    expect(g[1].subs.map(x => [x.name, x.items.map(p => p.id)])).toEqual([['З принтом', ['b']], ['Зимові', ['a']], ['', ['c']]]);
    expect(sortProducts(d.products.filter(p => p.category === 'Шкарпетки'), 'retail-desc').map(p => p.id)).toEqual(['b', 'a', 'c']);
    expect(sortProducts(d.products, 'retail-asc').slice(-1)[0].retailPrice).toBeNull();
  });
});
