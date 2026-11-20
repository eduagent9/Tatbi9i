# Database acceptance checks (phase 1)

Before this schema is connected to live workflows, automate these checks against the same SQLite engine/version used by the Android build:

1. Foreign keys are enabled and invalid references are rejected.
2. A product may have multiple variants and unique barcodes; duplicate barcodes fail.
3. Vehicle stock is isolated by stock location; moving stock records one movement and updates both balances in a single transaction.
4. Quantities and money reject negative values; money is stored as integer centimes.
5. A confirmed invoice and its line snapshots cannot be silently deleted or rewritten by application services.
6. New invoice workflow rejects unpaid/part-paid sales; legacy invoice balances remain readable and are not reinterpreted as new credit sales.
7. Returns record condition (sellable/damaged/expired/shortage); only approved sellable returns can increase saleable stock.
8. Cash handover requires a unique receipt number and records both giver and receiver.
9. An import with the same source key and fingerprint is idempotent; a different fingerprint is a separate preview/review event.
10. Offline writes append an outbox entry; failed sync never deletes the local transaction.
11. Database close/reopen preserves records; export/restore round-trip preserves counts and totals.
12. A failed multi-table transaction leaves no partial invoice, payment, or stock movement behind.

These are requirements, not claims of tests already executed. The schema is a draft and must pass engine-level tests before release.
