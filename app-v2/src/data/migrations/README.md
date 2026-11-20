# SQLite schema and migration policy

The initial schema and append-only migrations are wired into the Capacitor SQLite runtime. CI applies all migrations to a fresh SQLite database with foreign keys enabled. A real Android-device persistence and upgrade test is still required before release.

## Money and quantity conventions

- All monetary values use integer minor units (centimes) in MAD; never use floating-point values for money.
- Quantities use REAL to support piece/carton conversions and fractional stock counts where needed.
- Product, unit, price, and invoice-line display snapshots are stored on transactional rows so later catalog edits do not rewrite history.
- New-format invoices support partial and full cash collection; legacy paid/due values remain in separate fields.

## Append-only migrations

1. `001_initial_schema.sql`: core entities and relationships.
2. `002_default_depot.sql`: local main depot.
3. `003_purchases.sql`: supplier purchase receipts and line snapshots.
4. `004_local_owner.sql`: local owner operational profile for offline first-run sales; this is not authentication.
5. `005_expenses.sql`: operating expense ledger.

Never edit a migration that may have shipped. Add the next sequential migration instead.

## Transaction rules

A stock-changing operation must update stock balances and append its stock movement in one SQLite transaction. A confirmed invoice, its lines, collection rows, stock movements, and audit events must be committed atomically. A failed operation must roll back all related changes.

Never delete confirmed financial or stock history. Corrections must be represented by reversals/returns and audit events.

## Data safety

- Do not automatically read, mutate, or clear `localStorage` key `tatbiqi.database.v1`.
- Import is a separately initiated, previewable, idempotent process with a fingerprint and per-record legacy IDs.
- Preserve the original JSON backup unchanged outside this database.
- No import should start until a dry-run report reconciles counts, totals, links, payments, returns, and purchase history.
- Runtime persistence, backup/restore, and SQLCipher/plugin licensing still require validation on a real Android device.

6. `006_stock_counts.sql`: stocktake headers and lines.
7. `007_return_traceability.sql`: invoice-line and batch references on returns.
8. `008_invoice_batch_allocations.sql`: records the exact FEFO batch quantities consumed by every invoice line, so later returns can be traced to the original batch.
