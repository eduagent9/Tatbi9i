import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {ExpenseRepository} from './expenses';
function dbMock():SqliteExecutor {
 return {execute:vi.fn(async()=>undefined),query:vi.fn(async()=>({values:[]})),run:vi.fn(async()=>undefined),
 beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined)};
}
describe('ExpenseRepository',()=>{
 it('records a positive operating expense in integer centimes',async()=>{
  const db=dbMock(),repo=new ExpenseRepository(db,()=> '2026-11-20T12:00:00Z');
  await repo.create({id:'e1',expenseNumber:'EXP-1',category:'نقل',amountMinor:2500,paymentMethod:'cash',paidBy:'local-owner',note:'وقود'});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO expenses'),['e1','EXP-1','نقل',2500,'cash','local-owner','2026-11-20T12:00:00Z','وقود','2026-11-20T12:00:00Z']);
 });
 it('rejects zero and fractional cent amounts',async()=>{
  const db=dbMock(),repo=new ExpenseRepository(db);
  await expect(repo.create({id:'e1',expenseNumber:'EXP-1',category:'نقل',amountMinor:0,paymentMethod:'cash',paidBy:'local-owner'})).rejects.toThrow(RangeError);
  await expect(repo.create({id:'e1',expenseNumber:'EXP-1',category:'نقل',amountMinor:1.5,paymentMethod:'cash',paidBy:'local-owner'})).rejects.toThrow(RangeError);
  expect(db.run).not.toHaveBeenCalled();
 });
 it('requires category and actor',async()=>{
  const repo=new ExpenseRepository(dbMock());
  await expect(repo.create({id:'e1',expenseNumber:'EXP-1',category:' ',amountMinor:100,paymentMethod:'cash',paidBy:'local-owner'})).rejects.toThrow('تصنيف المصروف');
 });
});
