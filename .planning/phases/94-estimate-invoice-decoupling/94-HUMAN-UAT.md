---
status: partial
phase: 94-estimate-invoice-decoupling
source: [94-VERIFICATION.md]
started: 2026-06-19
updated: 2026-06-19
---

## Current Test

[awaiting human testing — requires a connected Stripe account in TEST mode under Settings → Payments]

## Tests

### 1. Generate-invoice button visible
expected: Opening a project's estimate in the editor shows a "Generate invoice" button.
result: [pending]

### 2. Deposit preview math
expected: Clicking "Generate invoice" → Deposit → 30% shows a preview of ~30% of the estimate total; flipping to Balance shows the complementary amount.
result: [pending]

### 3. Issue deposit invoice
expected: Issuing creates a Stripe invoice — a toast confirms, the editor shows "Invoice issued: $X · open", and the "View invoice" (Stripe hosted page) and "PDF" links both open.
result: [pending]

### 4. Snapshot is frozen
expected: After issuing, editing an item price and saving the estimate does NOT change the issued invoice amount — it still shows the ORIGINAL $X (immutable snapshot, D-07/INVOICE-06).
result: [pending]

### 5. Balance invoice as a second row
expected: Re-opening the dialog → Balance → issue creates a SECOND invoice row alongside the deposit.
result: [pending]

### 6. Public share-page pay links
expected: Opening the public share link shows "Pay deposit" / "Pay balance" links that open the Stripe-hosted invoice pages; the old single "Pay now" Checkout button is gone.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
