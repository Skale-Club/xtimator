---
phase: 104-notification-channels-preferences
plan: 01
subsystem: notifications
tags: [notifications, preferences, jsonb, supabase-migration, zod, react, tcpa]

# Dependency graph
requires:
  - phase: 104-00
    provides: Wave-0 RED/EXTEND test scaffold (event-types, category-migration, preferences, preferences-form contracts)
  - phase: 77-notifications-system
    provides: notification_preferences JSONB schema, resolveChannels resolver, in-app + email senders, prefs form + feed filters
provides:
  - Reduced EventCategory (estimate | billing | system | _dropped); every event remaps to a deliverable category or the no-deliver sentinel
  - 4-channel per-category model (in_app, email, whatsapp, sms) across DEFAULT_PREFERENCES, resolver, API, and UI
  - Pure migrateCategories() (OR-merge payment/trial/quota/admin -> billing; drop whatsapp/ai_job; idempotent) + mirrored idempotent JSONB migration SQL
  - 3-category x 4-channel preferences form with WhatsApp/SMS columns rendered-but-disabled (pending Wave 2)
  - Paid-channel consent gate in resolveChannels (whatsapp/sms stay false without recorded opt-in -- TCPA defense)
affects: [104-02, 104-03, dispatch, whatsapp-sender, sms-sender, owner-phone, admin-whatsapp-templates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal _dropped sentinel category: keep EventType union + call sites intact; dropped events resolve to no enabled channels"
    - "Pure-fn + mirrored-SQL migration: unit-testable migrateCategories() is the source of truth the idempotent UPDATE mirrors"
    - "Partial<Record<EventCategory, ...>> + ?? fallback for reduced category maps so legacy/_dropped feed rows never crash"
    - "Paid-channel opt-in gate: per-category toggle is necessary but not sufficient; explicit consent timestamp required before WhatsApp/SMS"

key-files:
  created:
    - lib/notifications/category-migration.ts
    - supabase/migrations/20260621000001_notification_categories_remap.sql
  modified:
    - lib/notifications/event-types.ts
    - lib/notifications/preferences.ts
    - app/api/notifications/preferences/route.ts
    - components/settings/notifications-form.tsx
    - components/notifications/category-icon.tsx
    - components/notifications/NotificationFilters.tsx
    - components/notifications/NotificationList.tsx

key-decisions:
  - "Option A (_dropped sentinel) over removing notify() call sites -- minimal churn, no blast radius on AI-job/inbound code"
  - "Migration SQL uses boolean OR (not COALESCE-first-non-null) so a false from one billing source never shadows a true from another -- exact mirror of the pure OR-merge"
  - "TCPA/consent gate implemented in Wave 1 (resolveChannels forces whatsapp/sms false without opt-in timestamp) to satisfy the Wave-0 TCPA contract; the verified-phone gate + senders land in Wave 2"
  - "verifiedPhone prop (not phoneOnFile/whatsappOptIn trio) drives the disabled WhatsApp/SMS switches -- matches the Wave-0 form test contract"

patterns-established:
  - "Reduced category maps are Partial + ?? Wrench/?? cat fallbacks everywhere they are indexed"
  - "Email digest tolerates literal billing/_dropped categories with no code change (string-typed category + ?? fallback)"

requirements-completed: [NOTIF-01, NOTIF-02, NOTIF-06]

# Metrics
duration: 12min
completed: 2026-06-22
---

# Phase 104 Plan 01: Categories + 4-Channel Matrix + Migration Summary

**Collapsed the notification model from 8 categories x 2 channels to 3 categories (Estimates, Billing, System) + a _dropped sentinel x 4 channels (In-App, Email, WhatsApp, SMS), shipped the idempotent JSONB remap migration mirrored by a unit-tested pure fn, and rebuilt the preferences form + feed icons/filters for the 3x4 model with WhatsApp/SMS disabled pending Wave 2.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-22T01:54:49Z
- **Completed:** 2026-06-22T02:06:37Z
- **Tasks:** 2
- **Files modified:** 9 (2 created, 7 modified) + 3 test files repointed

## Accomplishments
- `EventCategory` reduced to `estimate | billing | system | _dropped`; full `EventType` union and every `notify()` call site preserved (dropped events resolve to no deliverable channel)
- `DEFAULT_PREFERENCES` widened to 4 channels with whatsapp/sms defaulting **false** everywhere (never auto-enable a paid channel)
- Pure `migrateCategories()` (OR-merge payment/trial/quota/admin -> billing, drop whatsapp/ai_job, idempotent, no paid-channel synthesis) + a SQL migration that mirrors it exactly (idempotent `WHERE categories ?| array[...]` guard)
- `resolveChannels()` now returns the 4-key `{ inApp, email, whatsapp, sms }` with a TCPA consent gate; unknown/dropped events resolve safely to `_dropped` no-deliver
- Preferences form renders 3 categories x 4 channels; WhatsApp + SMS switches render **disabled** with a "verify your phone" affordance until `verifiedPhone` is on file
- Feed icons/filters reduced to the 3 visible categories with graceful fallbacks for legacy/_dropped feed rows; email-digest grouping confirmed crash-free for the new category values (INFO-1)

## Task Commits

1. **Task 1: Reduce EventCategory to 3 + _dropped; pure migration fn + mirrored SQL** - `7765b3d` (feat)
2. **Task 2: 4-channel prefs API + 3x4 preferences form + feed icons/filters** - `33018c2` (feat)

_TDD note: sources already existed (brownfield refactor of Phase-77 modules), so each task is a single feat commit that turns the Wave-0 RED/EXTEND tests GREEN rather than a separate test->feat split._

## Files Created/Modified
- `lib/notifications/event-types.ts` - EventCategory 8->3+_dropped; EVENT_CATEGORIES remap; ChannelPrefs (4-channel); DEFAULT_PREFERENCES widened, whatsapp/sms false
- `lib/notifications/category-migration.ts` (NEW) - pure `migrateCategories()` the SQL mirrors
- `supabase/migrations/20260621000001_notification_categories_remap.sql` (NEW) - idempotent JSONB remap (boolean-OR merge into billing; drops legacy keys; no paid-channel synthesis)
- `lib/notifications/preferences.ts` - 4-key ResolvedChannels + UserPrefs opt-in timestamps + paid-channel consent gate + `_dropped` safe default for unknown events
- `app/api/notifications/preferences/route.ts` - ChannelSchema adds whatsapp/sms booleans
- `components/settings/notifications-form.tsx` - 3 category rows x 4 channel columns; verifiedPhone-gated disabled WhatsApp/SMS switches + affordance
- `components/notifications/category-icon.tsx` - MAP reduced to 3; ?? Wrench fallback
- `components/notifications/NotificationFilters.tsx` - CATEGORY_ICONS/LABELS/ORDER reduced to 3; fallbacks
- `components/notifications/NotificationList.tsx` - empty-state label fallback for non-visible categories (deviation, see below)

## Decisions Made
- **_dropped sentinel (Option A)** chosen over deleting AI-job/inbound `notify()` calls — minimal churn, call sites untouched.
- **Migration uses real boolean OR** (`COALESCE(...,false) OR COALESCE(...,false) ...`) rather than the research draft's `COALESCE(first-non-null)` so the SQL is a faithful mirror of the pure fn's OR-merge (a `false` source never shadows a `true` source).
- **TCPA consent gate landed in Wave 1** (resolveChannels forces whatsapp/sms false without an opt-in timestamp) to satisfy the Wave-0 TCPA test contract; the verified-phone gate + actual senders are Wave 2.
- **`verifiedPhone` prop** drives the disabled WhatsApp/SMS switches (matches the Wave-0 form contract), rather than the plan's tentative phoneOnFile/whatsappOptIn/smsOptIn trio.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Repointed stale Phase-77 tests that contradicted the reduced 3-category model**
- **Found during:** Task 2
- **Issue:** Three Phase-77 tests still asserted the obsolete 8-category model: `preferences-form.test.tsx` expected >=17 switches (8x2+master); `notifications-page.test.tsx` used the removed `payment` category for a chip-nav assertion (`filter-cat-payment` / `category=payment`) and an empty-state assertion (`No payments notifications yet`). After NOTIF-01 reduces categories, these no longer render and the tests fail.
- **Fix:** Updated the toggle-count assertion to the 3x4 model (>=13: 1 master + 12 channel switches; push is a Button) and repointed the `payment` references to the surviving `billing` category.
- **Files modified:** tests/unit/notifications/preferences-form.test.tsx, tests/unit/notifications/notifications-page.test.tsx
- **Verification:** Both files GREEN in `vitest run`.
- **Committed in:** 33018c2 (Task 2 commit)

**2. [Rule 3 - Blocking] NotificationList empty-state crash on now-Partial category label map**
- **Found during:** Task 2
- **Issue:** `NotificationList.emptyMessage()` called `CATEGORY_LABELS[category].toLowerCase()`. Reducing `CATEGORY_LABELS` to `Partial<Record<...>>` made the indexed value possibly-undefined (tsc error + potential runtime crash for a legacy category in the URL).
- **Fix:** Added `?? category` fallback so a legacy/unknown category string still renders.
- **Files modified:** components/notifications/NotificationList.tsx
- **Verification:** CI-scoped tsc clean; notifications-page tests GREEN.
- **Committed in:** 33018c2 (Task 2 commit)

**3. [Rule 3 - Blocking] Wave-0 test casts too narrow under the new precise types**
- **Found during:** Task 1
- **Issue:** Two Wave-0 casts (`DEFAULT_PREFERENCES as Record<string, Record<string, boolean>>` and `ResolvedChannels as Record<string, boolean>`) became "insufficiently overlapping" once the source types were made precise, producing tsc TS2352 errors in the test files.
- **Fix:** Relaxed both to `as unknown as Record<...>` (no assertion change; runtime behavior identical).
- **Files modified:** tests/unit/notifications/event-types.test.ts, tests/unit/notifications/preferences.test.ts
- **Verification:** Tests GREEN; runtime source tsc clean under tsconfig.ci.json.
- **Committed in:** 7765b3d (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three are direct, necessary consequences of the NOTIF-01 category reduction (stale-contract repointing + type-narrowing friction). No scope creep — no Wave-2/3 work touched.

## Issues Encountered
- A mid-execution `git stash`/`stash drop` (used to investigate which failing tests were pre-existing) discarded the uncommitted `preferences-form.test.tsx` toggle-count edit; re-applied it before committing Task 2. No committed work lost (the two Task-1 test files were already committed).

## Known Stubs
None. WhatsApp/SMS switches render **disabled by design** (driven by the `verifiedPhone` prop) — this is the intended Wave-1 state, not a stub; Wave 2 (104-02) wires the verified-phone gate, opt-in, and the actual senders.

## Self-Check: PASSED
All 9 created/modified runtime files verified present on disk; both task commits (`7765b3d`, `33018c2`) present in git history.

## Verification Result
`npx vitest run tests/unit/notifications` → **Test Files 3 failed | 10 passed (13); Tests 1 failed | 100 passed (101)**.
The 3 failing files are RED-by-design Wave-2/3 scaffolds (authored in 104-00), confirmed not regressions:
- `owner-phone.test.ts` (NOTIF-05, Wave 2 — `lib/notifications/owner-phone.ts` not yet created)
- `whatsapp-channel.test.ts` (NOTIF-03, Wave 2 — dispatch whatsapp branch not yet wired)
- `dispatch.test.ts` "4-channel routing + best-effort" case (NOTIF-07, Wave 2 — whatsapp/sms Inngest branches in `dispatch.ts` not yet added)
All Wave-1 cases (event-types, category-migration, preferences shape + TCPA gate, preferences-form 3x4, email-digest, notifications-page) are GREEN. gitleaks clean on both commits.

## User Setup Required
None for Wave 1. Applying the new migration (`20260621000001_notification_categories_remap.sql`) to the remote DB is operational/deferred (writing the file only this wave, per plan).

## Next Phase Readiness
- Wave 2 (104-02) can now wire: `lib/sms/client.ts`, the owner-phone resolver, the WhatsApp/SMS `notify()` branches, the verified-phone gate in `resolveChannels`, and pass a real `verifiedPhone` + opt-in into `NotificationsForm`.
- The 4-channel API/schema, defaults, migration, and disabled-by-default UI are all in place; whatsapp/sms remain hard-false until Wave 2 satisfies the phone + consent gate.

---
*Phase: 104-notification-channels-preferences*
*Completed: 2026-06-22*
