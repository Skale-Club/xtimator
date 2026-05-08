---
phase: 26
slug: bulk-price-adjustment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x + React Testing Library |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~20 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts`
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 0 | BULKPRICE-01/02/03 | unit stubs (RED) | `npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts 2>&1 \| head -30` | ❌ Wave 0 | ⬜ pending |
| 26-01-02 | 01 | 1 | BULKPRICE-03 | unit schema | `npx vitest run tests/unit/schemas/price-book.test.ts` | ✅ after W0 | ⬜ pending |
| 26-01-03 | 01 | 1 | BULKPRICE-03 | unit action | `npx vitest run tests/unit/price-book/bulk-adjust-action.test.ts` | ✅ after W0 | ⬜ pending |
| 26-02-01 | 02 | 2 | BULKPRICE-01/02 | unit render | `npx vitest run tests/unit/price-book/bulk-adjust-dialog.test.tsx` | ✅ after W0 | ⬜ pending |
| 26-02-02 | 02 | 2 | BULKPRICE-01 | unit render | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/price-book/bulk-adjust-dialog.test.tsx` — RED stubs for BULKPRICE-02:
  - Preview table shows current → new prices based on % input
  - Preview empty when % is 0 or blank
  - New price column green for positive %, red for negative %
  - Dialog stays open on server action error
- [ ] `tests/unit/price-book/bulk-adjust-action.test.ts` — RED stubs for BULKPRICE-03:
  - `bulkAdjustPriceBookCategory` calls supabase upsert with correct computed prices
  - Returns `{ error }` on auth failure
  - Returns `{ data: { updated: N } }` on success
- [ ] New test cases in `tests/unit/price-book/price-book-list.test.tsx` — RED stubs for BULKPRICE-01:
  - "Adjust %" button renders on each category header
  - Clicking button opens BulkAdjustDialog for correct category
- [ ] New test cases in `tests/unit/schemas/price-book.test.ts` — RED stubs for BULKPRICE-01/03:
  - `bulkAdjustSchema` validates range -100 to +500
  - `z.coerce.number()` accepts string "10" from HTML input

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Adjust %" button visible on each category header in browser | BULKPRICE-01 | Visual layout check | Navigate to `/settings/price-book` with items → verify button next to each category name |
| Preview table updates live as user types % | BULKPRICE-02 | Real-time behavior with running app | Open dialog → type "10" → verify all prices update immediately |
| Confirm updates all prices atomically | BULKPRICE-03 | Requires real Supabase session | Apply +10% to category → refresh page → verify all items updated, none at old price |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
