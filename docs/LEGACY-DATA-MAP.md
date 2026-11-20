# Legacy data map (observed from main)

Source: `index.html` at baseline commit `911e6dfa5ab165550bd6f1da8c671c9d7fdf37e4`.  
This is an observed field map, not a promise that every old record contains every optional field.

## Database root

- `products[]`
- `invoices[]`
- `people[]`
- `expenses[]`
- `movements[]`
- `payments[]`
- `returns[]`
- `purchases[]`
- `business` (string)
- `pin` (local PIN string; do not treat as a secure user credential)

## Observed record fields

### Products
Observed: `id`, `name`, `code`, `qty`, `cost`, `price`, `threshold`, `expiryDate`, `image`.  
Quantity and price/cost values are normalized to numbers. Images may be data URLs. The old product record represents a single simple stock item; it does not yet model variants, batches, or multiple stock locations.

### Invoices
Observed: `id`, `no`, `date`, `customer`, optional `customerId`, `items[]`, `total`, `subtotal`, `discount`, `discountType`, `paid`, `due`, `returnedTotal`, `refundPaid`, `cost`.  
Invoice item snapshots include `id`, `name`, `qty`, `price`, `cost`, and `total`. Preserve these snapshots; do not recalculate historical invoices from current product prices or costs.

### People
Observed: `id`, `name`, `phone`, `type` (`customer` or `supplier`). Customer invoices may have `customerId`; older invoices may only contain a customer name.

### Payments
Observed: `id`, `invoiceId`, `invoiceNo`, `customer`, `amount`, `note`, `date`. These are historical invoice collections and must remain linked to their original invoice IDs.

### Returns
Observed: `id`, `invoiceId`, `invoiceNo`, `customer`, `date`, `items[]`, `amount`, `cashRefund`. Return item snapshots include `productId`, `name`, `qty`, `unitPrice`, `lineTotal`, `unitCost`, and `costTotal`.

### Purchases
Observed: `id`, `date`, `supplierId`, `supplier`, `reference`, `items[]`, `total`, `paid`, `due`, `note`. Purchase item snapshots include `productId`, `name`, `qty`, `unitCost`, `lineTotal`, `oldQty`, and `oldCost`. A purchase may also contain nested `payments[]`.

### Stock movements
Observed movement fields include `id`, `date`, `name`, `qty`, `reason`, and optional `costChange`. These older movements are name-based rather than consistently linked by product ID; do not invent missing references during migration.

### Expenses
Observed: `id`, `date`, `name`, `amount`.

## Date and numeric handling

- Existing date fields are commonly generated using `toLocaleString('fr-MA')` or `toLocaleDateString('fr-MA')`, not a canonical ISO timestamp.
- Preserve the exact original date string in a legacy/source field. Parse it only when the format is unambiguous; store any normalized timestamp separately and retain parse warnings.
- Existing monetary values are JavaScript numbers. Do not silently round or rewrite them during raw import.
- Product stock quantity can be fractional in stock-count flows; do not assume all historical quantities are integers.
- Costs, sale prices, paid amounts, dues, refunds, and return totals are historical snapshots and must be reconciled, not recomputed from current settings.

## Known compatibility and migration hazards

1. The current schema supports one stock quantity per product; new depot and vehicle stock must be introduced without overwriting the legacy quantity.
2. Product barcode `code` is currently a single field. New variants may require separate barcode records.
3. Old movements are sometimes name-only. Retain them as legacy events and avoid guessing product IDs where names are duplicated or changed.
4. Old invoices may contain debt and partial payments. These remain historical receivables even after new credit sales are disabled.
5. Old dates are locale-formatted strings. Preserve raw values to avoid timezone or day/month conversion errors.
6. Product images may be embedded data URLs. Migration must preserve them or report unsupported/oversized media explicitly.
7. The old PIN value is not authentication. Never migrate it as a password or use it as a role credential.

## Required migration verification

For each import, report and reconcile:

- Count of records in each root collection.
- Duplicate or missing IDs.
- Invoice line totals versus saved invoice totals (report differences; never rewrite silently).
- Invoice paid, due, returned, and refund values.
- Payment-to-invoice references.
- Return-to-invoice references and returned quantities by invoice line.
- Purchase totals and supplier payment balances.
- Product quantity and historical movement totals, noting that name-only movements may prevent exact reconstruction.
- Image counts and any media conversion failures.

No destructive migration or old-storage cleanup is permitted until the user has checked the imported dataset and explicitly accepted the result.
