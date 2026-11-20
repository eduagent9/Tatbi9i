import type { LegacyRecord } from './legacy-validation';

export type ReconciliationFlag = { code: string; path: string; message: string; severity: 'warning' | 'error' };
export type LegacyDryRunReport = {
  counts: Record<string, number>;
  totals: { productQuantity: number; invoiceTotal: number; invoicePaid: number; invoiceDue: number; paymentAmount: number; returnAmount: number; purchaseTotal: number; purchasePaid: number; purchaseDue: number };
  imageCount: number;
  invoiceLineMismatches: Array<{ invoiceId: string; savedTotal: number; lineTotal: number; difference: number }>;
  flags: ReconciliationFlag[];
};
const list = (root: LegacyRecord, key: string): LegacyRecord[] =>
  Array.isArray(root[key]) ? (root[key] as unknown[]).filter((x): x is LegacyRecord => typeof x === 'object' && x !== null && !Array.isArray(x)) : [];
const num = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : 0;
const id = (v: unknown): string => v == null ? '' : String(v);

/** Calculates a non-mutating preview using only fields observed in the legacy app. */
export function buildLegacyDryRun(input: unknown): LegacyDryRunReport {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('Legacy root must be an object');
  const root = input as LegacyRecord;
  const products=list(root,'products'), invoices=list(root,'invoices'), payments=list(root,'payments'), returns=list(root,'returns'), purchases=list(root,'purchases');
  const flags: ReconciliationFlag[]=[];
  const invoiceIds=new Set(invoices.map(x=>id(x.id)));
  let invoiceTotal=0, invoicePaid=0, invoiceDue=0, returnAmount=0, purchaseTotal=0, purchasePaid=0, purchaseDue=0;
  const invoiceLineMismatches: LegacyDryRunReport['invoiceLineMismatches']=[];
  invoices.forEach((invoice,index)=>{
    const saved=num(invoice.total);
    const lineTotal=list(invoice,'items').reduce((sum,line)=>sum+num(line.total),0);
    invoiceTotal+=saved; invoicePaid+=num(invoice.paid); invoiceDue+=num(invoice.due);
    if (list(invoice,'items').length && Math.abs(saved-lineTotal)>0.005) {
      invoiceLineMismatches.push({invoiceId:id(invoice.id),savedTotal:saved,lineTotal,difference:saved-lineTotal});
      flags.push({code:'INVOICE_LINES_TOTAL_MISMATCH',path:`invoices[${index}]`,severity:'warning',message:'مجموع تفاصيل الفاتورة مختلف عن الإجمالي المحفوظ؛ لا يتم التصحيح تلقائياً.'});
    }
  });
  let paymentAmount=0;
  payments.forEach((payment,index)=>{paymentAmount+=num(payment.amount);if(payment.invoiceId!=null&&!invoiceIds.has(id(payment.invoiceId)))flags.push({code:'PAYMENT_INVOICE_MISSING',path:`payments[${index}].invoiceId`,severity:'warning',message:'الأداء مرتبط بفاتورة غير موجودة.'});});
  returns.forEach((ret,index)=>{returnAmount+=num(ret.amount);if(ret.invoiceId!=null&&!invoiceIds.has(id(ret.invoiceId)))flags.push({code:'RETURN_INVOICE_MISSING',path:`returns[${index}].invoiceId`,severity:'warning',message:'المرتجع مرتبط بفاتورة غير موجودة.'});});
  purchases.forEach(p=>{purchaseTotal+=num(p.total);purchasePaid+=num(p.paid);purchaseDue+=num(p.due);});
  const counts={products:products.length,invoices:invoices.length,people:list(root,'people').length,expenses:list(root,'expenses').length,movements:list(root,'movements').length,payments:payments.length,returns:returns.length,purchases:purchases.length};
  return {counts,totals:{productQuantity:products.reduce((s,p)=>s+num(p.qty),0),invoiceTotal,invoicePaid,invoiceDue,paymentAmount,returnAmount,purchaseTotal,purchasePaid,purchaseDue},imageCount:products.filter(p=>typeof p.image==='string'&&p.image.length>0).length,invoiceLineMismatches,flags};
}
