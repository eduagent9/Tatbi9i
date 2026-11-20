CREATE TABLE IF NOT EXISTS purchase_receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  received_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  note TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES purchase_receipts(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  product_name_snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_time ON purchase_receipts(supplier_id, received_at);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_receipt ON purchase_receipt_lines(receipt_id);
