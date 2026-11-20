import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {ReturnsRepository} from './returns';
const invoice={id:'inv-1',customer_id:'c1',status:'confirmed',subtotal_minor:1000,offer_discount_minor:0,total_minor:1000,collected_minor:1000,confirmed_at:'2026-11-20'};
const line={id:'il-1',invoice_id:'inv-1',product_id:'p1',variant_id:null,quantity:2,unit_price_minor:500,line_total_minor:1000,returned_quantity:0,returned_value_minor:0};
function dbMock(options:{status?:string;failMovement?:boolean;priorQty?:number}={}){
 let balance:{id:string;quantity:number}|null={id:'b1',quantity:3};
 const db:SqliteExecutor={
  execute:vi.fn(async()=>undefined),
  query:vi.fn(async(sql:string,values?:unknown[])=>{
   if(sql.includes('FROM invoices'))return{values:[{...invoice,status:options.status??invoice.status,confirmed_at:options.status==='draft'?null:invoice.confirmed_at}]};
   if(sql.includes('FROM invoice_lines'))return{values:[{...line,returned_quantity:options.priorQty??0,returned_value_minor:(options.priorQty??0)*500}]};
   if(sql.includes('FROM product_batches'))return{values:values?.[0]?[{id:String(values[0])}]:[]};
   if(sql.includes('FROM invoice_line_batch_allocations'))return{values:values?.[1]==='batch1'?[{allocation_count:1,allocated_quantity:2,returned_quantity:options.priorQty??0}]:[{allocation_count:0,allocated_quantity:0,returned_quantity:0}]};
   if(sql.includes('FROM stock_balances'))return{values:balance?[balance]:[]};
   return{values:[]};
  }),
  run:vi.fn(async(sql:string,v?:unknown[])=>{
   if(sql.includes('UPDATE stock_balances'))balance={id:'b1',quantity:Number(v?.[0])};
   if(sql.includes('INSERT INTO stock_balances'))balance={id:'new',quantity:Number(v?.[5])};
   if(options.failMovement&&sql.includes('INSERT INTO stock_movements'))throw new Error('movement failed');
  }),
  beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined),
 };
 return{db,getBalance:()=>balance};
}
const input={id:'ret1',returnNumber:'R-001',invoiceId:'inv-1',processedBy:'owner',destinationLocationId:'depot',reason:'damaged box',
 lines:[{id:'rl1',invoiceLineId:'il-1',quantity:1,condition:'sellable' as const,batchId:'batch1'}]};
describe('ReturnsRepository',()=>{
 it('returns sellable stock, reduces invoice balance and refunds only the overpayment',async()=>{
  const{db,getBalance}=dbMock();
  const result=await new ReturnsRepository(db,()=> '2026-11-20T12:00:00Z',()=> 'gen').complete(input);
  expect(result).toEqual({returnId:'ret1',returnNumber:'R-001',returnedValueMinor:500,refundMinor:500,newInvoiceTotalMinor:500,newCollectedMinor:500,newDueMinor:0,lineCount:1});
  expect(getBalance()?.quantity).toBe(4);
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('payment_kind'),expect.arrayContaining([500,'cash']));
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });
 it('does not add damaged goods back to sellable stock',async()=>{
  const{db,getBalance}=dbMock();
  await new ReturnsRepository(db).complete({...input,lines:[{...input.lines[0],condition:'damaged'}]});
  expect(getBalance()?.quantity).toBe(3);
  expect(db.run).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'),expect.anything());
 });
 it('rejects returning more than the unreturned sold quantity',async()=>{
  const{db}=dbMock({priorQty:2});
  await expect(new ReturnsRepository(db).complete(input)).rejects.toThrow('أكبر من الكمية');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
 });
 it('rolls back all return effects if stock movement fails',async()=>{
  const{db}=dbMock({failMovement:true});
  await expect(new ReturnsRepository(db).complete(input)).rejects.toThrow('movement failed');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  expect(db.commitTransaction).not.toHaveBeenCalled();
 });

 it('requires a source batch allocation and rejects returns against an unrelated batch',async()=>{
  const{db}=dbMock();
  await expect(new ReturnsRepository(db).complete({...input,lines:[{...input.lines[0],batchId:'other-batch'}]})).rejects.toThrow('كتفوت الكمية المباعة');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
 });

 it('supports legacy invoices without batch-allocation history using an unbatched return',async()=>{
  const{db}=dbMock();
  const legacyInput={...input,lines:[{...input.lines[0],batchId:null}]};
  const result=await new ReturnsRepository(db).complete(legacyInput);
  expect(result.returnedValueMinor).toBe(500);
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO product_return_lines'),expect.arrayContaining([null,500]));
 });
 it('requires an explicit original batch selection',async()=>{
  const{db}=dbMock();
  await expect(new ReturnsRepository(db).complete({...input,lines:[{id:'rl1',invoiceLineId:'il-1',quantity:1,condition:'sellable'}]})).rejects.toThrow('اختار الدفعة الأصلية');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
 });
 it('rejects draft invoices and invalid quantities before any transaction',async()=>{
  const{db}=dbMock({status:'draft'});
  await expect(new ReturnsRepository(db).complete(input)).rejects.toThrow('غير موجودة أو غير مؤكدة');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  const other=dbMock();
  await expect(new ReturnsRepository(other.db).complete({...input,lines:[{...input.lines[0],quantity:0}]})).rejects.toThrow(RangeError);
  expect(other.db.beginTransaction).not.toHaveBeenCalled();
 });
});
