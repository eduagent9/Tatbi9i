import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { StockRepository } from './stock';

function stockDb(initial = 10, failMovement = false) {
  const balances = new Map<string,{id:string;quantity:number}>();
  balances.set('depot',{id:'bal-depot',quantity:initial});
  const db: SqliteExecutor = {
    execute: vi.fn(async () => undefined),
    query: vi.fn(async (_sql: string, values?: unknown[]) => {
      if (_sql.includes('SELECT id, quantity')) { const key=String(values?.[2]); const row=balances.get(key); return {values:row?[row]:[]}; }
      return {values:Array.from(balances.entries()).map(([location,row])=>({product_id:'p1',variant_id:null,location_id:location,batch_id:null,quantity:row.quantity}))};
    }),
    run: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('UPDATE stock_balances')) { const row=balances.get('depot'); if(row) row.quantity=Number(values?.[0]); }
      if (sql.includes('INSERT INTO stock_balances')) balances.set(String(values?.[3]),{id:String(values?.[0]),quantity:Number(values?.[5])});
      if (failMovement && sql.includes('INSERT INTO stock_movements')) throw new Error('movement failed');
    }),
    beginTransaction: vi.fn(async () => undefined), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined),
  };
  return {db,balances};
}

describe('StockRepository', () => {
  it('records an inbound stock receipt', async () => {
    const {db,balances}=stockDb(0); const repo=new StockRepository(db,()=> '2026-11-20T12:00:00.000Z');
    await repo.record({id:'m1',productId:'p1',toLocationId:'depot',quantity:24,movementType:'purchase_receipt'});
    expect(balances.get('depot')?.quantity).toBe(24); expect(db.commitTransaction).toHaveBeenCalledOnce();
  });
  it('refuses to issue more stock than available', async () => {
    const {db}=stockDb(3); const repo=new StockRepository(db);
    await expect(repo.record({id:'m2',productId:'p1',fromLocationId:'depot',quantity:4,movementType:'sale'})).rejects.toThrow('الكمية غير كافية');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce(); expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('rolls back balance changes when movement insert fails', async () => {
    const {db}=stockDb(10,true); const repo=new StockRepository(db);
    await expect(repo.record({id:'m3',productId:'p1',fromLocationId:'depot',quantity:2,movementType:'sale'})).rejects.toThrow('movement failed');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  });

  it('lists only batches with a positive balance and expiry date',async()=>{
    const db=stockDb().db;
    db.query=vi.fn(async(sql:string)=>sql.includes('JOIN product_batches')
      ? {values:[{product_id:'p1',product_name:'ماء',batch_id:'b1',batch_code:'LOT-1',expiry_date:'2026-12-01',location_label:'المستودع الرئيسي',quantity:8}]}
      : {values:[]});
    const rows=await new StockRepository(db).getExpiryAlerts();
    expect(rows).toEqual([{product_id:'p1',product_name:'ماء',batch_id:'b1',batch_code:'LOT-1',expiry_date:'2026-12-01',location_label:'المستودع الرئيسي',quantity:8}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('sb.quantity>0'));
  });

  it('rejects zero quantity and identical transfer locations', async () => {
    const repo=new StockRepository(stockDb().db);
    await expect(repo.record({id:'m4',productId:'p1',toLocationId:'depot',quantity:0,movementType:'opening'})).rejects.toThrow(RangeError);
    await expect(repo.record({id:'m5',productId:'p1',fromLocationId:'depot',toLocationId:'depot',quantity:1,movementType:'transfer'})).rejects.toThrow('مختلفين');
  });
});
