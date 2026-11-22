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
10. Offline writes remain local. Multi-device sync is explicitly unavailable until a backend, outbox worker, retry policy, and conflict-resolution protocol are implemented and tested.
11. Close/reopen and backup/restore preserve records and totals.
12. Failed multi-table transactions leave no partial financial or stock records.
13. Legacy JSON validation flags malformed collections, duplicate IDs, and unresolved payment/return invoice references without changing source data.

These are acceptance requirements, not claims that all tests have passed. Migration 010 currently supplies database structures for route stops, delivery proof metadata, vehicle-day settlement, customer credit limits, supplier payments, and supplier returns; UI workflows and transaction services for those new structures remain release requirements.


## Phase 2 field workflow additions

14. Product photos are stored in the existing `products.image_local_uri` column and shown in image-first product cards; field selectors must keep the image as the dominant card area.
15. Delivery proof may include recipient name, touch signature, and a captured photo; the proof record must be tied to the assigned driver and active route stop.
16. Arabic, French, and English can be selected; the current language pack translates the main navigation, role labels, and shared shell. Full translation of every workflow label is still a release task.
17. Backup/restore includes SQLite data, including locally stored product photos and delivery evidence. Backups are unencrypted JSON and must be stored securely.
18. Cross-device synchronization is not enabled. A server endpoint, authenticated device identity, durable outbox, retry/backoff, idempotency keys, conflict rules, and security review are required before enabling it. Do not point devices at a shared database file or claim sync from local backup/export.
19. Physical Android verification is mandatory for camera/gallery permissions, signature touch handling, large-photo storage, restore/reopen, print-to-PDF, and offline operation. CI build success is not a substitute for a real-device test.
