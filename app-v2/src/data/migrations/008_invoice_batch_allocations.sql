CREATE TABLE IF NOT EXISTS invoice_line_batch_allocations (
  id TEXT PRIMARY KEY,
  invoice_line_id TEXT NOT NULL REFERENCES invoice_lines(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_batch_allocations_line
  ON invoice_line_batch_allocations(invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_invoice_batch_allocations_batch
  ON invoice_line_batch_allocations(batch_id);
