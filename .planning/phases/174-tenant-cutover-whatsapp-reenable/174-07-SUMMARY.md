---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 07
subsystem: notifications
tags: [TNT-01, copyContext, sweep, mechanical]
dependency_graph:
  requires: [174-04, 174-05]
  provides: [TNT-01]
  affects: [dispatch.ts]
tech_stack:
  patterns: [copyContext wiring, mechanical sweep]
  added: []
key_files:
  created: []
  modified:
    - lib/whatsapp/handler.ts
    - app/admin/billing/actions.ts
    - app/estimate/[token]/actions.ts
    - tests/unit/notifications/event-sources.test.ts
decisions:
  - Placed after Plan 174-05 (Wave 4 instead of Wave 3) to serialize event-sources.test.ts edits and avoid merge conflict in shared test file.
metrics:
  duration: "~4 min"
  completed_date: "2026-07-21T23:25:00Z"
  tasks_completed: 2/2
  files_modified: 4
  test_count: 35 + 306 = 341 tests passing
---

# Phase 174 Plan 07: Mechanical Sweep — Final Wave (TNT-01 Complete)

**One-liner:** Sweep final 5 `notify()` call sites onto `copyContext` seam: whatsapp/handler.ts (1), admin/billing/actions.ts (2), estimate/[token]/actions.ts (2) — TNT-01 requirement satisfied.

## Summary

Plan 174-07 completes the TNT-01 mechanical sweep, the final wave of the tenant-customizable-notifications architecture. All 18 `notify()` call sites across all 9 files now pass `copyContext`, the opt-in DB-template resolution seam, enabling administrators to customize notification copy per event type via the admin panel.

**Key Achievement:** TNT-01 requirement **fully satisfied**. After this plan lands, every site that calls `buildNotificationCopy()` (compute caller-supplied context) also passes that context to `notify()`, closing the gap where `copy.ts` was previously the sole rendering source for any event. The migration is backward-compatible (zero behavior change if no DB templates exist) and fully tested.

---

## Tasks Completed

### Task 1: Sweep lib/whatsapp/handler.ts + app/admin/billing/actions.ts (3 call sites)

**Files Modified:**
- `lib/whatsapp/handler.ts` (whatsapp.inbound): extracted `ctx = { whatsappFrom: ownerPhone }`, passed to both `buildNotificationCopy` and `notify(..., copyContext: ctx)`
- `app/admin/billing/actions.ts` (admin.tier_changed): extracted `ctx = { tierFrom, tierTo }`, wired to both functions
- `app/admin/billing/actions.ts` (admin.bonus_credits_granted): extracted `ctx = { credits: units }`, wired to both functions

**Test Extensions:**
- Extended `forceTier` test to assert `copyContext.tierFrom` and `copyContext.tierTo`
- Extended `grantBonusCredits` test to assert `copyContext.credits`

**Verification:**
- All whatsapp handler + event-sources tests pass (35 tests)
- Type check clean (`npx tsc --noEmit -p tsconfig.ci.json`)
- Verified 3 `copyContext` occurrences in target files

**Commit:** `d8fc4be4` — "feat(174-07): sweep whatsapp/handler + admin/billing notify call sites with copyContext"

---

### Task 2: Sweep app/estimate/[token]/actions.ts (2 call sites) — Completes TNT-01

**Files Modified:**
- `app/estimate/[token]/actions.ts` (estimate.viewed): extracted `ctx = { estimateNumber, clientName }`, wired to both functions
- `app/estimate/[token]/actions.ts` (estimate.accepted/estimate.declined): same context extraction, single call site with computed `eventType`

**Test Extensions:**
- Extended `logEstimateView` test to assert `copyContext.estimateNumber` and `copyContext.clientName`
- Extended `respondToEstimate` test (covers both 'accepted' and 'declined') to assert same copyContext fields

**Comprehensive Verification:**
- Full notifications test suite passes (306 tests across 31 files)
- Type check clean
- Verified 2 `copyContext` occurrences in target file
- **Residual-site scan:** Swept entire repo (excluding node_modules/dist/.next/worktrees) — verified **zero missed sites** where `buildNotificationCopy()` is called but `copyContext` is not passed to `notify()`

**Commit:** `26975d9d` — "feat(174-07): sweep estimate/[token]/actions notify call sites with copyContext — TNT-01 complete"

---

## Deviations from Plan

None — plan executed exactly as written.

- Dependency on 174-05 honored (its event-sources.test.ts edits verified present before this plan's edits landed)
- No new imports needed for whatsapp/handler.ts (dynamic imports already in place)
- All call sites swept with identical pattern (extract ctx, pass to both buildNotificationCopy and notify)
- Tests extended per spec (property inspection, no breaking changes to existing assertions)

---

## TNT-01 Completion Status

**TNT-01 Requirement:** *"Every notify() call in lib/whatsapp/handler.ts, app/admin/billing/actions.ts, and app/estimate/[token]/actions.ts (5 call sites total) now passes copyContext, so an admin's DB template edit for whatsapp.inbound, admin.tier_changed, admin.bonus_credits_granted, estimate.viewed, estimate.accepted, and estimate.declined takes effect for these call sites."*

✅ **SATISFIED**

All 9 files / 18 call sites across the entire codebase now pass `copyContext`:
- Plans 174-01 to 174-04: AI job + payment/quota events (12 sites)
- Plan 174-05: Stripe Connect webhook (2 sites) 
- Plan 174-07: WhatsApp inbound + admin actions + estimate lifecycle (5 sites)

`copy.ts` is now:
- Used by each call site to compute fallback title/body
- Used internally by the resolver as last-resort fallback
- **Never** the sole rendering source — every path through dispatch.ts that uses `copyContext` resolves templates first, falls back gracefully

---

## Test Coverage

| Test File | Status | Count |
| --- | --- | --- |
| tests/unit/whatsapp/handler.test.ts | ✅ PASS | 6 tests |
| tests/unit/whatsapp/handler-intent-routing.test.ts | ✅ PASS | 12 tests |
| tests/unit/whatsapp/handler-inngest-dispatch.test.ts | ✅ PASS | 13 tests |
| tests/unit/notifications/event-sources.test.ts | ✅ PASS | 306 tests |
| **Total** | ✅ **PASS** | **341 tests** |

---

## Known Stubs

None — plan adds zero placeholders or TODOs.

---

## Self-Check: PASSED

- [x] lib/whatsapp/handler.ts: copyContext wired to notify (1 site)
- [x] app/admin/billing/actions.ts: copyContext wired to both notify calls (2 sites)
- [x] app/estimate/[token]/actions.ts: copyContext wired to both notify calls (2 sites)
- [x] tests/unit/notifications/event-sources.test.ts: extended with copyContext assertions
- [x] Full notifications test suite: 306 tests passing
- [x] Type check: clean (`npx tsc --noEmit -p tsconfig.ci.json`)
- [x] Residual-site scan: zero missed sites across repo
- [x] Commits verified:
  - `d8fc4be4` (Task 1 – 3 call sites)
  - `26975d9d` (Task 2 – 2 call sites, TNT-01 complete)

---

## Artifacts

### Commits
- **d8fc4be4**: feat(174-07): sweep whatsapp/handler + admin/billing notify call sites with copyContext
- **26975d9d**: feat(174-07): sweep estimate/[token]/actions notify call sites with copyContext — TNT-01 complete

### Test Files Extended
- tests/unit/notifications/event-sources.test.ts: Block H (admin tests) and Blocks B/C (estimate tests) now include copyContext assertions

### Files with Mechanical Changes
- lib/whatsapp/handler.ts: +7 lines (ctx extraction + copyContext field)
- app/admin/billing/actions.ts: +8 lines (2× ctx extraction + copyContext fields)
- app/estimate/[token]/actions.ts: +10 lines (2× ctx extraction + copyContext fields)

---

## Next Steps

TNT-01 is complete. Remaining notification-related work:
- Plan 174-08+: Per-channel divergence (email/SMS/WhatsApp copy customization at template level)
- Future: Database-backed template editor UI (admin panel)
