ALTER TABLE product_return_lines ADD COLUMN invoice_line_id TEXT REFERENCES invoice_lines(id) ON DELETE RESTRICT;
ALTER TABLE product_return_lines ADD COLUMN batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT;
ALTER TABLE product_return_lines ADD COLUMN line_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (line_total_minor >= 0);
CREATE INDEX IF NOT EXISTS idx_return_lines_invoice_line ON product_return_lines(invoice_line_id);