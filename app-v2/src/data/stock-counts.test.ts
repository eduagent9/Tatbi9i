import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {StockCountRepository} from './stock-counts';

function makeDb(initial=10,failMovement=false) {
  let balance:{id:string;quantity:number}|null=initial>0?{id:'balance-1',quantity:initial}:null;
  const db:SqliteExecutor={
    execute:vi.fn(async()=>undefined),
    query:vi.fn(async(sql:string)=>{
      if(sql.includes('SELECT id FROM products')) return {values:[{id:'p1'}]};
      if(sql.includes('SELECT id,quantity FROM stock_balances')) return {values:balance?[balance]:[]};
      if(sql.includes('SELECT id FROM product_batches')) return {values:[{id:'batch-1'}]};
      return {values:[]};
    }),
    run:vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.includes('UPDATE stock_balances')) balance={id:'balance-1',quantity:Number(values?.[0])};
      if(sql.includes('INSERT INTO stock_balances')) balance={id:String(values?.[0]),quantity:Number(values?.[5])};
      if(failMovement&&sql.includes('INSERT INTO stock_movements')) throw new Error('movement failed');
    }),
    beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
  };
  return {db,getBalance:()=>balance};
}
const base={id:'count-1',countNumber:'SC-001',locationId:'depot',countedBy:'local-owner',
  lines:[{id:'line-1',productId:'p1',countedQuantity:7}]};

describe('StockCountRepository',()=>{
  it('records the expected and counted quantities and applies a shortage adjustment',async()=>{
    const {db,getBalance}=makeDb(10);
    const result=await new StockCountRepository(db,()=> '2026-11-20T12:00:00Z',()=> 'generated-id').complete(base);
    expect(result).toEqual({countId:'count-1',countNumber:'SC-001',lineCount:1,changedLineCount:1,totalAbsoluteVariance:3});
    expect(getBalance()?.quantity).toBe(7);
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['stock_count','stock_count','count-1','local-owner']));
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });
  it('adds a positive adjustment when the counted quantity exceeds the balance',async()=>{
    const {db,getBalance}=makeDb(0);
    await new StockCountRepository(db,()=> '2026-11-20T12:00:00Z',()=> 'new-balance').complete(base);
    expect(getBalance()?.quantity).toBe(7);
  });
  it('does not create a movement when there is no variance',async()=>{
    const {db}=makeDb(7);
    const result=await new StockCountRepository(db).complete(base);
    expect(result.changedLineCount).toBe(0);
    expect(db.run).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'),expect.anything());
  });
  it('rolls back the count and balance when movement logging fails',async()=>{
    const {db}=makeDb(10,true);
    await expect(new StockCountRepository(db).complete(base)).rejects.toThrow('movement failed');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('rejects negative quantities and duplicate product/batch lines before writing',async()=>{
    const {db}=makeDb();
    await expect(new StockCountRepository(db).complete({...base,lines:[{...base.lines[0],countedQuantity:-1}]})).rejects.toThrow(RangeError);
    await expect(new StockCountRepository(db).complete({...base,lines:[base.lines[0],{...base.lines[0],id:'line-2'}]})).rejects.toThrow('مكرر');
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });
});
