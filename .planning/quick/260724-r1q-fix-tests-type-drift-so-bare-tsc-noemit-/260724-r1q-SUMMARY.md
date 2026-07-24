---
quick_id: 260724-r1q
title: Fix tests/** type drift so bare `tsc --noEmit` exits 0
mode: quick
status: complete
date: 2026-07-24
commits:
  - 744344fd  # image_position fixtures
  - 246748a9  # TS2556 mock signatures
  - 62f51c78  # Photo position / unit / cast
---

# Quick Task 260724-r1q — Summary

## Outcome

Bare whole-repo `npx tsc --noEmit` is back to **0 errors** (was 20, all in
`tests/**`). This restores the state prior quick task 260715-aa1 established on
2026-07-15 and clears the red "Bare typecheck (advisory, non-blocking)" step in
the CI `Test` workflow. Cleanup only — **no production code, no behavior change**.

## What changed (20 errors, 12 files, 3 atomic commits)

**Commit 744344fd — `image_position` fixtures (TS2741 ×8)**
The dev branch made `image_position: { scale; x; y } | null` a required field on
`PriceBookItem` / `DeletedPriceBookItem` (`lib/queries/price-book.ts`, migration
`20260723000001_image_position_metadata.sql`). Added `image_position: null` to
the stale fixtures. Three files spread a shared `ITEM_DEFAULTS`, so one edit each
covered multiple literals:
- `tests/unit/price-book/bulk-adjust-dialog.test.tsx` (ITEM_DEFAULTS → 2 fixtures)
- `tests/unit/price-book/price-book-list.test.tsx` (ITEM_DEFAULTS → 3 fixtures)
- `tests/unit/trash/trash-list.test.tsx` (ITEM_DEFAULTS → 2 fixtures)
- `tests/unit/price-book/price-book-item-dialog.test.tsx` (`makeItem` literal ×1)

**Commit 246748a9 — zero-arg mock signatures (TS2556 ×7)**
`vi.fn(async () => {})` and `vi.fn(() => ({ title, body }))` infer a **no-param**
call signature, so the deferred `vi.mock` wrapper `(...args: unknown[]) =>
mock(...args)` can't spread `unknown[]` (a non-tuple) into them. Added
`(..._args: unknown[])` to each mock declaration. Runtime is unchanged — the
mocks already received their args through the wrapper; only the declared type
widened.
- `mockRecordAICost`: `photo-extraction-call.test.ts`, `vision-truncation.test.ts`
- `mockBuildNotificationCopy`: `derived-duration.test.ts`,
  `transcribe-short-circuit.test.ts`, `analyze-photos-cost.test.ts`,
  `analyze-photos-coverage.test.ts`, `analyze-photos-structured.test.ts`

**Commit 62f51c78 — Photo position / unit / cast (TS2322 ×4, TS2352 ×1)**
- `tests/unit/capture/photo-thumbnail-cap.test.tsx`: `Photo` gained required
  `position: {...} | null` → added `position: null` to the one photo fixture.
- `tests/unit/schemas/estimate-bounds.test.ts`: `input.sections` is inferred from
  `baseInput()` with `unit: string`, but the two count-bound fixtures passed
  `unit: null`. The schema is `z.string().nullable()`, so any valid string parses
  identically; used `unit: 'ea'` (these tests assert only the 200/201 item-count
  bound, never unit nullability).
- `tests/unit/inngest/notification-email-digest.test.ts`: `DigestEmailItem` →
  `Record<string, unknown>` needs an intermediate `unknown` cast.

## Verification

- `npx tsc --noEmit` (bare, whole repo): **0 errors**.
- `npx vitest run` over the 14 touched files: **135/135 passed**.
- `npx vitest run tests/unit tests/eval` (full CI gate): see STATE row.

## Notes

- All commits are on branch `claude/heuristic-kare-10d5b8`, **not pushed**.
- `image_position: null` / `position: null` chosen (vs a `{scale,x,y}` object)
  because the tests exercise list/dialog/trash rendering, not crop positioning —
  `null` is the honest "no crop set" default and matches the type's null branch.
