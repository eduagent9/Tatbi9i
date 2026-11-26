-- Link delivery evidence to the invoice that issued the stock and recorded the customer sale.
ALTER TABLE delivery_proofs ADD COLUMN invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_delivery_proofs_invoice ON delivery_proofs(invoice_id);
