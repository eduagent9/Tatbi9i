CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  count_number TEXT NOT NULL UNIQUE,
  location_id TEXT NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  counted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('completed')),
  note TEXT,
  counted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_count_lines (
  id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL REFERENCES stock_counts(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  expected_quantity REAL NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity REAL NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_counts_location_time ON stock_counts(location_id, counted_at);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON stock_count_lines(count_id);