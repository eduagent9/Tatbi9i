import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { ProductRepository } from './products';

function fakeDb(failOnBarcode = false, stockQuantity = 0) {
  const db: SqliteExecutor = {
    execute: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string) => sql.includes('SUM(quantity)') ? ({ values: [{ quantity: stockQuantity }] }) : ({ values: [{ id: 'p1', name: 'ماء', total_stock: 12, barcode: '6110001' }] })),
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
  it('persists a local product photo URI without changing product identity or stock',async()=>{
    const db=fakeDb(),repo=new ProductRepository(db);
    const photo='data:image/jpeg;base64,ZmFrZQ==';
    await repo.create({id:'p-photo',name:'عصير',purchaseCostMinor:100,salePriceMinor:150,imageLocalUri:photo});
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('image_local_uri'),expect.arrayContaining([photo]));
    expect(db.commitTransaction).toHaveBeenCalledOnce();
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
  it('updates catalog details and replaces the barcode without touching stock history',async()=>{
    const db=fakeDb(),repo=new ProductRepository(db,()=> '2026-11-21T12:00:00.000Z');
    await repo.update({id:'p1',name:'ماء جديد',purchaseCostMinor:260,salePriceMinor:400,barcode:'6119999'});
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE products'),expect.arrayContaining(['ماء جديد']));
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM barcodes WHERE product_id=? AND variant_id IS NULL'),['p1']);
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO barcodes'),['p1:barcode','p1','6119999','piece',1]);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });
  it('rolls back product edits when a replacement barcode conflicts',async()=>{
    const db=fakeDb(true),repo=new ProductRepository(db);
    await expect(repo.update({id:'p1',name:'ماء',purchaseCostMinor:1,salePriceMinor:2,barcode:'duplicate'})).rejects.toThrow('barcode exists');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('archives rather than deleting a product',async()=>{
    const db=fakeDb(),repo=new ProductRepository(db);
    await repo.archive('p1','owner');
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET is_active=0'),expect.any(Array));
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'),expect.arrayContaining(['product.archived']));
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });

  it('refuses to archive a product that still has stock',async()=>{
    const db=fakeDb(false,5),repo=new ProductRepository(db);
    await expect(repo.archive('p1','owner')).rejects.toThrow('ما يمكنش أرشفة');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });

});
