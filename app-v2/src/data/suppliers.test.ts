import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {SupplierRepository} from './suppliers';
function dbMock():SqliteExecutor {
 return {
  execute:vi.fn(async()=>undefined),
  query:vi.fn(async()=>({values:[{id:'s1',name:'مورد',phone:null,address:null,created_at:'2026-11-20',updated_at:'2026-11-20',receipt_count:2,purchased_minor:25000}]})),
  run:vi.fn(async()=>undefined),
  beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
 };
}
describe('SupplierRepository',()=>{
 it('creates a supplier with trimmed fields',async()=>{
  const db=dbMock(),repo=new SupplierRepository(db,()=> '2026-11-20T12:00:00.000Z');
  await repo.create({id:'s1',name:'  المورد الأول  ',phone:' 0600000000 '});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO suppliers'),['s1','المورد الأول','0600000000',null,'2026-11-20T12:00:00.000Z','2026-11-20T12:00:00.000Z']);
 });
 it('requires a supplier name',async()=>{
  const db=dbMock(),repo=new SupplierRepository(db);
  await expect(repo.create({id:'s1',name:'  '})).rejects.toThrow('اسم المورد');
  expect(db.run).not.toHaveBeenCalled();
 });
 it('returns purchase totals from receipt history',async()=>{
  const db=dbMock(),repo=new SupplierRepository(db);
  const result=await repo.list('مورد');
  expect(result[0].receipt_count).toBe(2); expect(result[0].purchased_minor).toBe(25000);
  expect(db.query).toHaveBeenCalledOnce();
 });
 it('updates supplier contact details transactionally',async()=>{
  const db=dbMock(),repo=new SupplierRepository(db,()=> '2026-11-21T12:00:00.000Z');
  await repo.update({id:'s1',name:'مورد جديد',phone:'0611111111',address:'الدار البيضاء'});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE suppliers SET name=?'),expect.arrayContaining(['مورد جديد','0611111111','الدار البيضاء']));
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });

});
