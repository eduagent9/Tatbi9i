import type { SqliteExecutor } from './sqlite-database';
export type ReturnCondition='sellable'|'damaged'|'expired'|'shortage';
export type RefundMethod='cash'|'bank'|'other';
export interface ReturnLineInput { id:string; invoiceLineId:string; quantity:number; condition:ReturnCondition; batchId?:string|null; }
export interface CompleteReturnInput {
  id:string; returnNumber:string; invoiceId:string; processedBy:string; destinationLocationId:string;
  reason:string; lines:ReturnLineInput[]; refundMethod?:RefundMethod; note?:string;
}
export interface CompletedReturn {
  returnId:string; returnNumber:string; returnedValueMinor:number; refundMinor:number;
  newInvoiceTotalMinor:number; newCollectedMinor:number; newDueMinor:number; lineCount:number;
}
type SourceLine={id:string;invoice_id:string;product_id:string;variant_id:string|null;quantity:number;unit_price_minor:number;
  line_total_minor:number;returned_quantity:number;returned_value_minor:number};
const required=(v:string,l:string)=>{const x=v.trim();if(!x)throw new Error(l+' مطلوب.');return x;};
const conditions:ReturnCondition[]=['sellable','damaged','expired','shortage'];
const methods:RefundMethod[]=['cash','bank','other'];
export class ReturnsRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly makeId:()=>string=()=>crypto.randomUUID()) {}
  async complete(input:CompleteReturnInput):Promise<CompletedReturn> {
    const id=required(input.id,'معرّف المرتجع'),number=required(input.returnNumber,'رقم المرتجع');
    const invoiceId=required(input.invoiceId,'الفاتورة'),actor=required(input.processedBy,'المستخدم');
    const location=required(input.destinationLocationId,'موقع الإرجاع'),reason=required(input.reason,'سبب الإرجاع');
    if(!Array.isArray(input.lines)||!input.lines.length)throw new Error('المرتجع خاصو يحتوي على سطر واحد على الأقل.');
    const seen=new Set<string>();
    for(const l of input.lines){
      required(l.id,'معرّف السطر');required(l.invoiceLineId,'سطر الفاتورة');
      if(!Number.isFinite(l.quantity)||l.quantity<=0)throw new RangeError('كمية المرتجع خاصها تكون أكبر من صفر.');
      if(!conditions.includes(l.condition))throw new Error('حالة المنتج المرتجع غير صالحة.');
      if(seen.has(l.invoiceLineId))throw new Error('سطر الفاتورة مكرر في نفس المرتجع.');seen.add(l.invoiceLineId);
    }
    const method=input.refundMethod??'cash';if(!methods.includes(method))throw new Error('طريقة الاسترجاع غير صالحة.');
    const timestamp=this.now();await this.db.beginTransaction();
    try{
      const ir=await this.db.query('SELECT id,customer_id,status,subtotal_minor,offer_discount_minor,total_minor,collected_minor,confirmed_at FROM invoices WHERE id=? LIMIT 1',[invoiceId]);
      const inv=ir.values?.[0];if(!inv||!inv.confirmed_at)throw new Error('الفاتورة غير موجودة أو غير مؤكدة.');
      if(!['confirmed','partially_returned'].includes(String(inv.status)))throw new Error('هاد الفاتورة ما كتقبلش مرتجعات جديدة.');
      const oldTotal=Number(inv.total_minor),oldCollected=Number(inv.collected_minor),subtotal=Number(inv.subtotal_minor);
      const originalNet=subtotal-Number(inv.offer_discount_minor);
      if(!Number.isSafeInteger(oldTotal)||!Number.isSafeInteger(oldCollected)||oldTotal<0||oldCollected<0||oldCollected>oldTotal||
        !Number.isSafeInteger(originalNet)||originalNet<0||!Number.isFinite(subtotal)||subtotal<0)
        throw new Error('الرصيد المالي للفاتورة غير صالح.');
      const all=await this.db.query(
        `SELECT il.id,il.invoice_id,il.product_id,il.variant_id,il.quantity,il.unit_price_minor,il.line_total_minor,
          COALESCE((SELECT SUM(rl.quantity) FROM product_return_lines rl JOIN product_returns r ON r.id=rl.return_id
            WHERE rl.invoice_line_id=il.id AND r.status='completed'),0) AS returned_quantity,
          COALESCE((SELECT SUM(rl.line_total_minor) FROM product_return_lines rl JOIN product_returns r ON r.id=rl.return_id
            WHERE rl.invoice_line_id=il.id AND r.status='completed'),0) AS returned_value_minor
         FROM invoice_lines il WHERE il.invoice_id=? ORDER BY il.id`,[invoiceId]);
      const sourceLines=(all.values??[]) as unknown as SourceLine[];
      const gross=sourceLines.reduce((s,l)=>s+Number(l.line_total_minor),0);
      if(!sourceLines.length||Math.abs(gross-subtotal)>1)throw new Error('تفاصيل الفاتورة غير متطابقة مع مجموعها.');
      const allocated=new Map<string,number>();let allocatedSoFar=0;
      sourceLines.forEach((l,i)=>{
        const net=i===sourceLines.length-1?originalNet-allocatedSoFar:
          (gross===0?0:Math.round(Number(l.line_total_minor)*originalNet/gross));
        allocated.set(l.id,net);allocatedSoFar+=net;
      });
      const prepared:Array<{line:ReturnLineInput;source:SourceLine;lineValue:number}>=[];
      let returnedValueMinor=0;
      for(const line of input.lines){
        const source=sourceLines.find(x=>x.id===line.invoiceLineId);
        if(!source||!source.product_id)throw new Error('سطر المنتج غير موجود في الفاتورة الأصلية.');
        const remaining=Number(source.quantity)-Number(source.returned_quantity);
        if(line.quantity>remaining+1e-9)throw new RangeError('كمية المرتجع أكبر من الكمية المباعة المتبقية.');
        const batchId=line.batchId === undefined ? undefined : (line.batchId?.trim() || null);
        if(batchId===undefined)throw new Error('اختار الدفعة الأصلية للمنتج المرتجع.');
        if(batchId){
          const b=await this.db.query('SELECT id FROM product_batches WHERE id=? AND product_id=? AND variant_id IS ? LIMIT 1',[batchId,source.product_id,source.variant_id]);
          if(!b.values?.length)throw new Error('دفعة الإرجاع لا تطابق المنتج.');
        }
        const allocation=await this.db.query(
          `SELECT COUNT(*) AS allocation_count, COALESCE(SUM(a.quantity),0) AS allocated_quantity,
            COALESCE((SELECT SUM(rl.quantity) FROM product_return_lines rl
              JOIN product_returns r ON r.id=rl.return_id
              WHERE rl.invoice_line_id=? AND rl.batch_id IS ? AND r.status='completed'),0) AS returned_quantity
           FROM invoice_line_batch_allocations a
           WHERE a.invoice_line_id=? AND a.batch_id IS ?`,
          [source.id,batchId,source.id,batchId],
        );
        const allocationRow=allocation.values?.[0];
        const allocationCount=Number(allocationRow?.allocation_count??0);
        if(!Number.isSafeInteger(allocationCount)||allocationCount<0)throw new Error('سجل تخصيص دفعات الفاتورة غير صالح.');
        if(allocationCount===0){
          // Compatibility for invoices created before batch-allocation migration 008.
          // Their historical batch is unknown, so only a null-batch return is safe.
          if(batchId!==null)throw new RangeError('هاد الفاتورة قديمة وما فيهاش تتبع الدفعات؛ اختار إرجاعاً بلا دفعة.');
        }else{
          const batchRemaining=Number(allocationRow?.allocated_quantity??0)-Number(allocationRow?.returned_quantity??0);
          if(!Number.isFinite(batchRemaining)||line.quantity>batchRemaining+1e-9)
            throw new RangeError('الكمية المرتجعة كتفوت الكمية المباعة من هاد الدفعة.');
        }

        const cumulative=Math.round(Number(allocated.get(source.id))*((Number(source.returned_quantity)+line.quantity)/Number(source.quantity)));
        const lineValue=cumulative-Number(source.returned_value_minor);
        if(!Number.isSafeInteger(lineValue)||lineValue<0)throw new Error('قيمة المرتجع غير صالحة.');
        prepared.push({line,source,lineValue});returnedValueMinor+=lineValue;
      }
      if(!Number.isSafeInteger(returnedValueMinor)||returnedValueMinor>oldTotal)throw new Error('قيمة المرتجع كتفوت المتبقي من الفاتورة.');
      const newTotal=oldTotal-returnedValueMinor,refundMinor=Math.max(0,oldCollected-newTotal),newCollected=oldCollected-refundMinor;
      await this.db.run(
        `INSERT INTO product_returns (id,invoice_id,customer_id,processed_by,destination_location_id,status,reason,refund_minor,created_at,updated_at)
         VALUES (?,?,?,?,?,'completed',?,?,?,?)`,
        [id,invoiceId,inv.customer_id,actor,location,reason,refundMinor,timestamp,timestamp]);
      for(const item of prepared){
        const batchId=item.line.batchId?.trim()||null;
        await this.db.run(
          `INSERT INTO product_return_lines (id,return_id,product_id,variant_id,quantity,condition,unit_price_minor,invoice_line_id,batch_id,line_total_minor)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [item.line.id,id,item.source.product_id,item.source.variant_id,item.line.quantity,item.line.condition,
            Number(item.source.unit_price_minor),item.source.id,batchId,item.lineValue]);
        if(item.line.condition==='sellable'){
          const balance=await this.db.query('SELECT id,quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=? AND batch_id IS ? LIMIT 1',
            [item.source.product_id,item.source.variant_id,location,batchId]);
          const row=balance.values?.[0];
          if(row)await this.db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[Number(row.quantity)+item.line.quantity,timestamp,row.id]);
          else await this.db.run('INSERT INTO stock_balances (id,product_id,variant_id,location_id,batch_id,quantity,updated_at) VALUES (?,?,?,?,?,?,?)',
            [this.makeId(),item.source.product_id,item.source.variant_id,location,batchId,item.line.quantity,timestamp]);
          await this.db.run(
            `INSERT INTO stock_movements (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,occurred_at,note)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [this.makeId(),item.source.product_id,item.source.variant_id,batchId,null,location,item.line.quantity,'customer_return','product_return',id,actor,timestamp,'إرجاع قابل للبيع '+number]);
        }
      }
      if(refundMinor>0)await this.db.run(
        `INSERT INTO payments (id,invoice_id,customer_id,amount_minor,method,payment_kind,received_by,received_at,note)
         VALUES (?,?,?,?,?,'refund',?,?,?)`,
        [this.makeId(),invoiceId,inv.customer_id,refundMinor,method,actor,timestamp,'استرجاع مقابل المرتجع '+number]);
      const status=newTotal===0?'returned':'partially_returned';
      await this.db.run('UPDATE invoices SET total_minor=?,collected_minor=?,status=?,updated_at=? WHERE id=?',[newTotal,newCollected,status,timestamp,invoiceId]);
      await this.db.run(
        'INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)',
        [this.makeId(),actor,'customer_return.completed','product_return',id,
          JSON.stringify({invoiceId,totalMinor:oldTotal,collectedMinor:oldCollected}),
          JSON.stringify({invoiceId,returnNumber:number,returnedValueMinor,refundMinor,totalMinor:newTotal,collectedMinor:newCollected}),timestamp]);
      await this.db.commitTransaction();
      return{returnId:id,returnNumber:number,returnedValueMinor,refundMinor,newInvoiceTotalMinor:newTotal,
        newCollectedMinor:newCollected,newDueMinor:newTotal-newCollected,lineCount:prepared.length};
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }
}
