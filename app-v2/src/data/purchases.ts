import type { SqliteExecutor } from './sqlite-database';

export interface PurchaseLineInput { productId:string; quantity:number; unitCostMinor:number; batchCode?:string|null; expiryDate?:string|null; }
export interface CreatePurchaseInput { id:string; receiptNumber:string; supplierId:string; receivedBy:string; locationId:string; lines:PurchaseLineInput[]; note?:string; }
export interface CreatedPurchase { receiptId:string; receiptNumber:string; totalMinor:number; lineCount:number; }
type ProductRow={id:string;name:string;purchase_cost_minor:number};
function required(value:string,label:string):string { const clean=value.trim(); if(!clean) throw new Error(label+' مطلوب.'); return clean; }
function validMoney(value:number):number { if(!Number.isSafeInteger(value)||value<0) throw new RangeError('ثمن الشراء خاصو يكون مبلغاً صحيحاً بالسنتيم.'); return value; }
function validDate(value:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('تاريخ الصلاحية غير صالح.');
  const date=new Date(value+'T00:00:00Z');
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value) throw new Error('تاريخ الصلاحية غير صالح.');
  return value;
}

/** Receives supplier goods, creates expiry batches, updates stock and weighted purchase cost atomically. */
export class PurchaseRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString(),private readonly makeId:()=>string=()=>crypto.randomUUID()) {}

  async create(input:CreatePurchaseInput):Promise<CreatedPurchase> {
    const id=required(input.id,'معرّف التوريد'), receiptNumber=required(input.receiptNumber,'رقم وصل الشراء');
    const supplierId=required(input.supplierId,'المورد'), receivedBy=required(input.receivedBy,'المستخدم'), locationId=required(input.locationId,'المستودع');
    if(!Array.isArray(input.lines)||input.lines.length===0) throw new Error('التوريد خاصو يحتوي على منتج واحد على الأقل.');
    const timestamp=this.now();
    const prepared:Array<{product:ProductRow;quantity:number;unitCost:number;lineTotal:number;batchCode:string|null;expiryDate:string|null}>=[];
    let totalMinor=0;
    for(const line of input.lines) {
      const productId=required(line.productId,'المنتج');
      if(!Number.isFinite(line.quantity)||line.quantity<=0) throw new RangeError('الكمية خاصها تكون أكبر من صفر.');
      const unitCost=validMoney(line.unitCostMinor), lineTotal=Math.round(line.quantity*unitCost);
      if(!Number.isSafeInteger(lineTotal)) throw new RangeError('قيمة سطر الشراء كبيرة بزاف.');
      totalMinor+=lineTotal; if(!Number.isSafeInteger(totalMinor)) throw new RangeError('إجمالي التوريد كبير بزاف.');
      const found=await this.db.query('SELECT id,name,purchase_cost_minor FROM products WHERE id=? AND is_active=1 LIMIT 1',[productId]);
      const product=found.values?.[0] as ProductRow|undefined;
      if(!product) throw new Error('المنتج غير موجود أو غير نشيط: '+productId);
      const expiryDate=line.expiryDate?.trim()?validDate(line.expiryDate.trim()):null;
      prepared.push({product,quantity:line.quantity,unitCost,lineTotal,batchCode:line.batchCode?.trim()||null,expiryDate});
    }
    await this.db.beginTransaction();
    try {
      await this.db.run(
        'INSERT INTO purchase_receipts (id,receipt_number,supplier_id,received_by,location_id,total_minor,note,received_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [id,receiptNumber,supplierId,receivedBy,locationId,totalMinor,input.note?.trim()||null,timestamp,timestamp],
      );
      for(const line of prepared) {
        const oldStock=await this.db.query(`SELECT COALESCE(SUM(sb.quantity),0) AS quantity FROM stock_balances sb JOIN stock_locations sl ON sl.id=sb.location_id WHERE sb.product_id=? AND sl.location_type='depot'`,[line.product.id]);
        const previousQuantity=Number(oldStock.values?.[0]?.quantity??0);
        const currentProduct=await this.db.query('SELECT purchase_cost_minor FROM products WHERE id=?',[line.product.id]);
        const previousCost=Number(currentProduct.values?.[0]?.purchase_cost_minor??line.product.purchase_cost_minor);
        let batchId:string|null=null;
        if(line.batchCode||line.expiryDate) {
          batchId=this.makeId();
          await this.db.run('INSERT INTO product_batches (id,product_id,variant_id,batch_code,expiry_date,received_at) VALUES (?,?,NULL,?,?,?)',
            [batchId,line.product.id,line.batchCode,line.expiryDate,timestamp]);
        }
        const balance=await this.db.query(
          'SELECT id,quantity FROM stock_balances WHERE product_id=? AND variant_id IS NULL AND location_id=? AND batch_id IS ? LIMIT 1',
          [line.product.id,locationId,batchId],
        );
        const row=balance.values?.[0];
        if(row) await this.db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[Number(row.quantity)+line.quantity,timestamp,row.id]);
        else await this.db.run('INSERT INTO stock_balances (id,product_id,variant_id,location_id,batch_id,quantity,updated_at) VALUES (?,?,NULL,?,?,?,?)',
          [this.makeId(),line.product.id,locationId,batchId,line.quantity,timestamp]);
        await this.db.run(
          `INSERT INTO stock_movements (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,occurred_at,note)
           VALUES (?,?,NULL,?,?,?,?,'purchase_receipt','purchase_receipt',?,?,?,?)`,
          [this.makeId(),line.product.id,batchId,null,locationId,line.quantity,id,receivedBy,timestamp,'توريد '+receiptNumber],
        );
        await this.db.run('INSERT INTO purchase_receipt_lines (id,receipt_id,product_id,batch_id,quantity,unit_cost_minor,line_total_minor,product_name_snapshot) VALUES (?,?,?,?,?,?,?,?)',
          [this.makeId(),id,line.product.id,batchId,line.quantity,line.unitCost,line.lineTotal,line.product.name]);
        const weightedCost=previousQuantity+line.quantity>0
          ? Math.round((previousQuantity*previousCost+line.quantity*line.unitCost)/(previousQuantity+line.quantity))
          : line.unitCost;
        await this.db.run('UPDATE products SET purchase_cost_minor=?,updated_at=? WHERE id=?',[weightedCost,timestamp,line.product.id]);
      }
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',
        [this.makeId(),receivedBy,'purchase.received','purchase_receipt',id,JSON.stringify({receiptNumber,supplierId,totalMinor,lineCount:prepared.length}),timestamp]);
      await this.db.commitTransaction();
      return {receiptId:id,receiptNumber,totalMinor,lineCount:prepared.length};
    } catch(error) { await this.db.rollbackTransaction().catch(()=>undefined); throw error; }
  }
}
