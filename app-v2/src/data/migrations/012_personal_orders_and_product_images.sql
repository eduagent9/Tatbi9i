ALTER TABLE products ADD COLUMN image_data_uri TEXT;

CREATE TABLE IF NOT EXISTS sales_order_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  order_line_id TEXT NOT NULL REFERENCES sales_order_lines(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  fulfilled_quantity REAL NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0 AND fulfilled_quantity <= quantity),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','released')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_reservations_active_stock
  ON sales_order_reservations(product_id, variant_id, location_id, status);
CREATE INDEX IF NOT EXISTS idx_order_reservations_order
  ON sales_order_reservations(order_id, status);
