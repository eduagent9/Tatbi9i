import type { SqliteExecutor } from './sqlite-database';

export interface ProductImageRecord {
  id: string;
  product_id: string;
  image_data_uri: string;
  position: number;
  is_primary: number;
}

export class ProductImagesRepository {
  constructor(private readonly db: SqliteExecutor, private readonly now: () => string = () => new Date().toISOString()) {}

  async list(productId: string): Promise<ProductImageRecord[]> {
    const result = await this.db.query(
      'SELECT id,product_id,image_data_uri,position,is_primary FROM product_images WHERE product_id=? ORDER BY is_primary DESC,position,id',
      [productId],
    );
    return (result.values ?? []) as unknown as ProductImageRecord[];
  }

  async replace(productId: string, images: string[], primaryIndex = 0): Promise<void> {
    if (images.length > 5) throw new Error('الحد الأقصى هو 5 صور لكل منتج.');
    if (images.some(value => !value.startsWith('data:image/'))) throw new Error('كاينة صورة غير صالحة.');
    if (images.length && (!Number.isInteger(primaryIndex) || primaryIndex < 0 || primaryIndex >= images.length)) {
      throw new Error('اختار الصورة الرئيسية بشكل صحيح.');
    }
    const timestamp = this.now();
    await this.db.beginTransaction();
    try {
      const product = await this.db.query('SELECT id FROM products WHERE id=? AND is_active=1', [productId]);
      if (!product.values?.length) throw new Error('المنتج غير موجود أو مؤرشف.');
      await this.db.run('DELETE FROM product_images WHERE product_id=?', [productId]);
      for (let index = 0; index < images.length; index++) {
        await this.db.run(
          'INSERT INTO product_images (id,product_id,image_data_uri,position,is_primary,created_at) VALUES (?,?,?,?,?,?)',
          [crypto.randomUUID(), productId, images[index], index, index === primaryIndex ? 1 : 0, timestamp],
        );
      }
      await this.db.run('UPDATE products SET image_data_uri=?,updated_at=? WHERE id=?', [images[primaryIndex] ?? null, timestamp, productId]);
      await this.db.commitTransaction();
    } catch (error) {
      await this.db.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  }
}
