# Phase 26: Bulk Price Adjustment — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 26-bulk-price-adjustment
**Areas discussed:** Entry point, Preview UX

---

## Entry Point

| Option | Description | Selected |
|--------|-------------|----------|
| "Adjust %" button on each category header | Inline button next to category name. Most discoverable. | ✓ |
| Per-category DropdownMenu on header | ⋯ button on category header with "Adjust prices" option. | |
| "Bulk Adjust" in page header | Single button in top header, user picks category inside dialog. | |

**User's choice:** "Adjust %" button on each category header (Recommended)
**Notes:** Consistent with Phase 20 D-02 card pattern — visible, contextual, no extra clicks.

---

## Preview UX

| Option | Description | Selected |
|--------|-------------|----------|
| Single Dialog: % input + live preview table | One Dialog, live table updates as user types %. | ✓ |
| Two-step Dialog: input then preview | Step 1: enter %. Step 2: preview table + confirm. | |
| AlertDialog only | No line-by-line preview — just count and confirm. Doesn't satisfy BULKPRICE-02. | |

**User's choice:** Single Dialog: % input + live preview table (Recommended)
**Notes:** Live preview via `useMemo` — pure math, no network call. Fast and clean.

---

## Claude's Discretion

- Price rounding: 2 decimal places (NUMERIC(12,2) schema match)
- Atomicity: single `.update().in('id', ids)` — no RPC needed
- Color coding in preview: green for positive %, red for negative %
- Button label: "Apply to {N} items" — dynamic count
- Zod validation: -100 to +500 range with descriptive messages

## Deferred Ideas

- Bulk adjustment across all categories at once — v1.5
- Undo/rollback — future
- Impact preview on existing estimates — future
- Absolute dollar amount adjustment — future
