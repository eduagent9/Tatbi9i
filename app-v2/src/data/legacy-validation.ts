export type LegacyRecord = Record<string, unknown>;
export type LegacyValidationIssue = { severity: 'error' | 'warning'; code: string; path: string; message: string };
export type LegacyValidationReport = { valid: boolean; counts: Record<string, number>; issues: LegacyValidationIssue[] };
const COLLECTIONS = ['products','invoices','people','expenses','movements','payments','returns','purchases'] as const;
const isRecord = (v: unknown): v is LegacyRecord => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasId = (v: unknown): v is LegacyRecord & {id: string | number} => isRecord(v) && (typeof v.id === 'string' || typeof v.id === 'number') && String(v.id).trim() !== '';

/** Read-only structural validation. Never repairs, imports, or mutates the source. */
export function validateLegacyDatabase(input: unknown): LegacyValidationReport {
 const issues: LegacyValidationIssue[] = []; const counts: Record<string,number> = {};
 if (!isRecord(input)) return {valid:false,counts,issues:[{severity:'error',code:'ROOT_NOT_OBJECT',path:'$',message:'ملف النسخة القديمة خاصو يكون كائن JSON.'}]};
 for (const name of COLLECTIONS) {
  const value=input[name];
  if (value===undefined) { counts[name]=0; issues.push({severity:'warning',code:'COLLECTION_MISSING',path:name,message:'القائمة غير موجودة؛ تعامل كفارغة في المعاينة فقط.'}); continue; }
  if (!Array.isArray(value)) { counts[name]=0; issues.push({severity:'error',code:'COLLECTION_NOT_ARRAY',path:name,message:'القيمة خاصها تكون قائمة.'}); continue; }
  counts[name]=value.length; const seen=new Set<string>();
  value.forEach((entry,index)=>{
   const path=name+'['+index+']';
   if (!isRecord(entry)) {issues.push({severity:'error',code:'RECORD_NOT_OBJECT',path,message:'السجل ماشي كائن صالح.'});return;}
   if (!hasId(entry)) issues.push({severity:'warning',code:'MISSING_ID',path,message:'السجل ما عندوش معرّف واضح؛ خاص مراجعة.'});
   else {const id=String(entry.id);if(seen.has(id))issues.push({severity:'error',code:'DUPLICATE_ID',path:path+'.id',message:'معرّف مكرر داخل نفس القائمة.'});seen.add(id);}
  });
 }
 const invoiceIds=new Set((Array.isArray(input.invoices)?input.invoices:[]).filter(hasId).map(x=>String(x.id)));
 for (const [i,p] of (Array.isArray(input.payments)?input.payments:[]).entries()) if(isRecord(p)&&p.invoiceId!=null&&!invoiceIds.has(String(p.invoiceId))) issues.push({severity:'warning',code:'PAYMENT_INVOICE_MISSING',path:'payments['+i+'].invoiceId',message:'الأداء كيشير لفاتورة غير موجودة.'});
 for (const [i,r] of (Array.isArray(input.returns)?input.returns:[]).entries()) if(isRecord(r)&&r.invoiceId!=null&&!invoiceIds.has(String(r.invoiceId))) issues.push({severity:'warning',code:'RETURN_INVOICE_MISSING',path:'returns['+i+'].invoiceId',message:'المرتجع كيشير لفاتورة غير موجودة.'});
 if(typeof input.pin==='string'&&input.pin.length) issues.push({severity:'warning',code:'LEGACY_PIN_NOT_AUTH',path:'pin',message:'PIN القديم ماشي مصادقة آمنة، وما خاصوش يتحول لكلمة مرور.'});
 return {valid:!issues.some(x=>x.severity==='error'),counts,issues};
}
