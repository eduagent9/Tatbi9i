import type { SqliteExecutor } from './sqlite-database';

export interface ProductInput {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  baseUnit?: 'piece' | 'carton';
  piecesPerCarton?: number | null;
  purchaseCostMinor: number;
  salePriceMinor: number;
  lowStockThreshold?: number;
  barcode?: string | null;
}

export interface ProductRecord {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  base_unit: string;
  pieces_per_carton: number | null;
  purchase_cost_minor: number;
  sale_price_minor: number;
  low_stock_threshold: number;
  total_stock: number;
  barcode: string | null;
}

function requiredText(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(label + ' مطلوب.');
  return clean;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(label + ' غير صالح.');
  return value;
}

export class ProductRepository {
  constructor(private readonly db: SqliteExecutor, private readonly now: () => string = () => new Date().toISOString()) {}

  async create(input: ProductInput): Promise<void> {
    const id = requiredText(input.id, 'معرّف المنتج');
    const name = requiredText(input.name, 'اسم المنتج');
    const unit = input.baseUnit ?? 'piece';
    const pieces = input.piecesPerCarton ?? null;
    const cost = nonNegative(input.purchaseCostMinor, 'ثمن الشراء');
    const price = nonNegative(input.salePriceMinor, 'ثمن البيع');
    const threshold = nonNegative(input.lowStockThreshold ?? 0, 'حد التنبيه');
    if (unit === 'carton' && (!Number.isSafeInteger(pieces) || (pieces ?? 0) <= 0)) {
      throw new RangeError('عدد القطع في الكرتونة خاصو يكون صحيح وموجب.');
    }
    if (unit === 'piece' && pieces !== null) throw new Error('عدد القطع في الكرتونة ما كيلزمش لوحدة القطعة.');
    const barcode = input.barcode?.trim() || null;
    const timestamp = this.now();

    await this.db.beginTransaction();
    try {
      await this.db.run(
        `INSERT INTO products
        (id,name,category,subcategory,base_unit,pieces_per_carton,purchase_cost_minor,sale_price_minor,low_stock_threshold,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id,name,input.category?.trim() || null,input.subcategory?.trim() || null,unit,pieces,cost,price,threshold,timestamp,timestamp],
      );
      if (barcode) {
        await this.db.run(
          'INSERT INTO barcodes (id,product_id,barcode,unit,units_per_scan) VALUES (?,?,?,?,?)',
          [input.id + ':barcode',id,barcode,unit,unit === 'carton' ? pieces : 1],
        );
      }
      await this.db.commitTransaction();
    } catch (error) {
      await this.db.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  }

  async list(): Promise<ProductRecord[]> {
    const result = await this.db.query(
      `SELECT p.id,p.name,p.category,p.subcategory,p.base_unit,p.pieces_per_carton,
       p.purchase_cost_minor,p.sale_price_minor,p.low_stock_threshold,
       COALESCE(SUM(sb.quantity),0) AS total_stock,
       (SELECT b.barcode FROM barcodes b WHERE b.product_id=p.id ORDER BY b.id LIMIT 1) AS barcode
       FROM products p
       LEFT JOIN stock_balances sb ON sb.product_id=p.id
       WHERE p.is_active=1
       GROUP BY p.id
       ORDER BY p.name COLLATE NOCASE`,
    );
    return (result.values ?? []) as unknown as ProductRecord[];
  }
}
