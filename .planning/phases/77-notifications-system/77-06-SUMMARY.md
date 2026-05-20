---
phase: 77-notifications-system
plan: 06
subsystem: notifications
tags: [inngest, cron, email, resend, cleanup, digest]
requires:
  - 77-02 (dispatch + notification/email.queued event)
  - 77-03 (event sources emit notifications)
provides:
  - lib/email/notification-emails.ts (sendNotificationDigestEmail)
  - lib/inngest/functions/notification-email-digest.ts (event + cron)
  - lib/inngest/functions/notification-cleanup.ts (daily cron + runNotificationCleanup helper)
affects:
  - app/api/inngest/route.ts (both fns registered in serve handler)
  - lib/inngest/functions/index.ts (barrel re-exports)
tech-stack:
  added: []
  patterns:
    - "Inngest function with two triggers (event + cron) in options.triggers array"
    - "Best-effort email send mirroring lib/email/payment-emails.ts"
    - "Pure helper extracted from Inngest fn for unit-testability (runNotificationCleanup)"
    - "metadata JSONB patch for delivery tracking (no schema change)"
key-files:
  created:
    - lib/email/notification-emails.ts
    - lib/inngest/functions/notification-email-digest.ts
    - lib/inngest/functions/notification-cleanup.ts
    - tests/unit/notifications/email-digest.test.ts
    - tests/unit/notifications/cleanup-cron.test.ts
  modified:
    - lib/inngest/functions/index.ts
    - app/api/inngest/route.ts
decisions:
  - "Use metadata.email_sent_at JSONB patch (per-row merge) instead of a separate notification_email_log table — keeps schema small; trade-off is full table scan on the filter, mitigated by the 15-min created_at window"
  - "Single Inngest function with two triggers (event + cron) rather than two functions — keeps grouping logic in one place; cron sweeps anything the event path missed"
  - "Pure helper runNotificationCleanup exported from notification-cleanup.ts — testable without Inngest harness"
  - "Brand color/logo flow through DigestEmailContext as primitives — keeps the email module decoupled from the Branding type"
metrics:
  duration_min: ~25
  completed_date: 2026-05-20
  tasks_completed: 3
  files_changed: 7
  lines_added: ~530
---

# Phase 77 Plan 06: Email digest + auto-cleanup Inngest functions

## One-liner

Inngest scheduled functions that batch-deliver notification emails (every 15 min, grouped when >3 events per user+category) and auto-purge stale rows (daily 03:00 UTC, 60-day TTL respecting pinned + expires_at).

## What shipped

### `lib/email/notification-emails.ts`
- `sendNotificationDigestEmail(ctx)` — best-effort branded HTML+text email via Resend.
- Subject: single-item → item title; multi-item → `"N new notifications"`.
- Body: branded header (logo on a brand-color bar) + optional category-grouped sections (`groupedByCategory: true`).
- Skips silently when Resend key absent or `items.length === 0`. Catches and logs all errors — **never throws** (matches `lib/email/payment-emails.ts` precedent).

### `lib/inngest/functions/notification-email-digest.ts`
- Two triggers in one function: `notification/email.queued` (event) + `*/15 * * * *` (cron).
- Fetches all rows in `notifications` where `created_at >= now() - 15min`, `user_id IS NOT NULL`, and `metadata->>email_sent_at IS NULL`.
- Groups by `(user_id, category)`. If a group has `> 3` items → grouped digest; else one-off-style render (single template path, just different `groupedByCategory` flag).
- Per-row metadata merge writes `email_sent_at` back without clobbering `dedupe_key` or other extras.
- Idempotency key: `event.data.notificationId` — duplicate Inngest deliveries don't double-send.

### `lib/inngest/functions/notification-cleanup.ts`
- Daily `0 3 * * *` cron.
- Pure helper `runNotificationCleanup(svc)` does the SQL — exported for unit tests.
- DELETE WHERE `created_at < now() - 60 days AND pinned = false AND (expires_at IS NULL OR expires_at < now())`.
- Returns `{deleted, error?}` — never throws.

### Registration
- Both functions exported from `lib/inngest/functions/index.ts`.
- Both added to the `serve({functions: [...]})` array in `app/api/inngest/route.ts`.

## Cron schedules + Inngest function IDs

| ID                          | Triggers                                                  |
| --------------------------- | --------------------------------------------------------- |
| `notification-email-digest` | event `notification/email.queued` + cron `*/15 * * * *`   |
| `notification-cleanup`      | cron `0 3 * * *` (daily 03:00 UTC)                        |

## email_sent_at tracking

No schema change. Each notification row's `metadata` JSONB gets `email_sent_at: <iso>` patched in after a successful send. The cron query filters on `metadata->>email_sent_at IS NULL` to find unsent items. Per-row merge (fetch existing metadata + spread + write) preserves `dedupe_key` and any future metadata extras.

## Cleanup semantics

- **Pinned rows survive forever** — `pinned = false` filter excludes them.
- **Future-expires rows survive** — `expires_at IS NULL OR expires_at < now()` keeps rows whose `expires_at` is still in the future.
- **60-day cutoff** — `created_at < now() - 60d`.
- **Daily run only** — losing a single day of cleanup if the run errors is non-fatal; next day will re-process.

## Test coverage

| File                                              | Cases | Notes                                                                 |
| ------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| `tests/unit/notifications/email-digest.test.ts`   | 5     | no-key / no-items / single subject / grouped subject + body / error swallow |
| `tests/unit/notifications/cleanup-cron.test.ts`   | 4     | happy delete / empty / DB error / 60-day cutoff drift                 |

All 51 tests in `tests/unit/notifications/` pass; `npx tsc --noEmit` clean.

## Deviations from Plan

### Rule 3 — Blocking issue
**Plan sketch used the 3-arg `inngest.createFunction(opts, [triggers], handler)` signature, but the installed Inngest version expects 2 args with `triggers` inside the options object.**
- **Found during:** Task 2 — tsc errored with `TS2554: Expected 2 arguments, but got 3`.
- **Fix:** Moved `triggers` array inside the options object for both functions (matches existing pattern in `generate-estimate.ts`).
- **Files modified:** `notification-email-digest.ts`, `notification-cleanup.ts`.

### Rule 3 — Blocking issue (tests)
**The plan's test stub used `vi.fn().mockImplementation(() => ({...}))` for the Resend class, which Vitest rejected with "not a constructor".**
- **Fix:** Switched to a plain `function MockResend()` declaration in the `vi.mock('resend', ...)` factory. Also hoisted `sendMock` via `vi.hoisted()` so it's available inside the hoisted mock factory.
- **Files modified:** `tests/unit/notifications/email-digest.test.ts`.

No architectural changes; no auth gates encountered.

## Handoff to 77-07

77-07 wires `/settings/(tabs)/notifications` to per-category toggles (toggle keys map to `EVENT_CATEGORIES` in `lib/notifications/event-types.ts`), adds the Web Push permission scaffold (`Notification.requestPermission()` + `/sw.js` registration storing `pushSubscription` into `notification_preferences`), and folds E2E + i18n + closeout. The digest path built here will already respect any new `notification_preferences` toggles because the dispatcher (77-02) consults `resolveChannels()` before queuing `notification/email.queued`.

## Self-Check: PASSED

- lib/email/notification-emails.ts — FOUND
- lib/inngest/functions/notification-email-digest.ts — FOUND
- lib/inngest/functions/notification-cleanup.ts — FOUND
- tests/unit/notifications/email-digest.test.ts — FOUND
- tests/unit/notifications/cleanup-cron.test.ts — FOUND
- Commit 3247721 — FOUND
- Commit db32548 — FOUND
- Commit ea79935 — FOUND
