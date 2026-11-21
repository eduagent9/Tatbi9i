import { describe, expect, it } from 'vitest';
import { APP_MIGRATIONS } from './sqlite-database';

describe('append-only distribution migration', () => {
  it('registers migration 010 after the existing nine migrations', () => {
    expect(APP_MIGRATIONS.map(migration => migration.version)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
    expect(APP_MIGRATIONS[9].name).toBe('distribution_operations');
    expect(APP_MIGRATIONS[10].name).toBe('variant_vehicle_counts');
    expect(APP_MIGRATIONS[11].name).toBe('personal_orders_and_product_images');
  });

  it('adds product image storage and append-only order reservations', () => {
    const sql = APP_MIGRATIONS[11].sql;
    expect(sql).toContain('ALTER TABLE products ADD COLUMN image_data_uri TEXT');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sales_order_reservations');
    expect(sql).toContain('fulfilled_quantity');
  });

  it('contains the data structures required for route execution and settlement', () => {
    const sql = APP_MIGRATIONS[9].sql;
    for (const table of [
      'delivery_routes',
      'delivery_route_stops',
      'delivery_proofs',
      'vehicle_day_sessions',
      'vehicle_stock_counts',
      'supplier_payments',
      'supplier_returns',
      'supplier_return_lines',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain('credit_limit_minor');
    expect(sql).toContain('UNIQUE(vehicle_id, business_date)');
  });

  it('registers variant-aware vehicle count history', () => {
    expect(APP_MIGRATIONS[10].sql).toContain('vehicle_stock_counts_v2');
    expect(APP_MIGRATIONS[10].sql).toContain('variant_id');
  });

  it('keeps route and financial history protected from cascading deletion', () => {
    const sql = APP_MIGRATIONS[9].sql;
    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
    expect(sql).toContain('REFERENCES sales_orders(id) ON DELETE RESTRICT');
    expect(sql).toContain('REFERENCES purchase_receipts(id) ON DELETE RESTRICT');
  });
});
