# Data layer

- The legacy browser data key `tatbiqi.database.v1` is read-only input for a future, explicitly approved import. No code in this foundation writes to or deletes it.
- New persistence is SQLite through `@capacitor-community/sqlite` and is enabled only in the native Capacitor app.
- The web preview intentionally reports that persistent SQLite is unavailable; it does not silently fall back to localStorage or pretend data is saved.
- `sqlite-database.ts` owns the native connection and sequential, transactional schema migration runner.
- Migration versions are append-only. Never edit a migration that may already have shipped; add the next numbered migration instead.
- `products.ts` creates products and barcode records in one transaction.
- `stock.ts` records stock movements and balance changes in one transaction.
- `sales.ts` creates confirmed invoices, immutable line snapshots, initial partial/full collections, stock deductions, stock movement history, and audit events in one transaction. It selects expiring batches first when expiry dates are available.
- `payments.ts` records later customer debt collections, updates the invoice collected balance, and writes payment history and audit events in one transaction. It refuses overpayment and does not rewrite legacy invoices without a confirmed new-format timestamp.
- Sales and stock repositories are service-layer foundations; the current screen does not yet expose the full invoice workflow.
- Legacy dry-run and validation modules are read-only. No import is started automatically.
- The first schema is still a foundation draft. Runtime validation on a real Android device, backup/restore, and the SQLCipher/plugin licensing review remain release gates.
