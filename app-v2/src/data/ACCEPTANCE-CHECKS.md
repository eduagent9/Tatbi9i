# Database acceptance checks (phase 1)

1. Foreign keys are enabled and invalid references are rejected.
2. Product variants and unique barcodes are supported.
3. Vehicle stock is isolated by location; movement and balance changes share one transaction.
4. Money is stored as integer centimes; invalid/negative amounts are rejected.
5. Historical invoice and line snapshots are immutable through application services.
6. New sales require full collection; old debt and partial payments remain readable.
7. Returns record sellable/damaged/expired/shortage condition; only approved sellable returns enter saleable stock.
8. Cash handover has a unique receipt and both responsible users.
9. Re-import of identical source fingerprint is idempotent.
10. Offline writes remain local and queued when sync fails.
11. Close/reopen and backup/restore preserve records and totals.
12. Failed multi-table transactions leave no partial financial or stock records.
13. Legacy JSON validation flags malformed collections, duplicate IDs, and unresolved payment/return invoice references without changing source data.

These are acceptance requirements, not claims that all tests have passed.
