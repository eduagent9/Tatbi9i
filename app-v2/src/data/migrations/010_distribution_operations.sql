-- Distribution operations, customer credit controls, supplier settlement and proof of delivery.
-- Append-only migration: never rewrite migrations 001-009 after they have shipped.

ALTER TABLE customers
  ADD COLUMN credit_limit_minor INTEGER NOT NULL DEFAULT 0
  CHECK (credit_limit_minor >= 0);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id TEXT PRIMARY KEY,
  route_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  planned_date TEXT NOT NULL,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','started','completed','cancelled')),
  started_at TEXT,
  completed_at TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (completed_at IS NULL OR started_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS delivery_route_stops (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES delivery_routes(id) ON DELETE RESTRICT,
  stop_order INTEGER NOT NULL CHECK (stop_order > 0),
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES sales_orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','arrived','partially_delivered','delivered','failed','skipped')),
  planned_at TEXT,
  arrived_at TEXT,
  completed_at TEXT,
  failure_reason TEXT,
  notes TEXT,
  UNIQUE(route_id, stop_order)
);
CREATE INDEX IF NOT EXISTS idx_route_stops_route_status
  ON delivery_route_stops(route_id, status, stop_order);
CREATE INDEX IF NOT EXISTS idx_routes_date_status
  ON delivery_routes(planned_date, status);

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id TEXT PRIMARY KEY,
  route_stop_id TEXT NOT NULL REFERENCES delivery_route_stops(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES sales_orders(id) ON DELETE RESTRICT,
  driver_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  result TEXT NOT NULL CHECK (result IN ('delivered','partial','refused','not_available','damaged')),
  recipient_name TEXT,
  signature_local_uri TEXT,
  photo_local_uri TEXT,
  latitude REAL,
  longitude REAL,
  note TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS idx_delivery_proofs_stop_time
  ON delivery_proofs(route_stop_id, captured_at);

CREATE TABLE IF NOT EXISTS vehicle_day_sessions (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  responsible_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  business_date TEXT NOT NULL,
  opening_odometer REAL CHECK (opening_odometer IS NULL OR opening_odometer >= 0),
  closing_odometer REAL CHECK (closing_odometer IS NULL OR closing_odometer >= 0),
  opening_cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
  expected_cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (expected_cash_minor >= 0),
  counted_cash_minor INTEGER CHECK (counted_cash_minor IS NULL OR counted_cash_minor >= 0),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','submitted','reconciled')),
  discrepancy_note TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  UNIQUE(vehicle_id, business_date),
  CHECK (closing_odometer IS NULL OR opening_odometer IS NULL OR closing_odometer >= opening_odometer)
);

CREATE TABLE IF NOT EXISTS vehicle_stock_counts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES vehicle_day_sessions(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  expected_quantity REAL NOT NULL CHECK (expected_quantity >= 0),
  counted_quantity REAL NOT NULL CHECK (counted_quantity >= 0),
  variance_quantity REAL NOT NULL,
  counted_at TEXT NOT NULL,
  UNIQUE(session_id, product_id, batch_id),
  CHECK (ABS(variance_quantity - (counted_quantity - expected_quantity)) < 0.000001)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_receipt_id TEXT REFERENCES purchase_receipts(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','bank','other')),
  reference_number TEXT,
  paid_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  paid_at TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_time
  ON supplier_payments(supplier_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_receipt
  ON supplier_payments(purchase_receipt_id);

CREATE TABLE IF NOT EXISTS supplier_returns (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_receipt_id TEXT REFERENCES purchase_receipts(id) ON DELETE RESTRICT,
  reference_number TEXT,
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  reason TEXT NOT NULL,
  processed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  processed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_return_lines (
  id TEXT PRIMARY KEY,
  supplier_return_id TEXT NOT NULL REFERENCES supplier_returns(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  product_name_snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier_time
  ON supplier_returns(supplier_id, processed_at);
