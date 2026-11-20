import type { SqliteExecutor } from './sqlite-database';

export type CollectionMethod = 'cash' | 'bank' | 'other';
export interface InvoiceCollectionInput {
  id: string; invoiceId: string; amountMinor: number; method: CollectionMethod;
  receivedBy: string; note?: string;
}
export interface InvoiceBalance {
  invoiceId: string; customerId: string; totalMinor: number; collectedMinor: number; dueMinor: number;
  status: 'confirmed' | 'partially_returned' | 'returned';
}

export interface OutstandingInvoice {
  invoiceId:string; invoiceNumber:string; customerId:string; customerName:string;
  totalMinor:number; collectedMinor:number; dueMinor:number;
}

function required(value:string,label:string):string {
  const clean=value.trim(); if(!clean) throw new Error(label+' مطلوب.'); return clean;
}
function amount(value:number):number {
  if(!Number.isSafeInteger(value)||value<=0) throw new RangeError('مبلغ التسديد خاصو يكون عدداً صحيحاً موجباً بالسنتيم.');
  return value;
}

/** Records a debt collection against a new-format invoice in one transaction. */
export class PaymentRepository {
  constructor(
    private readonly db:SqliteExecutor,
    private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly makeId:()=>string=()=>crypto.randomUUID(),
  ) {}

  async listOutstanding():Promise<OutstandingInvoice[]> {
    const result=await this.db.query(
      `SELECT i.id AS invoiceId,i.invoice_number AS invoiceNumber,i.customer_id AS customerId,c.name AS customerName,
       i.total_minor AS totalMinor,i.collected_minor AS collectedMinor,
       (i.total_minor-i.collected_minor) AS dueMinor
       FROM invoices i JOIN customers c ON c.id=i.customer_id
       WHERE i.confirmed_at IS NOT NULL AND i.status NOT IN ('returned','voided')
         AND i.total_minor>i.collected_minor
       ORDER BY i.created_at DESC,i.invoice_number DESC`,
    );
    return (result.values??[]) as unknown as OutstandingInvoice[];
  }

  async getInvoiceBalance(invoiceId:string):Promise<InvoiceBalance> {
    const id=required(invoiceId,'معرّف الفاتورة');
    const result=await this.db.query(
      'SELECT id,customer_id,total_minor,collected_minor,status,confirmed_at FROM invoices WHERE id=? LIMIT 1',[id],
    );
    const row=result.values?.[0];
    if(!row) throw new Error('الفاتورة غير موجودة.');
    if(!row.confirmed_at) throw new Error('هاد الفاتورة مازال ما تأكداتش أو ماشي من النسخة الجديدة.');
    const totalMinor=Number(row.total_minor), collectedMinor=Number(row.collected_minor);
    if(!Number.isSafeInteger(totalMinor)||!Number.isSafeInteger(collectedMinor)||totalMinor<0||collectedMinor<0||collectedMinor>totalMinor) {
      throw new Error('رصيد الفاتورة غير صالح وخصو مراجعة.');
    }
    return {invoiceId:String(row.id),customerId:String(row.customer_id),totalMinor,collectedMinor,dueMinor:totalMinor-collectedMinor,status:row.status as InvoiceBalance['status']};
  }

  async collect(input:InvoiceCollectionInput):Promise<InvoiceBalance> {
    const id=required(input.id,'معرّف الأداء');
    const invoiceId=required(input.invoiceId,'الفاتورة');
    const receivedBy=required(input.receivedBy,'المستخدم');
    const amountMinor=amount(input.amountMinor);
    if(!['cash','bank','other'].includes(input.method)) throw new Error('طريقة الأداء غير صالحة.');
    const timestamp=this.now();
    await this.db.beginTransaction();
    try {
      const balance=await this.getInvoiceBalance(invoiceId);
      if(balance.status==='returned') throw new Error('ما يمكنش تسديد فاتورة مرتجعة بالكامل.');
      if(amountMinor>balance.dueMinor) throw new RangeError('مبلغ التسديد أكبر من الدين المتبقي.');
      const nextCollected=balance.collectedMinor+amountMinor;
      await this.db.run('UPDATE invoices SET collected_minor=?,updated_at=? WHERE id=?',[nextCollected,timestamp,invoiceId]);
      await this.db.run(
        `INSERT INTO payments (id,invoice_id,customer_id,amount_minor,method,payment_kind,received_by,received_at,note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id,invoiceId,balance.customerId,amountMinor,input.method,'sale_collection',receivedBy,timestamp,input.note?.trim()||null],
      );
      await this.db.run(
        `INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at)
         VALUES (?,?,?,?,?,?,?)`,
        [this.makeId(),receivedBy,'invoice.payment_received','invoice',invoiceId,JSON.stringify({amountMinor,method:input.method,collectedMinor:nextCollected,dueMinor:balance.dueMinor-amountMinor}),timestamp],
      );
      await this.db.commitTransaction();
      return {...balance,collectedMinor:nextCollected,dueMinor:balance.dueMinor-amountMinor};
    } catch(error) {
      await this.db.rollbackTransaction().catch(()=>undefined);
      throw error;
    }
  }
}
