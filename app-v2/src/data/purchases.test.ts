import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { PurchaseRepository } from './purchases';

function purchaseDb(failMovement=false) {
  const balances=new Map<string,{id:string;quantity:number}>();
  const db:SqliteExecutor={
    execute:vi.fn(async()=>undefined),
    query:vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.includes('SELECT id,name,purchase_cost_minor')) return {values:[{id:String(values?.[0]),name:'ماء',purchase_cost_minor:100}]};
      if(sql.includes('SELECT purchase_cost_minor')) return {values:[{purchase_cost_minor:100}]};
      if(sql.includes('SELECT id,quantity FROM stock_balances')) { const key=String(values?.[0])+':'+String(values?.[1])+':'+String(values?.[2]??'null'); const row=balances.get(key); return {values:row?[row]:[]}; }
      if(sql.includes('SELECT COALESCE(SUM(quantity)')) return {values:[{quantity:Array.from(balances.values()).reduce((n,r)=>n+r.quantity,0)}]};
      return {values:[]};
    }),
    run:vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.includes('INSERT INTO stock_balances')) { const key=String(values?.[1])+':'+String(values?.[2])+':'+String(values?.[3]??'null'); balances.set(key,{id:String(values?.[0]),quantity:Number(values?.[4])}); }
      if(sql.includes('UPDATE stock_balances')) { for(const row of balances.values()) if(row.id===values?.[2]) row.quantity=Number(values?.[0]); }
      if(failMovement&&sql.includes('INSERT INTO stock_movements')) throw new Error('movement failed');
    }),
    beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
  };
  return {db,balances};
}
const input={id:'pr1',receiptNumber:'ACH-001',supplierId:'sup1',receivedBy:'owner1',locationId:'loc-depot-main',lines:[{productId:'p1',quantity:10,unitCostMinor:125,batchCode:'B-1',expiryDate:'2027-12-31'}]};
describe('PurchaseRepository',()=>{
  it('records a supplier receipt, expiry batch and stock in one transaction',async()=>{
    const {db,balances}=purchaseDb(); const repo=new PurchaseRepository(db,()=> '2026-11-20T12:00:00.000Z',()=> 'generated-id');
    const result=await repo.create(input);
    expect(result.totalMinor).toBe(1250); expect(result.lineCount).toBe(1);
    expect(balances.size).toBe(1); expect(Array.from(balances.values())[0].quantity).toBe(10);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });
  it('rejects impossible expiry dates before writing',async()=>{
    const {db}=purchaseDb(); const repo=new PurchaseRepository(db);
    await expect(repo.create({...input,lines:[{...input.lines[0],expiryDate:'2027-02-30'}]})).rejects.toThrow('تاريخ الصلاحية');
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });
  it('rolls back all receipt work if stock movement fails',async()=>{
    const {db}=purchaseDb(true); const repo=new PurchaseRepository(db);
    await expect(repo.create(input)).rejects.toThrow('movement failed');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce(); expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('rejects empty and invalid quantity lines',async()=>{
    const repo=new PurchaseRepository(purchaseDb().db);
    await expect(repo.create({...input,lines:[]})).rejects.toThrow('منتج واحد');
    await expect(repo.create({...input,lines:[{...input.lines[0],quantity:0}]})).rejects.toThrow('الكمية');
  });
});
