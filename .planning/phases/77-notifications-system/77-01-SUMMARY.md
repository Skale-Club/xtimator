---
phase: 77-notifications-system
plan: 01
subsystem: notifications
tags: [database, migration, types, tdd, foundation]
requires: [companies, auth.users]
provides:
  - public.notifications table (RLS + 6 indexes)
  - public.notification_preferences table (RLS + JSONB categories)
  - EventType union (17 events) + EventCategory (8) + DEFAULT_PREFERENCES
  - Wave-0 RED tests for dispatch + preferences resolution
affects: [types/database.types.ts]
tech-stack:
  added: []
  patterns: [best-effort dispatch (audit-log.ts), session-pool migration script (5432)]
key-files:
  created:
    - supabase/migrations/20260520000002_notifications_system.sql
    - scripts/apply-migration-77-01.mjs
    - lib/notifications/event-types.ts
    - tests/unit/notifications/dispatch.test.ts
    - tests/unit/notifications/preferences.test.ts
  modified:
    - types/database.types.ts
decisions:
  - Service-role-only writes via absence of INSERT/UPDATE/DELETE policies (matches plan)
  - Migration apply via direct pg client on :5432 (avoids :6543 transaction-pool prepared-stmt bug)
  - RED tests committed first per TDD wave-0 protocol (turned GREEN in 77-02)
  - types file kept at existing path `types/database.types.ts` (plan said `lib/types/` — adapted to actual repo layout)
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_created: 5
  files_modified: 1
  commits: 3
  completed_date: 2026-05-20
requirements: [NOTIF-01, NOTIF-02, NOTIF-12]
---

# Phase 77 Plan 01: Notifications DB Foundation Summary

**One-liner:** Provisions `notifications` + `notification_preferences` tables (RLS, indexes), regenerates Supabase types, ships the 17-event EventType catalog, and commits Wave-0 RED tests that 77-02 will turn GREEN.

## Tasks Executed

| Task | Name                                          | Commit    | Files                                                                                                                |
| ---- | --------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Migration SQL + apply script (+ live apply)   | `83d75d9` | `supabase/migrations/20260520000002_notifications_system.sql`, `scripts/apply-migration-77-01.mjs`                   |
| 2    | Regen Supabase types + EventType catalog      | `342cdce` | `types/database.types.ts`, `lib/notifications/event-types.ts`                                                        |
| 3    | RED tests for dispatch + preferences          | `9101b31` | `tests/unit/notifications/dispatch.test.ts`, `tests/unit/notifications/preferences.test.ts`                          |

## Migration Schema

### `public.notifications`
- `id UUID PK`, `company_id UUID FK companies ON DELETE CASCADE NOT NULL`
- `user_id UUID FK auth.users ON DELETE CASCADE NULL` (NULL = company-wide)
- `event_type TEXT NOT NULL`, `title TEXT NOT NULL`, `body TEXT NOT NULL`
- `link_url`, `resource_type`, `resource_id` (all TEXT, NULL)
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb` (dedupe_key lives here)
- `read_at TIMESTAMPTZ NULL`, `pinned BOOLEAN NOT NULL DEFAULT false`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `expires_at TIMESTAMPTZ NULL`

**Indexes (6):**
- `(company_id, user_id, created_at DESC)` — bell/feed primary lookup
- `(company_id, created_at DESC)` — company-wide feed
- `(company_id, user_id) WHERE read_at IS NULL` — unread badge
- `(event_type, created_at DESC)` — filter by event
- `(resource_type, resource_id)` — link back to source resource
- `(created_at) WHERE pinned = false` — cleanup cron scan

**RLS:**
- `notifications_select_own_company` (SELECT): `company_id = jwt.company_id AND (user_id IS NULL OR user_id = auth.uid())`
- No INSERT/UPDATE/DELETE policies → blocks anon/authenticated; service-role only

### `public.notification_preferences`
- `user_id UUID PK FK auth.users ON DELETE CASCADE`
- `categories JSONB NOT NULL DEFAULT '{}'::jsonb` — shape: `{ [EventCategory]: { in_app, email } }`
- `push_subscription JSONB NULL`
- `email_digest_enabled BOOLEAN NOT NULL DEFAULT true`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

**RLS (3 policies):** SELECT/INSERT/UPDATE all scoped to `user_id = auth.uid()`. No DELETE policy (cascade only on user deletion).

## EventType Catalog

```typescript
// lib/notifications/event-types.ts
export type EventCategory =
  | 'estimate' | 'payment' | 'trial' | 'quota'
  | 'whatsapp' | 'ai_job' | 'admin' | 'system'

export type EventType =
  // estimate (4): viewed, accepted, declined, expired
  // payment (2):  received, refunded
  // trial (3):    expiring_3d, expired, converted
  // quota (2):    80pct, exhausted
  // whatsapp (1): inbound
  // ai_job (2):   failed, completed
  // admin (2):    tier_changed, bonus_credits_granted
  // system (1):   maintenance
```

Total: **17 EventTypes** mapped to **8 EventCategories** via `EVENT_CATEGORIES`. `getCategoryForEvent(eventType)` helper exported.

**`DEFAULT_PREFERENCES`** rationale:
- `ai_job`: `{ in_app: false, email: false }` — opt-in (noisy)
- `whatsapp`: `{ in_app: true, email: false }` — avoid email spam for chat events
- All others: `{ in_app: true, email: true }`

## RED Tests Seeded

| File                                            | Cases | Status                                                                       |
| ----------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `tests/unit/notifications/dispatch.test.ts`     | 7     | RED — `Failed to resolve import "@/lib/notifications/dispatch"`              |
| `tests/unit/notifications/preferences.test.ts`  | 6     | RED — `Failed to resolve import "@/lib/notifications/preferences"`           |
| **Total**                                       | **13**| Counts toward NOTIF-12 (≥20 unit cases overall across the phase)             |

**Confirmation of RED state:** `npx vitest run tests/unit/notifications/` exits non-zero with both files failing at the import-analysis stage (modules don't exist yet). This is the expected Wave-0 handoff.

### dispatch.test.ts coverage
1. Happy path → `{ ok: true, notificationId }`
2. DB failure → `{ ok: false }` + `console.warn` (does NOT throw)
3. `channels.inApp=false` → no insert
4. `metadata.dedupe_key` match in last 24h → skip insert, return existing id
5. `channels.email=true` → `inngest.send()` called
6. `userId=null` → company-wide row (insert receives `user_id: null`)
7. No `channels` override → defers to `resolveChannels()`

### preferences.test.ts coverage
1. Returns `{ inApp, email }` shape
2. No prefs row → `DEFAULT_PREFERENCES` (estimate → both true)
3. `prefs.categories` per-category override applied
4. `channels` param wins over stored prefs
5. `ai_job` default `{ in_app: false, email: false }`
6. `email_digest_enabled=false` disables email even if category enables it

## Verification Results

| Check                                              | Result |
| -------------------------------------------------- | ------ |
| `node scripts/apply-migration-77-01.mjs`           | OK — both tables verified, 4 RLS policies present |
| `supabase_migrations.schema_migrations` row added  | OK — `20260520000002` recorded |
| `npx tsc --noEmit`                                 | OK — clean |
| `npx vitest run tests/unit/notifications/`         | RED (expected) — module resolution fails |
| `git log -1 --grep '77-01'`                        | OK — 3 commits land on main |

## Deviations from Plan

### [Rule 3 - Blocking issue] Adapted types file path
- **Found during:** Task 2
- **Issue:** Plan referenced `lib/types/database.types.ts`; repo actually uses `types/database.types.ts` (no `lib/types/` directory exists)
- **Fix:** Regenerated into existing path; `@/types/database.types` alias unchanged
- **Files modified:** `types/database.types.ts`
- **Commit:** `342cdce`

### [Rule 3 - Blocking issue] Stripped CLI banner from generated types
- **Found during:** Task 2
- **Issue:** `supabase gen types typescript` emitted "A new version of Supabase CLI is available" banner to stdout, corrupting the .ts file with two non-TS trailing lines → `tsc` errors TS1434/TS1005
- **Fix:** Truncated file to the last valid `} as const` line (line 1379) before commit
- **Files modified:** `types/database.types.ts`
- **Commit:** `342cdce`

### [Process deviation] Three commits instead of one
- **Reason:** Plan's Task 4 specified a single combined commit; executor split per task per GSD convention for traceability and easier reverts. No content difference — all artifacts land.

## Known Stubs

None. `lib/notifications/event-types.ts` exports concrete values; tests intentionally reference unimplemented modules (`dispatch.ts`, `preferences.ts`) — these are NOT stubs but the RED side of TDD, scheduled for plan 77-02.

## Handoff to 77-02

Plan 77-02 must create:
1. `lib/notifications/dispatch.ts` exporting `notify(args)` matching the type tested:
   - Reads `notification_preferences` via service client
   - Calls `resolveChannels(eventType, userId, channelsOverride?)` to determine fan-out
   - Inserts into `notifications` when `inApp` (skipping when `metadata.dedupe_key` matches recent row)
   - Calls `inngest.send({ name: 'notification/email.requested', data: {...} })` when `email`
   - Returns `{ ok: true, notificationId }` or `{ ok: false }` (best-effort; `console.warn` on failure, never throws)
2. `lib/notifications/preferences.ts` exporting:
   - `resolveChannels(eventType: EventType, userId: string, override?: { inApp?: boolean; email?: boolean }): Promise<{ inApp: boolean; email: boolean }>`
   - Loads user's `notification_preferences` row; falls back to `DEFAULT_PREFERENCES[category]`
   - Applies override last; respects `email_digest_enabled=false` gate

After 77-02, both RED test files should pass with **13 GREEN cases**.

## Requirements Status

| ID        | Description                                                            | Status     |
| --------- | ---------------------------------------------------------------------- | ---------- |
| NOTIF-01  | `notifications` table with RLS + indexes                               | Complete   |
| NOTIF-02  | `notification_preferences` table with RLS                              | Complete   |
| NOTIF-12  | ≥20 unit test cases for dispatch + preferences                         | Partial (13/20 seeded as RED) |

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260520000002_notifications_system.sql`
- FOUND: `scripts/apply-migration-77-01.mjs`
- FOUND: `lib/notifications/event-types.ts`
- FOUND: `tests/unit/notifications/dispatch.test.ts`
- FOUND: `tests/unit/notifications/preferences.test.ts`
- FOUND: `types/database.types.ts` (modified)
- FOUND commit: `83d75d9` (Task 1)
- FOUND commit: `342cdce` (Task 2)
- FOUND commit: `9101b31` (Task 3)
- DB verified: both tables exist with RLS enabled and 4 policies
