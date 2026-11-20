import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { ProductRepository } from './products';

function fakeDb(failOnBarcode = false) {
  const db: SqliteExecutor = {
    execute: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ values: [{ id: 'p1', name: 'ماء', total_stock: 12, barcode: '6110001' }] })),
    run: vi.fn(async (sql: string) => { if (failOnBarcode && sql.includes('INSERT INTO barcodes')) throw new Error('barcode exists'); }),
    beginTransaction: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
  };
  return db;
}

describe('ProductRepository', () => {
  it('creates a piece product and barcode atomically', async () => {
    const db = fakeDb();
    const repo = new ProductRepository(db, () => '2026-11-20T12:00:00.000Z');
    await repo.create({ id: 'p1', name: ' ماء ', purchaseCostMinor: 250, salePriceMinor: 350, barcode: '6110001' });
    expect(db.beginTransaction).toHaveBeenCalledOnce();
    expect(db.run).toHaveBeenCalledTimes(2);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
  });
  it('rolls back product creation if barcode insertion fails', async () => {
    const db = fakeDb(true);
    const repo = new ProductRepository(db);
    await expect(repo.create({ id: 'p1', name: 'ماء', purchaseCostMinor: 1, salePriceMinor: 2, barcode: '6110001' })).rejects.toThrow('barcode exists');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('validates carton conversion and non-negative prices', async () => {
    const repo = new ProductRepository(fakeDb());
    await expect(repo.create({ id: 'p1', name: 'ماء', baseUnit: 'carton', piecesPerCarton: 0, purchaseCostMinor: 1, salePriceMinor: 2 })).rejects.toThrow('عدد القطع');
    await expect(repo.create({ id: 'p2', name: 'ماء', purchaseCostMinor: -1, salePriceMinor: 2 })).rejects.toThrow(RangeError);
  });
  it('lists products with stock totals and barcode', async () => {
    const db = fakeDb();
    const rows = await new ProductRepository(db).list();
    expect(rows[0]).toMatchObject({ id: 'p1', total_stock: 12, barcode: '6110001' });
    expect(db.query).toHaveBeenCalledOnce();
  });
});
