import type { SqliteExecutor } from './sqlite-database';

export type SalePaymentMethod = 'cash' | 'bank' | 'other';
export interface SaleLineInput { productId: string; quantity: number; unitPriceMinor?: number; variantId?: string | null; }
export interface CreateSaleInput {
  id: string; invoiceNumber: string; customerId: string; sellerUserId: string;
  locationId: string; vehicleId?: string | null; orderId?: string | null; lines: SaleLineInput[]; discountMinor?: number;
  collectedMinor?: number; paymentMethod?: SalePaymentMethod; note?: string;
}
export interface CreatedSale {
  invoiceId: string; invoiceNumber: string; subtotalMinor: number; discountMinor: number;
  totalMinor: number; collectedMinor: number; dueMinor: number; lineCount: number;
}
type ProductRow = { id: string; name: string; base_unit: string; purchase_cost_minor: number; sale_price_minor: number };
type BalanceRow = { id: string; batch_id: string | null; quantity: number; expiry_date: string | null; unit_cost_minor: number };

function text(value: string, label: string): string {
  const result = value.trim(); if (!result) throw new Error(label + ' مطلوب.'); return result;
}
function money(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + ' خاصو يكون مبلغاً صحيحاً بالسنتيم.');
  return value;
}

/** Creates a confirmed sale and deducts its stock in one SQLite transaction. */
export class SalesRepository {
  constructor(
    private readonly db: SqliteExecutor,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly makeId: () => string = () => crypto.randomUUID(),
  ) {}

  async create(input: CreateSaleInput, transactionMode: 'managed' | 'external' = 'managed'): Promise<CreatedSale> {
    const invoiceId = text(input.id, 'معرّف الفاتورة');
    const invoiceNumber = text(input.invoiceNumber, 'رقم الفاتورة');
    const customerId = text(input.customerId, 'الزبون');
    const sellerUserId = text(input.sellerUserId, 'البائع');
    const locationId = text(input.locationId, 'موقع المخزون');
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('الفاتورة خاصها تحتوي على منتج واحد على الأقل.');
    const discountMinor = money(input.discountMinor ?? 0, 'التخفيض');
    const collectedMinor = money(input.collectedMinor ?? 0, 'المبلغ المؤدى');
    const timestamp = this.now();

    const prepared: Array<{ product: ProductRow; quantity: number; unitPrice: number; lineTotal: number; variantId: string | null }> = [];
    let subtotalMinor = 0;
    for (const line of input.lines) {
      const productId = text(line.productId, 'المنتج');
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new RangeError('الكمية خاصها تكون أكبر من صفر.');
      const found = await this.db.query(
        'SELECT id,name,base_unit,purchase_cost_minor,sale_price_minor FROM products WHERE id=? AND is_active=1 LIMIT 1',
        [productId],
      );
      const product = found.values?.[0] as ProductRow | undefined;
      if (!product) throw new Error('المنتج غير موجود أو غير نشيط: ' + productId);
      const unitPrice = money(line.unitPriceMinor ?? Number(product.sale_price_minor), 'ثمن البيع');
      const lineTotal = Math.round(line.quantity * unitPrice);
      if (!Number.isSafeInteger(lineTotal)) throw new RangeError('قيمة سطر الفاتورة كبيرة بزاف.');
      subtotalMinor += lineTotal;
      if (!Number.isSafeInteger(subtotalMinor)) throw new RangeError('إجمالي الفاتورة كبير بزاف.');
      prepared.push({ product, quantity: line.quantity, unitPrice, lineTotal, variantId: line.variantId?.trim() || null });
    }
    if (discountMinor > subtotalMinor) throw new RangeError('التخفيض ما يقدرش يفوت مجموع الفاتورة.');
    const totalMinor = subtotalMinor - discountMinor;
    if (collectedMinor > totalMinor) throw new RangeError('المبلغ المؤدى ما يقدرش يفوت صافي الفاتورة.');
    const method = input.paymentMethod ?? 'cash';
    if (!['cash','bank','other'].includes(method)) throw new Error('طريقة الأداء غير صالحة.');

    if (transactionMode === 'managed') await this.db.beginTransaction();
    try {
      await this.db.run(
        `INSERT INTO invoices
         (id,invoice_number,customer_id,order_id,seller_user_id,vehicle_id,status,subtotal_minor,offer_discount_minor,total_minor,collected_minor,confirmed_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invoiceId,invoiceNumber,customerId,input.orderId??null,sellerUserId,input.vehicleId??null,'confirmed',subtotalMinor,discountMinor,totalMinor,collectedMinor,timestamp,timestamp,timestamp],
      );

      for (const line of prepared) {
        const balances = await this.db.query(
          `SELECT sb.id,sb.batch_id,sb.quantity,pb.expiry_date,
             COALESCE((SELECT prl.unit_cost_minor FROM purchase_receipt_lines prl
               WHERE prl.batch_id=sb.batch_id ORDER BY prl.rowid LIMIT 1), ?) AS unit_cost_minor
           FROM stock_balances sb
           LEFT JOIN product_batches pb ON pb.id=sb.batch_id
           WHERE sb.product_id=? AND sb.variant_id IS ? AND sb.location_id=? AND sb.quantity>0
           ORDER BY CASE WHEN pb.expiry_date IS NULL THEN 1 ELSE 0 END, pb.expiry_date, sb.updated_at, sb.id`,
          [line.product.id,line.variantId,locationId,Number(line.product.purchase_cost_minor)],
        );
        const available = (balances.values ?? []) as unknown as BalanceRow[];
        const totalAvailable = available.reduce((sum,row)=>sum+Number(row.quantity),0);
        if (totalAvailable + 1e-9 < line.quantity) throw new Error('المخزون غير كافٍ للمنتج: ' + line.product.name);

        let remaining = line.quantity;
        const allocations: Array<{ batchId: string | null; quantity: number; unitCostMinor: number }> = [];
        for (const balance of available) {
          if (remaining <= 1e-9) break;
          const take = Math.min(remaining,Number(balance.quantity));
          await this.db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[Number(balance.quantity)-take,timestamp,balance.id]);
          await this.db.run(
            `INSERT INTO stock_movements
             (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,occurred_at,note)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [this.makeId(),line.product.id,line.variantId,balance.batch_id,locationId,null,take,'sale','invoice',invoiceId,timestamp,'بيع من الفاتورة '+invoiceNumber],
          );
          allocations.push({ batchId: balance.batch_id, quantity: take, unitCostMinor: money(Number(balance.unit_cost_minor ?? line.product.purchase_cost_minor), 'تكلفة الشراء') });
          remaining -= take;
        }

        const invoiceLineId = this.makeId();
        const allocatedCostMinor = allocations.reduce((sum, allocation) => sum + allocation.quantity * allocation.unitCostMinor, 0);
        const unitCostMinor = money(Math.round(allocatedCostMinor / line.quantity), 'تكلفة الشراء');
        await this.db.run(
          `INSERT INTO invoice_lines
           (id,invoice_id,product_id,variant_id,quantity,unit_price_minor,unit_cost_minor,line_total_minor,product_name_snapshot,unit_snapshot)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [invoiceLineId,invoiceId,line.product.id,line.variantId,line.quantity,line.unitPrice,unitCostMinor,line.lineTotal,line.product.name,line.product.base_unit],
        );
        for (const allocation of allocations) {
          await this.db.run(
            `INSERT INTO invoice_line_batch_allocations (id,invoice_line_id,batch_id,quantity,unit_cost_minor)
             VALUES (?,?,?,?,?)`,
            [this.makeId(),invoiceLineId,allocation.batchId,allocation.quantity,allocation.unitCostMinor],
          );
        }
      }

      if (collectedMinor > 0) {
        await this.db.run(
          `INSERT INTO payments (id,invoice_id,customer_id,amount_minor,method,payment_kind,received_by,received_at,note)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [this.makeId(),invoiceId,customerId,collectedMinor,method,'sale_collection',sellerUserId,timestamp,input.note?.trim() || null],
        );
      }
      await this.db.run(
        `INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at)
         VALUES (?,?,?,?,?,?,?)`,
        [this.makeId(),sellerUserId,'sale.created','invoice',invoiceId,JSON.stringify({invoiceNumber,subtotalMinor,discountMinor,totalMinor,collectedMinor,dueMinor:totalMinor-collectedMinor}),timestamp],
      );
      if (transactionMode === 'managed') await this.db.commitTransaction();
      return {invoiceId,invoiceNumber,subtotalMinor,discountMinor,totalMinor,collectedMinor,dueMinor:totalMinor-collectedMinor,lineCount:prepared.length};
    } catch (error) {
      if (transactionMode === 'managed') await this.db.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  }
}
