import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {ReportsRepository} from './reports';
function dbMock():SqliteExecutor {
 return {execute:vi.fn(async()=>undefined),
 query:vi.fn(async(sql:string)=>sql.includes('FROM invoices')
  ? {values:[{sales_minor:10000,cost_minor:6000,outstanding_minor:2500,invoice_count:3}]}
  : {values:[{expenses_minor:1500,expense_count:2}] }),
 run:vi.fn(async()=>undefined),beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined)};
}
describe('ReportsRepository',()=>{
 it('calculates net profit from confirmed sales, line cost snapshots and expenses',async()=>{
  const result=await new ReportsRepository(dbMock()).getFinancialSummary();
  expect(result).toEqual({salesMinor:10000,costMinor:6000,grossProfitMinor:4000,expensesMinor:1500,netProfitMinor:2500,outstandingMinor:2500,invoiceCount:3,expenseCount:2});
 });
});
