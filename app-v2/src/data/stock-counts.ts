import type { SqliteExecutor } from './sqlite-database';

export interface StockCountLineInput {
  id: string; productId: string; variantId?: string | null; batchId?: string | null; countedQuantity: number;
}
export interface CreateStockCountInput {
  id: string; countNumber: string; locationId: string; countedBy: string; lines: StockCountLineInput[]; note?: string;
}
export interface StockCountResult {
  countId: string; countNumber: string; lineCount: number; changedLineCount: number; totalAbsoluteVariance: number;
}
function required(value: string, label: string): string {
  const clean=value.trim(); if(!clean) throw new Error(label+' مطلوب.'); return clean;
}

/** Applies a physical stock count as audited stock adjustments in one transaction. */
export class StockCountRepository {
  constructor(private readonly db: SqliteExecutor, private readonly now: () => string = () => new Date().toISOString(),
    private readonly makeId: () => string = () => crypto.randomUUID()) {}

  async complete(input: CreateStockCountInput): Promise<StockCountResult> {
    const id=required(input.id,'معرّف الجرد'), countNumber=required(input.countNumber,'رقم الجرد');
    const locationId=required(input.locationId,'الموقع'), countedBy=required(input.countedBy,'المستخدم');
    if(!Array.isArray(input.lines)||input.lines.length===0) throw new Error('الجرد خاصو يحتوي على سطر واحد على الأقل.');
    const seen=new Set<string>();
    const lines=input.lines.map(line=>{
      const productId=required(line.productId,'المنتج');
      if(!Number.isFinite(line.countedQuantity)||line.countedQuantity<0) throw new RangeError('الكمية المعدودة خاصها تكون صفراً أو أكثر.');
      const variantId=line.variantId?.trim()||null, batchId=line.batchId?.trim()||null;
      const key=[productId,variantId??'',batchId??''].join('|');
      if(seen.has(key)) throw new Error('كاين سطر مكرر لنفس المنتج والدفعة فهاد الجرد.');
      seen.add(key); return {...line,productId,variantId,batchId};
    });
    const timestamp=this.now(); let changedLineCount=0,totalAbsoluteVariance=0;
    await this.db.beginTransaction();
    try {
      await this.db.run(
        "INSERT INTO stock_counts (id,count_number,location_id,counted_by,status,note,counted_at,created_at) VALUES (?,?,?,?,'completed',?,?,?)",
        [id,countNumber,locationId,countedBy,input.note?.trim()||null,timestamp,timestamp],
      );
      for(const line of lines) {
        const product=await this.db.query('SELECT id FROM products WHERE id=? AND is_active=1 LIMIT 1',[line.productId]);
        if(!product.values?.length) throw new Error('المنتج غير موجود أو غير نشيط: '+line.productId);
        if(line.batchId) {
          const batch=await this.db.query('SELECT id FROM product_batches WHERE id=? AND product_id=? AND variant_id IS ? LIMIT 1',[line.batchId,line.productId,line.variantId]);
          if(!batch.values?.length) throw new Error('دفعة المنتج غير صحيحة.');
        }
        const balance=await this.db.query(
          'SELECT id,quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=? AND batch_id IS ? LIMIT 1',
          [line.productId,line.variantId,locationId,line.batchId],
        );
        const row=balance.values?.[0], expected=Number(row?.quantity??0), variance=line.countedQuantity-expected;
        if(!Number.isFinite(expected)||expected<0) throw new Error('رصيد المخزون الحالي غير صالح.');
        await this.db.run(
          'INSERT INTO stock_count_lines (id,count_id,product_id,variant_id,batch_id,expected_quantity,counted_quantity,variance_quantity) VALUES (?,?,?,?,?,?,?,?)',
          [line.id,id,line.productId,line.variantId,line.batchId,expected,line.countedQuantity,variance],
        );
        if(Math.abs(variance)>1e-9) {
          if(row) await this.db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[line.countedQuantity,timestamp,row.id]);
          else await this.db.run(
            'INSERT INTO stock_balances (id,product_id,variant_id,location_id,batch_id,quantity,updated_at) VALUES (?,?,?,?,?,?,?)',
            [this.makeId(),line.productId,line.variantId,locationId,line.batchId,line.countedQuantity,timestamp],
          );
          await this.db.run(
            'INSERT INTO stock_movements (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,occurred_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [this.makeId(),line.productId,line.variantId,line.batchId,variance<0?locationId:null,variance>0?locationId:null,Math.abs(variance),'stock_count','stock_count',id,countedBy,timestamp,'تسوية جرد '+countNumber],
          );
          changedLineCount++; totalAbsoluteVariance+=Math.abs(variance);
        }
      }
      await this.db.run(
        'INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',
        [this.makeId(),countedBy,'stock_count.completed','stock_count',id,JSON.stringify({countNumber,locationId,lineCount:lines.length,changedLineCount,totalAbsoluteVariance}),timestamp],
      );
      await this.db.commitTransaction();
      return {countId:id,countNumber,lineCount:lines.length,changedLineCount,totalAbsoluteVariance};
    } catch(error) { await this.db.rollbackTransaction().catch(()=>undefined); throw error; }
  }
}
