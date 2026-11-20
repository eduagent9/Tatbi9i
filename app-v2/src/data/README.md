# Data layer

- The legacy browser data key `tatbiqi.database.v1` is read-only input for a future, explicitly approved import. No code in this foundation writes to or deletes it.
- New persistence is SQLite through `@capacitor-community/sqlite` and is enabled only in the native Capacitor app.
- The web preview intentionally reports that persistent SQLite is unavailable; it does not silently fall back to localStorage or pretend data is saved.
- `sqlite-database.ts` owns the native connection and sequential, transactional schema migration runner.
- Migration versions are append-only. Never edit a migration that may already have shipped; add the next numbered migration instead.
- `products.ts` creates products and barcode records in one transaction.
- `stock.ts` records stock movements and balance changes in one transaction.
- `stock-counts.ts` completes physical stock counts, stores expected/counted/variance snapshots, applies only non-zero adjustments, and writes movement and audit history atomically. Migration 006 adds append-only count records.
- `returns.ts` completes customer returns against confirmed invoice lines, prevents returning more than the unreturned quantity, prorates invoice discounts, tracks original invoice lines and optional batches, restores only sellable goods, records cash refunds and audit history, and updates the outstanding invoice balance atomically. Migration 007 adds return-line traceability without rewriting earlier migrations.
- `sales.ts` creates confirmed invoices, immutable line snapshots, initial partial/full collections, stock deductions, stock movement history, and audit events in one transaction. It selects expiring batches first when expiry dates are available.
- `payments.ts` records later customer debt collections, updates the invoice collected balance, and writes payment history and audit events in one transaction. It refuses overpayment and does not rewrite legacy invoices without a confirmed new-format timestamp.
- `customers.ts` creates and searches the customer directory; customer debt is calculated from invoice balances rather than maintained as a separately mutable total. Legacy invoice debt is read from its preserved legacy balance field.
- `suppliers.ts` creates and searches suppliers; supplier purchase totals are derived from receipt history.
- `purchases.ts` records supplier receipts, immutable purchase-line snapshots, optional expiry batches, stock balances/movements, weighted average purchase cost, and audit history in one transaction. Migration 003 adds the purchase receipt tables without editing shipped migrations.
- Migration 004 seeds a local owner profile (`local-owner`) for the single-device first-run sales flow. This is an operational profile only, not a login or access-control system.
- The current screen exposes basic customer creation, multi-line invoice cart with optional discount and partial cash collection, later cash collection against outstanding confirmed invoices, supplier creation, multi-line purchase receipts with optional batch/expiry details, low-stock warnings, expiry-batch alerts, recent stock movement history, operating expense entry, and a read-only financial summary. Profit uses confirmed invoice net totals and immutable line-cost snapshots, then subtracts recorded operating expenses. Returns now have a transactional data-layer implementation and tests; the return workflow still needs to be connected to the app screen. Taxes, receipt printing, and broader non-cash workflows remain to be connected.
- Legacy dry-run and validation modules are read-only. No import is started automatically.
- The first schema is still a foundation draft. Runtime validation on a real Android device, backup/restore, and the SQLCipher/plugin licensing review remain release gates.
