import { describe, expect, it, vi } from 'vitest';
import type { SqliteExecutor } from './sqlite-database';
import { CustomerRepository } from './customers';

function fakeDb() {
  const db:SqliteExecutor={
    execute:vi.fn(async()=>undefined),
    query:vi.fn(async()=>({values:[{id:'c1',name:'متجر الأمل',phone:'0600000000',city:'برشيد',region:null,address:null,notes:null,invoice_count:2,debt_minor:4500}]})),
    run:vi.fn(async()=>undefined),
    beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
  };
  return db;
}

describe('CustomerRepository',()=>{
  it('creates a customer with normalized optional fields',async()=>{
    const db=fakeDb();
    await new CustomerRepository(db,()=> '2026-11-20T12:00:00Z').create({id:'c1',name:' متجر الأمل ',phone:' 0600000000 ',city:' برشيد '});
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO customers'),[
      'c1','متجر الأمل','0600000000','برشيد',null,null,null,'2026-11-20T12:00:00Z','2026-11-20T12:00:00Z'
    ]);
  });
  it('requires a customer name',async()=>{
    const db=fakeDb();
    await expect(new CustomerRepository(db).create({id:'c1',name:'  '})).rejects.toThrow('اسم الزبون');
    expect(db.run).not.toHaveBeenCalled();
  });
  it('lists customers with invoice counts and derived debt',async()=>{
    const db=fakeDb();
    const rows=await new CustomerRepository(db).list('برشيد');
    expect(rows[0]).toMatchObject({id:'c1',invoice_count:2,debt_minor:4500});
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('SUM(CASE'),['%برشيد%','%برشيد%','%برشيد%']);
  });
});
