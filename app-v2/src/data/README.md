# Data layer boundary

The new UI must not read or write `localStorage` directly. Database access will be introduced behind typed repositories/services.

## Safety rules

- Use transactions for every operation changing stock, invoices, payments, returns, or cash reconciliation.
- Keep historical invoice and purchase line snapshots immutable.
- Use stable IDs and versioned migrations.
- Store new money as integer Moroccan centimes; legacy numeric values must be retained raw until reconciled.
- Preserve original legacy date strings; normalize only when parsing is unambiguous.
- Never automatically read, mutate, or clear `localStorage` key `tatbiqi.database.v1`.
- Legacy validation is read-only and reports errors/warnings; it never repairs or imports records.
- Do not enable real sales workflows until SQLite Android runtime tests, repository transactions, and import dry-run reconciliation pass.

## Current implementation

- `legacy-validation.ts`: structural validation, duplicate/missing IDs, and dangling invoice references.
- `money.ts`: safe conversion between MAD and integer centimes.
- `migrations/001_initial_schema.sql`: initial schema draft.
- No live SQLite connection or import operation is enabled yet.
