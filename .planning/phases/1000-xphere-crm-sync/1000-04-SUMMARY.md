---
phase: 1000
plan: 04
subsystem: xphere-crm-sync
tags: [inngest, integration, crm, lifecycle-hooks]
requires:
  - "EVENT_XPHERE_SYNC + XphereSyncRequestedPayload (lib/inngest/events.ts) — Plan 03"
  - "inngest client (lib/inngest/client.ts) — Plan 03"
  - "XphereSyncEvent (lib/integrations/xphere/types.ts) — Plan 01"
provides:
  - "dispatchXphereSync(companyId, event) fire-and-forget helper (lib/integrations/xphere/dispatch.ts)"
  - "5 lifecycle call sites enqueuing xphere/sync.requested"
affects:
  - "Plan 05 (backfill) — same event, but note-less 'company.updated' for re-run safety"
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget dispatch via void inngest.send(...).catch(() => undefined) — mirrors sendWelcomeEmail discipline"
    - "Churn mapping: subscription.deleted + trial.expired → 'Churned' (mapping.ts owns the tier/event→stage rule)"
key-files:
  created:
    - "lib/integrations/xphere/dispatch.ts"
  modified:
    - "lib/actions/company.ts"
    - "lib/actions/estimate.ts"
    - "app/api/webhooks/stripe/route.ts"
    - "app/api/cron/expire-trials/route.ts"
decisions:
  - "dispatchXphereSync returns void and is never awaited — user flows are unaffected by Xphere/Inngest availability"
  - "customer.subscription.deleted resolves companyId by stripe_subscription_id BEFORE the update clears it"
  - "company.ts holds 3 dispatch calls (both INSERT paths → company.created, the UPDATE path → company.updated)"
metrics:
  tasks: 2
  files_created: 1
  files_modified: 4
  duration_minutes: 4
  completed: 2026-06-21
---

# Phase 1000 Plan 04: Lifecycle Hooks Summary

A single fire-and-forget `dispatchXphereSync` helper plus 5 lifecycle call-site insertions that make the mirror live — every meaningful Xtimator state change now enqueues `xphere/sync.requested` without ever blocking a user-facing flow.

## What Shipped

### Task 1 — `dispatchXphereSync` helper
- `lib/integrations/xphere/dispatch.ts` (`import 'server-only'`): wraps `inngest.send({ name: EVENT_XPHERE_SYNC, data: { companyId, event, occurredAt } })` with `.catch(() => undefined)` and returns `void` — same discipline as `sendWelcomeEmail`.
- Commit: `76aae69`

### Task 2 — Wire the 5 lifecycle sites
- `lib/actions/company.ts`: `company.created` on both INSERT paths (mode 'add' + mode 'first'), `company.updated` on the UPDATE path.
- `lib/actions/estimate.ts`: `estimate.created` in `createBlankEstimate` (after the activity insert), `estimate.sent` in `markEstimateSent`.
- `app/api/webhooks/stripe/route.ts`: `subscription.updated` in both `checkout.session.completed` and `customer.subscription.deleted` (companyId resolved by `stripe_subscription_id` before the update clears it).
- `app/api/cron/expire-trials/route.ts`: `trial.expired` per expired company row.
- Commit: `5f72875`

## Verification

- Grep gates: 4 `dispatchXphereSync` occurrences in company.ts (1 import + 3 calls); `estimate.created` + `estimate.sent` in estimate.ts; `subscription.updated` in stripe route; `trial.expired` in expire-trials. All pass.
- No `await dispatchXphereSync` anywhere (returns void).
- `npx tsc --noEmit`: zero errors in any file changed by this plan (the ~10 pre-existing Langfuse/test-fixture errors are untouched — see deferred-items.md).

## Deviations from Plan

None — implemented as specified.

## Self-Check: PASSED

- File `lib/integrations/xphere/dispatch.ts` FOUND; 4 call-site files modified.
- Commits `76aae69`, `5f72875` both FOUND.
