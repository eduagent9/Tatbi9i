# Phase 1 baseline and data-preservation record

Date: 2026-11-20  
Repository: `eduagent9/Tatbi9i`  
Baseline branch: `main`  
Baseline commit: `911e6dfa5ab165550bd6f1da8c671c9d7fdf37e4`  
Working branch: `phase1/technical-foundation`

## Safety boundary

- The existing `main` branch is the untouched reference version.
- Phase 1 work is isolated on `phase1/technical-foundation`.
- No existing application files or user data are deleted or rewritten by this baseline record.
- Do not merge this branch into `main`, publish it to GitHub Pages, or replace the Android release until the migration and acceptance checks are reviewed.
- Keep an immutable copy of the original JSON backup before any migration is attempted.

## Repository inventory at baseline

The repository currently contains:

- `index.html` — approximately 66 KB; the RTL application UI and business logic are concentrated in one inline HTML/JavaScript file.
- `package.json` — Capacitor 7.4.3 dependencies and Android preparation scripts; no React, TypeScript, Vite, or SQLite dependency is currently configured.
- `capacitor.config.json` — Capacitor app configuration.
- `scripts/prepare-android.mjs` — copies the current web assets into the Capacitor web directory.
- `manifest.webmanifest`, `sw.js`, and `icon.svg` — PWA install and offline-cache assets.
- `.github/workflows/android.yml` — builds a debug APK using Node.js 20 and Java 21.
- `.github/workflows/pages.yml` — validates and deploys the current static app to GitHub Pages.

There is no checked-in application source tree, test directory, local database schema, server API, or multi-device synchronization service yet.

## Existing application behavior

The current app uses the browser storage key `tatbiqi.database.v1` and normalizes these top-level collections:

- `products`
- `invoices`
- `people`
- `expenses`
- `movements`
- `payments`
- `returns`
- `purchases`

It also stores business settings and a local PIN value. The current PIN is a local confirmation mechanism, not authentication, encryption, or role-based access control.

Existing workflows include products, POS sales, invoices, customers and suppliers, purchases, supplier payments, returns, stock movements, stock counts, expenses, reports, CSV export, and JSON backup/restore. Existing invoices can contain cash, partial-payment, or debt balances. Purchases can also have outstanding balances.

Important historical fields include product identifiers, invoice identifiers and numbers, invoice line snapshots, costs at sale time, customer references, payment records, return records, purchase line snapshots, and localized date strings. These records must be retained even though the new operating policy will prohibit new credit sales.

## Migration requirements

1. Preserve the original JSON backup byte-for-byte as an import source; never edit it in place.
2. Import into a new SQLite database, never directly over the old browser data.
3. Retain original IDs and references wherever present.
4. Preserve historical invoice, purchase, payment, return, expense, and movement records, including their original date text and financial snapshots.
5. Keep legacy debt balances visible as historical receivables; block creation of new credit sales in the new workflow only.
6. Preserve original monetary values without rounding during initial import. Apply explicit currency precision rules only in new calculations and migrations.
7. Validate row counts, IDs, references, totals, paid amounts, due amounts, returned totals, and stock movement history before accepting an import.
8. Produce an import report with counts, warnings, rejected rows, and reconciliation differences.
9. Make import idempotent using stable source IDs and a migration ledger; retrying an import must not duplicate records.
10. Keep the old application and its storage key available until the user has verified the migrated data and approved retirement of the legacy path.

## Technical direction approved for implementation

- Android-first application using Capacitor.
- React and TypeScript for a maintainable modular UI.
- SQLite as the on-device transactional database.
- A domain/service layer for inventory, orders, sales, deliveries, cash, returns, commissions, and reporting.
- A synchronization queue and central API introduced in a later phase.
- Arabic, French, and English support; MAD as the operating currency.
- Supabase remains deferred.

The exact SQLite plugin, migration tooling, and server/synchronization provider must be selected and verified for compatibility before implementation.

## Phase 1 completion gates

- [ ] This baseline is committed on the isolated working branch.
- [ ] A reviewed legacy-data field map is documented.
- [ ] A non-destructive backup/export and restore test procedure exists.
- [ ] New project structure and dependency choices are validated.
- [ ] Automated tests cover import validation and financial/stock invariants before any real-data migration.
- [ ] A debug APK can be built from the new branch without changing the published `main` app.
- [ ] No migration is considered complete until the user checks the imported records on a real device.
