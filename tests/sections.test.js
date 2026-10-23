import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { DEFAULT_SECTIONS, groupProducts, guessSection, normalizeSections, planRegroup, sectionsToText, sortProducts, textToSections } from '../src/core/sections.js';

const data = extra => Schema.normalize({ ...Schema.empty(), ...extra });

describe('розділи товарів', () => {
  it('за замовчуванням є шість розділів, підрозділи шкарпеток', () => {
    const d = data({});
    expect(d.settings.sections.map(s => s.name)).toEqual(['Труси', 'Шкарпетки', 'Піжами', 'Тапки', 'Колготи', 'Халати']);
    expect(d.settings.sections[1].subs).toEqual(['Махрові', 'Стрейч', 'Без резинки']);
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
});
