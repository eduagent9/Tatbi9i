-- Preserve the original vehicle count table and add variant-aware counts.
CREATE TABLE IF NOT EXISTS vehicle_stock_counts_v2 (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES vehicle_day_sessions(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  expected_quantity REAL NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity REAL NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity REAL NOT NULL,
  counted_at TEXT NOT NULL,
  UNIQUE(session_id, product_id, variant_id, batch_id),
  CHECK (ABS(variance_quantity - (counted_quantity - expected_quantity)) < 0.000001)
);
