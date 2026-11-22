import type { SqliteExecutor } from './sqlite-database';

export type StockMovementType = 'opening' | 'purchase_receipt' | 'load_vehicle' | 'replenishment' | 'sale' | 'delivery' | 'customer_return' | 'supplier_return' | 'damage' | 'stock_count' | 'transfer';

export interface StockMovementInput {
  id: string; productId: string; variantId?: string | null; batchId?: string | null;
  fromLocationId?: string | null; toLocationId?: string | null; quantity: number;
  movementType: StockMovementType; referenceType?: string | null; referenceId?: string | null;
  performedBy?: string | null; responsibleUserId?: string | null; occurredAt?: string; note?: string | null;
}

export interface StockBalanceRow { product_id: string; variant_id: string | null; location_id: string; batch_id: string | null; quantity: number; }
export interface StockMovementRecord { id:string; product_name:string; movement_type:string; quantity:number; from_label:string|null; to_label:string|null; occurred_at:string; note:string|null; }
export interface ExpiryAlertRow { product_id:string; product_name:string; batch_id:string; batch_code:string|null; expiry_date:string; location_label:string; quantity:number; }

function nonEmpty(value: string, label: string): string {
  const clean = value.trim(); if (!clean) throw new Error(label + ' مطلوب.'); return clean;
}

export class StockRepository {
  constructor(private readonly db: SqliteExecutor, private readonly now: () => string = () => new Date().toISOString()) {}

  private async changeBalance(input: StockMovementInput, locationId: string, delta: number): Promise<void> {
    const variantId = input.variantId ?? null, batchId = input.batchId ?? null;
    const result = await this.db.query(
      'SELECT id, quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=? AND batch_id IS ? LIMIT 1',
      [input.productId, variantId, locationId, batchId],
    );
    const row = result.values?.[0];
    const current = row ? Number(row.quantity) : 0;
    const next = current + delta;
    if (!Number.isFinite(next) || next < -1e-9) throw new Error('الكمية غير كافية فهاد الموقع لإتمام الحركة.');
    if (row) {
      await this.db.run('UPDATE stock_balances SET quantity=?, updated_at=? WHERE id=?', [Math.max(0,next),this.now(),row.id]);
    } else {
      if (delta < 0) throw new Error('ما كاينش مخزون كافي فهاد الموقع.');
      await this.db.run('INSERT INTO stock_balances (id,product_id,variant_id,location_id,batch_id,quantity,updated_at) VALUES (?,?,?,?,?,?,?)',
        [input.id + ':balance:' + locationId,input.productId,variantId,locationId,batchId,delta,this.now()]);
    }
  }

  async record(input: StockMovementInput): Promise<void> {
    const id = nonEmpty(input.id, 'معرّف الحركة');
    const productId = nonEmpty(input.productId, 'المنتج');
    const quantity = input.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError('الكمية خاصها تكون أكبر من صفر.');
    const from = input.fromLocationId?.trim() || null, to = input.toLocationId?.trim() || null;
    if (!from && !to) throw new Error('خاص تحدد مصدر أو وجهة المخزون.');
    if (from && to && from === to) throw new Error('المصدر والوجهة خاصهم يكونو مختلفين.');
    const timestamp = input.occurredAt ?? this.now();
    await this.db.beginTransaction();
    try {
      if (from) await this.changeBalance({ ...input, productId }, from, -quantity);
      if (to) await this.changeBalance({ ...input, productId }, to, quantity);
      await this.db.run(
        `INSERT INTO stock_movements (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,responsible_user_id,occurred_at,note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,productId,input.variantId ?? null,input.batchId ?? null,from,to,quantity,input.movementType,input.referenceType ?? null,input.referenceId ?? null,input.performedBy ?? null,input.responsibleUserId ?? null,timestamp,input.note ?? null],
      );
      await this.db.commitTransaction();
    } catch (error) {
      await this.db.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  }

  async getRecentMovements(limit=20):Promise<StockMovementRecord[]> {
    if(!Number.isSafeInteger(limit)||limit<1||limit>200) throw new RangeError('عدد حركات المخزون غير صالح.');
    const result=await this.db.query(
      `SELECT sm.id,p.name AS product_name,sm.movement_type,sm.quantity,
       source.label AS from_label,destination.label AS to_label,sm.occurred_at,sm.note
       FROM stock_movements sm JOIN products p ON p.id=sm.product_id
       LEFT JOIN stock_locations source ON source.id=sm.from_location_id
       LEFT JOIN stock_locations destination ON destination.id=sm.to_location_id
       ORDER BY sm.occurred_at DESC,sm.id DESC LIMIT ?`,[limit],
    );
    return (result.values??[]) as unknown as StockMovementRecord[];
  }

  async getExpiryAlerts(): Promise<ExpiryAlertRow[]> {
    const result=await this.db.query(
      `SELECT p.id AS product_id,p.name AS product_name,pb.id AS batch_id,pb.batch_code,pb.expiry_date,
       sl.label AS location_label,sb.quantity
       FROM stock_balances sb
       JOIN products p ON p.id=sb.product_id
       JOIN product_batches pb ON pb.id=sb.batch_id
       JOIN stock_locations sl ON sl.id=sb.location_id
       WHERE sb.quantity>0 AND pb.expiry_date IS NOT NULL AND sl.location_type='depot'
       ORDER BY pb.expiry_date ASC,p.name COLLATE NOCASE`,
    );
    return (result.values??[]) as unknown as ExpiryAlertRow[];
  }

  async getBalances(): Promise<StockBalanceRow[]> {
    const result = await this.db.query(
      `SELECT product_id,variant_id,location_id,batch_id,SUM(quantity) AS quantity
       FROM stock_balances GROUP BY product_id,variant_id,location_id,batch_id ORDER BY product_id,location_id`,
    );
    return (result.values ?? []) as unknown as StockBalanceRow[];
  }
}
