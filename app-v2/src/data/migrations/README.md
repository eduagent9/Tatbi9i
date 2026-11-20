# Initial SQLite schema

This is the first draft of the v2 local schema. It is intentionally separate from the legacy browser database and is not yet wired into the app runtime.

## Money and quantity conventions

- All monetary values use integer **minor units** (centimes) in MAD; never use floating-point values for money.
- Quantities use REAL to support piece/carton conversions and fractional stock counts where needed.
- Product, unit, price, and invoice-line display snapshots are stored on transactional rows so later catalog edits do not rewrite history.
- Legacy paid/due values are retained separately on imported invoices; the new sales UI will enforce cash-only sales.

## Transaction rules

A stock-changing operation must update stock balances and append its stock movement in one SQLite transaction. A confirmed invoice, its lines, cash/payment rows, and stock movements must be committed atomically. A failed operation must roll back all related changes.

Never delete confirmed financial or stock history. Corrections must be represented by reversals/returns and audit events.

## Data safety

- Do not automatically read, mutate, or clear `localStorage` key `tatbiqi.database.v1`.
- Import is a separately initiated, previewable, idempotent process with a fingerprint and per-record legacy IDs.
- Preserve the original JSON backup unchanged outside this database.
- No import should start until a dry-run report reconciles counts, totals, links, payments, returns, and purchase history.
- This schema is a draft: validate it against the actual SQLite plugin/runtime before marking it production-ready.

## Initial entities

Users and roles, vehicles, customers, suppliers, products/variants/barcodes, depots and vehicle stock, batches/expiry, orders, invoices, collections, cash sessions/handovers, returns, quantity offers, commission rules, audit events, offline sync outbox, and import ledger.
