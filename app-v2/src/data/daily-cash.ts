import type {SqliteExecutor} from './sqlite-database';

export interface DailyCashPreview {
 businessDate:string;openingCashMinor:number;cashInMinor:number;refundsMinor:number;
 expensesMinor:number;supplierPaymentsMinor:number;expectedCashMinor:number;
}
export interface DailyCashClosing extends DailyCashPreview {
 id:string;countedCashMinor:number;differenceMinor:number;notes:string|null;closedAt:string;
}
export function calculateExpectedCash(opening:number,incoming:number,refunds:number,expenses:number,supplierPayments:number):number{
 const values=[opening,incoming,refunds,expenses,supplierPayments];
 if(!values.every(Number.isSafeInteger)||values.some(x=>x<0))throw new RangeError('مبالغ إغلاق اليوم غير صالحة.');
 const expected=opening+incoming-refunds-expenses-supplierPayments;
 if(!Number.isSafeInteger(expected)||expected<0)throw new RangeError('النقد المتوقع سالب أو خارج النطاق؛ راجع رصيد الصندوق والمصاريف.');
 return expected;
}
function date(value:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('تاريخ إغلاق اليوم غير صالح.');return value;}
function amount(value:number,label:string):number{if(!Number.isSafeInteger(value)||value<0)throw new RangeError(label+' خاصو يكون مبلغاً صحيحاً غير سالب بالسنتيم.');return value;}

export class DailyCashRepository{
 constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString(),private readonly makeId:()=>string=()=>crypto.randomUUID()){}
 async preview(businessDate:string,openingCashMinor:number):Promise<DailyCashPreview>{
  const day=date(businessDate),opening=amount(openingCashMinor,'رصيد بداية اليوم');
  const [inRows,refundRows,expenseRows,supplierRows]=await Promise.all([
   this.db.query("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM payments WHERE method='cash' AND payment_kind='sale_collection' AND date(received_at)=?",[day]),
   this.db.query("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM payments WHERE method='cash' AND payment_kind='refund' AND date(received_at)=?",[day]),
   this.db.query("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM expenses WHERE payment_method='cash' AND date(occurred_at)=?",[day]),
   this.db.query("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM supplier_payments WHERE method='cash' AND date(paid_at)=?",[day])
  ]);
  const cashInMinor=amount(Number(inRows.values?.[0]?.amount??0),'المقبوضات');
  const refundsMinor=amount(Number(refundRows.values?.[0]?.amount??0),'المرتجعات النقدية');
  const expensesMinor=amount(Number(expenseRows.values?.[0]?.amount??0),'المصاريف النقدية');
  const supplierPaymentsMinor=amount(Number(supplierRows.values?.[0]?.amount??0),'أداءات الموردين');
  return {businessDate:day,openingCashMinor:opening,cashInMinor,refundsMinor,expensesMinor,supplierPaymentsMinor,
   expectedCashMinor:calculateExpectedCash(opening,cashInMinor,refundsMinor,expensesMinor,supplierPaymentsMinor)};
 }
 async close(input:{id:string;businessDate:string;openingCashMinor:number;countedCashMinor:number;closedBy:string;notes?:string}):Promise<DailyCashClosing>{
  const id=input.id.trim(),closedBy=input.closedBy.trim(),counted=amount(input.countedCashMinor,'النقد المعدود');
  if(!id||!closedBy)throw new Error('معرّف الإغلاق والمالك مطلوبان.');
  const timestamp=this.now();await this.db.beginTransaction();
  try{
   const day=date(input.businessDate);
   const existing=await this.db.query('SELECT id FROM daily_cash_closings WHERE business_date=?',[day]);
   if(existing.values?.length)throw new Error('تم إغلاق هذا اليوم من قبل؛ لا يمكن إنشاء إغلاق مكرر.');
   const preview=await this.preview(day,input.openingCashMinor);
   const difference=counted-preview.expectedCashMinor;
   await this.db.run('INSERT INTO daily_cash_closings (id,business_date,opening_cash_minor,cash_in_minor,refunds_minor,expenses_minor,supplier_payments_minor,expected_cash_minor,counted_cash_minor,difference_minor,notes,closed_by,closed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id,day,preview.openingCashMinor,preview.cashInMinor,preview.refundsMinor,preview.expensesMinor,preview.supplierPaymentsMinor,preview.expectedCashMinor,counted,difference,input.notes?.trim()||null,closedBy,timestamp,timestamp]);
   await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',
    [this.makeId(),closedBy,'cash.day_closed','daily_cash_closing',id,JSON.stringify({...preview,countedCashMinor:counted,differenceMinor:difference}),timestamp]);
   await this.db.commitTransaction();
   return {id,...preview,countedCashMinor:counted,differenceMinor:difference,notes:input.notes?.trim()||null,closedAt:timestamp};
  }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
 }
 async list(limit=30):Promise<DailyCashClosing[]>{
  const result=await this.db.query('SELECT id,business_date AS businessDate,opening_cash_minor AS openingCashMinor,cash_in_minor AS cashInMinor,refunds_minor AS refundsMinor,expenses_minor AS expensesMinor,supplier_payments_minor AS supplierPaymentsMinor,expected_cash_minor AS expectedCashMinor,counted_cash_minor AS countedCashMinor,difference_minor AS differenceMinor,notes,closed_at AS closedAt FROM daily_cash_closings ORDER BY business_date DESC LIMIT ?',[limit]);
  return (result.values??[]) as unknown as DailyCashClosing[];
 }
}
