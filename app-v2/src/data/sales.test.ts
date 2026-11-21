import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { SalesRepository } from './sales';

function fakeDb(stock: number[] = [10], failMovement = false) {
  const balances = stock.map((quantity,index)=>({id:'b'+index,batch_id:'batch'+index,quantity,expiry_date:index===0?'2027-01-01':'2027-06-01',unit_cost_minor:index===0?100:300}));
  const calls: Array<{sql:string;values?:unknown[]}> = [];
  const queryCalls: Array<{sql:string;values?:unknown[]}> = [];
  const db: SqliteExecutor = {
    execute: vi.fn(async () => undefined),
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      queryCalls.push({sql,values});
      if (sql.includes('FROM products')) return {values:[{id:'p1',name:'ماء',base_unit:'piece',purchase_cost_minor:200,sale_price_minor:350}]};\n      if (sql.includes('SELECT credit_limit_minor FROM customers')) return {values:[{credit_limit_minor:0}]};
      if (sql.includes('FROM stock_balances')) return {values:balances.filter(x=>x.quantity>0).map(x=>({...x}))};
      return {values:[]};
    }),
    run: vi.fn(async (sql:string,values?:unknown[]) => {
      calls.push({sql,values});
      if (failMovement && sql.includes('INSERT INTO stock_movements')) throw new Error('movement insert failed');
      if (sql.includes('UPDATE stock_balances')) {
        const row=balances.find(x=>x.id===values?.[2]); if(row) row.quantity=Number(values?.[0]);
      }
    }),
    beginTransaction: vi.fn(async()=>undefined),
    commitTransaction: vi.fn(async()=>undefined),
    rollbackTransaction: vi.fn(async()=>undefined),
  };
  return {db,calls,balances,queryCalls};
}
const base = {
  id:'inv1',invoiceNumber:'F-0001',customerId:'c1',sellerUserId:'u1',locationId:'loc-depot-main',
  lines:[{productId:'p1',quantity:3}],collectedMinor:500,paymentMethod:'cash' as const,
};

describe('SalesRepository',()=>{
  it('creates invoice, snapshots lines, collects partial payment and deducts stock atomically',async()=>{
    const {db,calls,balances,queryCalls}=fakeDb([2,5]);
    const repo=new SalesRepository(db,()=> '2026-11-20T12:00:00.000Z',()=> 'generated-id');
    const result=await repo.create(base);
    expect(result).toMatchObject({subtotalMinor:1050,discountMinor:0,totalMinor:1050,collectedMinor:500,dueMinor:550,lineCount:1});
    expect(balances.map(x=>x.quantity)).toEqual([0,4]);
    const stockQuery=queryCalls.find(x=>x.sql.includes('FROM stock_balances'));
    expect(stockQuery?.values).toEqual([200,'p1',null,'loc-depot-main']);
    expect(calls.some(x=>x.sql.includes('INSERT INTO invoices'))).toBe(true);
    expect(calls.some(x=>x.sql.includes('INSERT INTO invoice_lines'))).toBe(true);
    expect(calls.filter(x=>x.sql.includes('INSERT INTO invoice_line_batch_allocations'))).toHaveLength(2);
    const invoiceLine = calls.find(x=>x.sql.includes('INSERT INTO invoice_lines'));
    expect(invoiceLine?.values?.[6]).toBe(167);
    expect(calls.filter(x=>x.sql.includes('INSERT INTO invoice_line_batch_allocations')).map(x=>x.values?.[4])).toEqual([100,300]);
    expect(calls.some(x=>x.sql.includes('INSERT INTO payments'))).toBe(true);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock and rolls back the whole sale',async()=>{
    const {db}=fakeDb([2]);
    await expect(new SalesRepository(db).create({...base,lines:[{productId:'p1',quantity:3}]})).rejects.toThrow('المخزون غير كافٍ');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });

  it('rejects a discount greater than subtotal before opening a transaction',async()=>{
    const {db}=fakeDb();
    await expect(new SalesRepository(db).create({...base,discountMinor:1051})).rejects.toThrow('التخفيض');
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });

  it('rejects collection above invoice total',async()=>{
    const {db}=fakeDb();
    await expect(new SalesRepository(db).create({...base,collectedMinor:351*3})).rejects.toThrow('المبلغ المؤدى');
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });

  it('rolls back invoice and stock work if a movement cannot be recorded',async()=>{
    const {db}=fakeDb([10],true);
    await expect(new SalesRepository(db).create(base)).rejects.toThrow('movement insert failed');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });

  it('can participate in a caller-owned transaction without committing or rolling it back',async()=>{
    const {db}=fakeDb([10]);
    const repo=new SalesRepository(db);
    await repo.create(base,'external');
    expect(db.beginTransaction).not.toHaveBeenCalled();
    expect(db.commitTransaction).not.toHaveBeenCalled();
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('does not roll back a caller-owned transaction when sale work fails',async()=>{
    const {db}=fakeDb([2]);
    await expect(new SalesRepository(db).create({...base,lines:[{productId:'p1',quantity:3}]},'external')).rejects.toThrow('المخزون غير كافٍ');
    expect(db.beginTransaction).not.toHaveBeenCalled();
    expect(db.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rejects empty and non-positive invoice lines',async()=>{
    const {db}=fakeDb();
    await expect(new SalesRepository(db).create({...base,lines:[]})).rejects.toThrow('منتج واحد');
    await expect(new SalesRepository(db).create({...base,lines:[{productId:'p1',quantity:0}]})).rejects.toThrow('الكمية');
  });
});
