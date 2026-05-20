---
phase: 77-notifications-system
plan: 02
subsystem: notifications
tags: [dispatch, preferences, inngest, tdd-green, fan-out]
requires: [77-01, lib/inngest/client, lib/supabase/service]
provides:
  - notify() — single fan-out entry point for all 17 event types
  - resolveChannels() — preference-aware channel resolver
  - getUserPreferences() / upsertUserPreferences() service helpers
  - notification/email.queued Inngest event contract
affects: [lib/inngest/events.ts]
tech-stack:
  added: []
  patterns: [best-effort dispatch (audit-log.ts), Inngest typed event payloads, override-wins-on-top]
key-files:
  created:
    - lib/notifications/dispatch.ts
    - lib/notifications/preferences.ts
  modified:
    - lib/inngest/events.ts
decisions:
  - resolveChannels takes (eventType, userId, override) per RED test contract — diverges from plan's (eventType, prefs, override). Implementation loads userPrefs internally; cleaner ergonomics, single round-trip.
  - Override params applied a second time inside notify() over the resolveChannels result. Defense-in-depth — guarantees deterministic behavior even when callers stub resolveChannels, and matches the test expectation that channels.email=true ALWAYS queues email regardless of stored prefs.
  - Idempotency window is 24h (hardcoded). Match across (company_id, metadata.dedupe_key, created_at >= now-24h). Future plans may parameterize.
  - email channel queues 'notification/email.queued' (NOT 'email.requested' as 77-01 SUMMARY handoff suggested) — 77-06 will consume by that name.
  - Append-only edit to lib/inngest/events.ts to preserve existing Phase 67 event constants (no overwrite).
metrics:
  duration_minutes: 6
  tasks_completed: 3
  files_created: 2
  files_modified: 1
  commits: 1
  completed_date: 2026-05-20
requirements: [NOTIF-03, NOTIF-12]
---

# Phase 77 Plan 02: notify() Dispatch + Preferences Resolver Summary

**One-liner:** Ships `notify()` best-effort fan-out helper + `resolveChannels()` preference resolver — turns all 13 RED tests from 77-01 GREEN, gives every event source one function to call.

## Tasks Executed

| Task | Name                                         | Commit    | Files                                                                                       |
| ---- | -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| 1    | preferences.ts: resolveChannels + helpers    | `5cd2cda` | `lib/notifications/preferences.ts`                                                          |
| 2    | dispatch.ts + Inngest event type             | `5cd2cda` | `lib/notifications/dispatch.ts`, `lib/inngest/events.ts`                                    |
| 3    | Commit GREEN dispatch layer                  | `5cd2cda` | (combined commit per CLAUDE.md `--no-verify` instruction)                                   |

(Tasks 1 + 2 + 3 collapsed into one feature commit; per-task split would have been three near-empty commits since Task 3 was the commit itself.)

## notify() Contract

```ts
notify({
  companyId: string
  userId?: string | null              // null → company-wide row visible to all members
  eventType: EventType                // one of 17 from event-types.ts
  title: string
  body: string
  linkUrl?: string                    // relative app path on click
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>  // may include `dedupe_key` for idempotency
  pinned?: boolean
  expiresAt?: Date | null
  channels?: { inApp?: boolean; email?: boolean }  // wins over user prefs
}): Promise<{ ok: boolean; notificationId?: string; skipped?: 'dedupe' | 'channel_disabled' | 'no_op' }>
```

**Execution pipeline:**
1. `resolveChannels(eventType, userId, override)` → `{ inApp, email }`
2. Apply `params.channels` a second time over result (override always wins)
3. Both false → return `{ ok: true, skipped: 'channel_disabled' }` (no DB hit)
4. `metadata.dedupe_key` present → check `notifications` for `(company_id, dedupe_key)` in last 24h → return existing id if found
5. `inApp` → insert into `notifications`, capture returned id
6. `email && userId` → `inngest.send({ name: 'notification/email.queued', data: {...} })`
7. Any failure → `console.warn` + `{ ok: false }` (NEVER throws)

## resolveChannels() Contract

```ts
resolveChannels(
  eventType: EventType,
  userId: string | null | undefined,
  override?: { inApp?: boolean; email?: boolean },
): Promise<{ inApp: boolean; email: boolean }>
```

**Resolution order (highest precedence last):**
1. `DEFAULT_PREFERENCES[category]` (from event-types.ts)
2. `userPrefs.categories[category]` per-category JSONB override
3. `userPrefs.email_digest_enabled === false` → force `email = false`
4. `override` param — wins absolutely (used by force-send events e.g. `trial.expired`)

DB read failure → falls back to defaults (best-effort).

## Inngest Event Contract (for 77-06 consumption)

```ts
// lib/inngest/events.ts
export const EVENT_NOTIFICATION_EMAIL_QUEUED = 'notification/email.queued' as const

export type NotificationEmailQueuedPayload = {
  notificationId: string
  userId: string
  companyId: string
  eventType: string   // e.g. 'estimate.viewed'
  category: string    // e.g. 'estimate'
  title: string
  body: string
  linkUrl?: string
}
```

## Dedupe Semantics

- Caller passes `metadata.dedupe_key` (e.g. Stripe `event.id`, webhook idempotency key)
- Match: `company_id = $1 AND metadata @> { dedupe_key: $2 } AND created_at >= now() - interval '24h'`
- Hit → return `{ ok: true, notificationId: <existing>, skipped: 'dedupe' }` — no insert, no email queue
- Miss → proceeds to insert
- Window is fixed at 24h (sufficient for webhook retry windows; can parameterize later if needed)

## Best-Effort Guarantees

| Failure point          | Behavior                                          |
| ---------------------- | ------------------------------------------------- |
| `resolveChannels` DB read fails | Falls back to DEFAULT_PREFERENCES        |
| Dedupe lookup fails    | Treated as miss → proceeds to insert              |
| `notifications` insert fails  | `console.warn` + return `{ ok: false }`    |
| `inngest.send` fails   | `console.warn` + still returns `{ ok: true }` (in-app row already written) |
| Unexpected throw       | Top-level try/catch → `console.warn` + `{ ok: false }` |

**Invariant: `notify()` NEVER throws.** Verified by RED test "best-effort failure".

## Verification Results

| Check                                                  | Result                          |
| ------------------------------------------------------ | ------------------------------- |
| `npx vitest run tests/unit/notifications/`             | 13/13 GREEN (was 13 RED in 77-01) |
| `npx tsc --noEmit`                                     | Clean                            |
| `git log -1 --pretty=format:'%s'`                      | `feat(77-02): notify() dispatch helper + preferences resolver` |
| Grep `inngest.send.*notification/email`                | Found in `lib/notifications/dispatch.ts:117` |

## Deviations from Plan

### [Rule 1 - Bug] resolveChannels signature divergence from plan
- **Found during:** Task 1 — reading RED tests
- **Issue:** Plan specified `resolveChannels(eventType, userPrefs, override)` (sync, prefs preloaded). RED tests call `resolveChannels(eventType, userId, override)` (async, loads internally).
- **Fix:** Adopted the test contract — `resolveChannels` is async, takes `userId`, loads prefs internally via `getUserPreferences()`. Cleaner ergonomics for callers, single DB round-trip per dispatch.
- **Files modified:** `lib/notifications/preferences.ts`
- **Commit:** `5cd2cda`

### [Rule 1 - Bug] Override re-applied inside notify()
- **Found during:** Task 2 — first test run revealed 2 failing cases
- **Issue:** Tests stub `resolveChannels` with a fixed `{inApp:true, email:false}` return, so the `channels.email=true` override would be lost if dispatch trusted resolveChannels alone. Test "channels.inApp=false → no insert" and "channels.email=true → inngest queued" both failed.
- **Fix:** In `notify()`, after calling `resolveChannels(...)`, re-apply `params.channels` on top. Override params always win — defense-in-depth.
- **Files modified:** `lib/notifications/dispatch.ts`
- **Commit:** `5cd2cda`

### [Process deviation] Combined commit instead of three per-task commits
- **Reason:** Plan instructed explicitly to "Commit with `git commit --no-verify`" and the executor objective said "Run INLINE". Tasks 1+2 produce code that has no functional value without each other (preferences.ts is consumed by dispatch.ts in the same test run), and Task 3 was the commit step itself. Three separate commits would have created an intermediate state where tests pass partially. Single feature commit preserves bisectability of the GREEN state.

### [Naming] Inngest event name kept as `notification/email.queued`
- **Found during:** Task 2
- **Issue:** 77-01 SUMMARY "Handoff" section referenced `notification/email.requested`; plan's `<interfaces>` block uses `notification/email.queued`.
- **Fix:** Used the plan's name (`queued`). 77-06 must consume the same constant — exported as `EVENT_NOTIFICATION_EMAIL_QUEUED`.

## Known Stubs

None. Both modules are fully implemented; `inngest.send` is real (not stubbed in production code — only mocked in tests). Email handler (77-06) is the downstream consumer and out of scope.

## Handoff to 77-03

Plan 77-03 instruments 17 event sources at their call sites. Each should:

```ts
import { notify } from '@/lib/notifications/dispatch'

await notify({
  companyId,
  userId,                              // null for company-wide events
  eventType: 'estimate.viewed',         // EventType union from lib/notifications/event-types
  title: 'Estimate viewed',
  body: `${customerName} viewed your estimate`,
  linkUrl: `/estimates/${estimateId}`,
  resourceType: 'estimate',
  resourceId: estimateId,
  metadata: { dedupe_key: `view_${estimateId}_${hourBucket}` }, // optional, for hot paths
})
```

**No await chaining required** — `notify()` is fire-and-forget safe. Failures don't bubble.

**For force-send events** (e.g. `trial.expired`): pass `channels: { inApp: true, email: true }` to bypass user prefs.

## Handoff to 77-06

Wire an Inngest function listening on `EVENT_NOTIFICATION_EMAIL_QUEUED`:

```ts
import { EVENT_NOTIFICATION_EMAIL_QUEUED, type NotificationEmailQueuedPayload } from '@/lib/inngest/events'

inngest.createFunction(
  { id: 'notification-email-digest', name: 'Send notification email (digest)' },
  { event: EVENT_NOTIFICATION_EMAIL_QUEUED },
  async ({ event, step }) => {
    const data = event.data as NotificationEmailQueuedPayload
    // group by user+category, send branded Resend email
  }
)
```

Payload fields are stable and documented in `lib/inngest/events.ts`.

## Requirements Status

| ID        | Description                                                         | Status                          |
| --------- | ------------------------------------------------------------------- | ------------------------------- |
| NOTIF-03  | `notify()` single dispatch entry point with best-effort + dedupe    | Complete                        |
| NOTIF-12  | ≥20 unit test cases for dispatch + preferences                      | Partial (13/20 now GREEN; remaining 7+ added by later plans for bell, page, email digest) |

## Self-Check: PASSED

- FOUND: `lib/notifications/dispatch.ts`
- FOUND: `lib/notifications/preferences.ts`
- FOUND: `lib/inngest/events.ts` (modified — `EVENT_NOTIFICATION_EMAIL_QUEUED` exported)
- FOUND commit: `5cd2cda` (`feat(77-02): notify() dispatch helper + preferences resolver`)
- TEST: 13/13 GREEN at `tests/unit/notifications/`
- TYPECHECK: `npx tsc --noEmit` clean
