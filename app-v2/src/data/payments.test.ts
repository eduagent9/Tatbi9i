import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { PaymentRepository } from './payments';

function fakeDb(collected=200,failPayment=false) {
  const invoice={id:'i1',customer_id:'c1',total_minor:1000,collected_minor:collected,status:'confirmed',confirmed_at:'2026-11-20T10:00:00Z'};
  const db:SqliteExecutor={
    execute:vi.fn(async()=>undefined),
    query:vi.fn(async()=>({values:[{...invoice}]})),
    run:vi.fn(async(sql:string,values?:unknown[])=>{
      if(sql.includes('UPDATE invoices')) invoice.collected_minor=Number(values?.[0]);
      if(failPayment&&sql.includes('INSERT INTO payments')) throw new Error('payment insert failed');
    }),
    beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
  };
  return {db,invoice};
}
const input={id:'pay1',invoiceId:'i1',amountMinor:300,method:'cash' as const,receivedBy:'u1'};

describe('PaymentRepository',()=>{
  it('records a partial debt payment and updates invoice balance',async()=>{
    const {db,invoice}=fakeDb(200);
    const result=await new PaymentRepository(db,()=> '2026-11-20T12:00:00Z',()=> 'audit1').collect(input);
    expect(invoice.collected_minor).toBe(500);
    expect(result).toMatchObject({totalMinor:1000,collectedMinor:500,dueMinor:500});
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });
  it('rejects payment greater than remaining debt',async()=>{
    const {db}=fakeDb(900);
    await expect(new PaymentRepository(db).collect(input)).rejects.toThrow('أكبر من الدين');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  });
  it('rolls back if payment history cannot be inserted',async()=>{
    const {db}=fakeDb(200,true);
    await expect(new PaymentRepository(db).collect(input)).rejects.toThrow('payment insert failed');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    expect(db.commitTransaction).not.toHaveBeenCalled();
  });
  it('rejects zero and fractional-cent payments',async()=>{
    const {db}=fakeDb();
    const repo=new PaymentRepository(db);
    await expect(repo.collect({...input,amountMinor:0})).rejects.toThrow(RangeError);
    await expect(repo.collect({...input,amountMinor:1.5})).rejects.toThrow(RangeError);
    expect(db.beginTransaction).not.toHaveBeenCalled();
  });
});
