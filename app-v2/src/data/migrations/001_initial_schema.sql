PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','depot_manager','order_rep','van_sales','delivery_driver')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('van_sales','delivery')),
  assigned_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  region TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  legacy_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  legacy_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  base_unit TEXT NOT NULL DEFAULT 'piece',
  pieces_per_carton INTEGER CHECK (pieces_per_carton IS NULL OR pieces_per_carton > 0),
  purchase_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (purchase_cost_minor >= 0),
  sale_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (sale_price_minor >= 0),
  low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  has_expiry INTEGER NOT NULL DEFAULT 0 CHECK (has_expiry IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  image_local_uri TEXT,
  legacy_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_name TEXT NOT NULL,
  sku TEXT,
  size_label TEXT,
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0),
  unit TEXT NOT NULL DEFAULT 'piece',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, variant_name)
);

CREATE TABLE IF NOT EXISTS barcodes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  barcode TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL DEFAULT 'piece',
  units_per_scan REAL NOT NULL DEFAULT 1 CHECK (units_per_scan > 0)
);

CREATE TABLE IF NOT EXISTS stock_locations (
  id TEXT PRIMARY KEY,
  location_type TEXT NOT NULL CHECK (location_type IN ('depot','vehicle')),
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CHECK ((location_type = 'vehicle' AND vehicle_id IS NOT NULL) OR
         (location_type = 'depot' AND vehicle_id IS NULL))
);

CREATE TABLE IF NOT EXISTS product_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_code TEXT,
  expiry_date TEXT,
  received_at TEXT NOT NULL,
  legacy_id TEXT
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  location_id TEXT NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, variant_id, location_id, batch_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE RESTRICT,
  from_location_id TEXT REFERENCES stock_locations(id) ON DELETE RESTRICT,
  to_location_id TEXT REFERENCES stock_locations(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('opening','purchase_receipt','load_vehicle','replenishment','sale','delivery','customer_return','supplier_return','damage','stock_count','transfer')),
  reference_type TEXT,
  reference_id TEXT,
  performed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  responsible_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  note TEXT,
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','accepted','preparing','ready','partially_delivered','delivered','cancelled')),
  subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  offer_discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (offer_discount_minor >= 0),
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  product_name_snapshot TEXT NOT NULL,
  unit_snapshot TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES sales_orders(id) ON DELETE RESTRICT,
  seller_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft','confirmed','partially_returned','returned','voided')),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  offer_discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (offer_discount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  collected_minor INTEGER NOT NULL DEFAULT 0 CHECK (collected_minor >= 0),
  legacy_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (legacy_paid_minor >= 0),
  legacy_due_minor INTEGER NOT NULL DEFAULT 0 CHECK (legacy_due_minor >= 0),
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  unit_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  product_name_snapshot TEXT NOT NULL,
  unit_snapshot TEXT NOT NULL,
  legacy_line_id TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','bank','other','legacy_unknown')),
  payment_kind TEXT NOT NULL CHECK (payment_kind IN ('sale_collection','legacy_balance','refund','cash_handover')),
  received_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  received_at TEXT NOT NULL,
  legacy_id TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE RESTRICT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  opening_cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (opening_cash_minor >= 0),
  expected_cash_minor INTEGER NOT NULL DEFAULT 0 CHECK (expected_cash_minor >= 0),
  counted_cash_minor INTEGER CHECK (counted_cash_minor IS NULL OR counted_cash_minor >= 0),
  discrepancy_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','submitted','reconciled'))
);

CREATE TABLE IF NOT EXISTS cash_handovers (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  receipt_number TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS product_returns (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  processed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  destination_location_id TEXT REFERENCES stock_locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','completed')),
  reason TEXT NOT NULL,
  refund_minor INTEGER NOT NULL DEFAULT 0 CHECK (refund_minor >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_return_lines (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES product_returns(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  condition TEXT NOT NULL CHECK (condition IN ('sellable','damaged','expired','shortage')),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0)
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  buy_quantity REAL NOT NULL CHECK (buy_quantity > 0),
  free_quantity REAL NOT NULL CHECK (free_quantity > 0),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('collection_percent','product_rate','monthly_target','new_customer')),
  rate_basis_points INTEGER CHECK (rate_basis_points IS NULL OR rate_basis_points >= 0),
  product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
  target_minor INTEGER CHECK (target_minor IS NULL OR target_minor >= 0),
  bonus_minor INTEGER CHECK (bonus_minor IS NULL OR bonus_minor >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  starts_at TEXT NOT NULL,
  ends_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  device_id TEXT,
  latitude REAL,
  longitude REAL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS legacy_import_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated','importing','completed','failed','rolled_back')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  UNIQUE(source_key, source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_stock_balances_location ON stock_balances(location_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_time ON stock_movements(product_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_time ON sales_orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON sales_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_time ON invoices(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_time ON payments(invoice_id, received_at);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON product_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity_time ON audit_events(entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_outbox(synced_at, created_at);
