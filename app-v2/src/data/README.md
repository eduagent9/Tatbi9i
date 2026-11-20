# Data layer boundary

The new UI must not read or write `localStorage` directly.

Database access will be introduced behind typed repositories/services. The initial schema and adapters are intentionally not implemented until the SQLite plugin has passed an Android build/runtime smoke test and the legacy import contract has been reviewed.

Rules:

- Use transactions for any operation that changes stock, invoices, payments, returns, or cash reconciliation.
- Keep historical invoice and purchase line snapshots immutable.
- Use stable IDs and migration version records.
- Keep all timestamps in a canonical UTC/offset-aware representation for new records, while preserving raw legacy date strings.
- Never import or overwrite the legacy `tatbiqi.database.v1` browser storage automatically.
- Do not enable real sales workflows in this scaffold.
