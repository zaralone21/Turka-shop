import { describe, it, expect } from 'vitest';
import { Schema } from '../src/core/schema.js';
import { APP_ID, SCHEMA_VERSION } from '../src/core/utils.js';

describe('перевірка файлу імпорту', () => {
  it('приймає власний експорт', () => {
    const d = Schema.empty();
    d.suppliers.push({ id: 's1', name: 'Постачальник' });
    d.products.push({ id: 'p1', name: 'Товар', supplierId: 's1', purchasePrice: '12,5' });
    const r = Schema.validateImport(JSON.parse(JSON.stringify(d)));
    expect(r.ok).toBe(true);
    expect(r.counts.products).toBe(1);
    expect(r.data.products[0].purchasePrice).toBe(12.5);
  });
  it('відхиляє чужий файл', () => {
    expect(Schema.validateImport({ foo: 1 }).ok).toBe(false);
    expect(Schema.validateImport([]).ok).toBe(false);
  });
  it('відхиляє файл новішої версії', () => {
    const r = Schema.validateImport({ app: APP_ID, schemaVersion: SCHEMA_VERSION + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/новішою/);
  });
  it('відхиляє записи без назви', () => {
    const r = Schema.validateImport({ app: APP_ID, schemaVersion: 1, suppliers: [{ id: 'x' }] });
    expect(r.ok).toBe(false);
  });
  it('відв’язує товари від неіснуючого постачальника', () => {
    const r = Schema.validateImport({ app: APP_ID, schemaVersion: 1, products: [{ name: 'A', supplierId: 'missing' }] });
    expect(r.data.products[0].supplierId).toBeNull();
  });
  it('зберігає невідомі поля для майбутніх версій', () => {
    const r = Schema.validateImport({ app: APP_ID, schemaVersion: 1, notes: [{ title: 'n', future: 42 }] });
    expect(r.data.notes[0].future).toBe(42);
  });
});
