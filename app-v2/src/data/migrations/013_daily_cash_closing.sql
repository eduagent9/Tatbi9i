CREATE TABLE IF NOT EXISTS daily_cash_closings (
  id TEXT PRIMARY KEY,
  business_date TEXT NOT NULL UNIQUE,
  opening_cash_minor INTEGER NOT NULL CHECK (opening_cash_minor >= 0),
  cash_in_minor INTEGER NOT NULL CHECK (cash_in_minor >= 0),
  refunds_minor INTEGER NOT NULL CHECK (refunds_minor >= 0),
  expenses_minor INTEGER NOT NULL CHECK (expenses_minor >= 0),
  supplier_payments_minor INTEGER NOT NULL CHECK (supplier_payments_minor >= 0),
  expected_cash_minor INTEGER NOT NULL CHECK (expected_cash_minor >= 0),
  counted_cash_minor INTEGER NOT NULL CHECK (counted_cash_minor >= 0),
  difference_minor INTEGER NOT NULL,
  notes TEXT,
  closed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
