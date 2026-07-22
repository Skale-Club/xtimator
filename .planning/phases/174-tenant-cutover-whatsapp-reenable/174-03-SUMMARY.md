---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 03
subsystem: notifications
tags: [notifications, whatsapp, preferences, consent-gate, hsm-registry, tdd]

# Dependency graph
requires: []
provides:
  - "resolveChannels() (lib/notifications/preferences.ts) with the D-15 unconditional whatsapp=false override removed — the whatsapp_opt_in_at consent gate is now the sole gate on tenant WhatsApp beyond category preference + the override param"
  - "NotificationTemplate.expectedVariableCount: number (lib/notifications/whatsapp-registry.ts) — DB-approved rows read variables_schema.length (0 when unconfigured/null/non-array), static REGISTRY entries hardcode 2 to match titleBodyVars' own output"
affects: [174-04-tenant-cutover-whatsapp-reenable-dispatch-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consent-gate-first WhatsApp/SMS resolution: the paid-channel opt-in timestamp check now stands alone as the final gate (no downstream unconditional override), matching the SMS resolution pattern already in place"
    - "expectedVariableCount sourced defensively (Array.isArray(...) ? .length : 0) from a jsonb column with a '[]' DB default — never throws on null/malformed data"
    - "Read-only prod diagnostic via a throwaway scripts/*.mjs (mirrors scripts/check-admin.mjs pattern), run once via node --env-file=.env.local and deleted immediately after — never committed"

key-files:
  created: []
  modified:
    - lib/notifications/preferences.ts
    - tests/unit/notifications/preferences.test.ts
    - lib/notifications/whatsapp-registry.ts
    - tests/unit/notifications/whatsapp-registry.test.ts

key-decisions:
  - "D-15 override removed by clean deletion (not commented out) per the plan's stated preference, with a history breadcrumb added to resolveChannels' leading doc comment crediting Phase 142.1 as D-15's origin and this plan as its reversal — matches this file's existing dated-comment convention (e.g. the NOTIF-05 opt-in comment above it)"
  - "expectedVariableCount is honestly documented as a structural no-op for the 5 static REGISTRY entries (hardcoded to 2, matching titleBodyVars' fixed output) — real dormancy for those events comes from the opt-in consent gate + Meta's own approval gate, not from this field, per the plan's corrected VALIDATION narrative"
  - "Stale-opt-in check run read-only against the production DB (prmqgcrnpuvpzruyzvuv, the same project referenced by local .env.local) via a throwaway scripts/*.mjs deleted immediately after use — no mutation, nothing committed to the repo besides this SUMMARY's documentation of the result"

requirements-completed: [TNT-02, TNT-03]

# Metrics
duration: ~6min
completed: 2026-07-21
---

# Phase 174 Plan 03: D-15 WhatsApp Gate Lift + expectedVariableCount on the HSM Registry Summary

**Removed the Phase-142.1 D-15 unconditional `whatsapp = false` override from `resolveChannels()` so a genuinely opted-in tenant's category preference now reaches WhatsApp dispatch, and added `expectedVariableCount` to `NotificationTemplate` (sourced from `variables_schema.length` on DB-approved rows, hardcoded to 2 for the 5 static REGISTRY fallback entries) — the data Plan 174-04's runtime variable-count guard needs.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-21T22:53:00-04:00 (approx, first read)
- **Completed:** 2026-07-21T22:57:49-04:00
- **Tasks:** 2
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments
- `resolveChannels()` no longer forces `whatsapp = false` unconditionally after the consent gate — an opted-in tenant (`whatsapp_opt_in_at` set) with the `whatsapp` category toggle on now resolves `whatsapp: true`; a tenant without a recorded opt-in still resolves `whatsapp: false` regardless of the toggle, since the pre-existing consent gate is untouched
- The function's leading doc comment's "Resolution order" list is renumbered (6 steps → 5) with the stale D-15 step removed and a new history breadcrumb crediting Phase 142.1 as D-15's origin
- `NotificationTemplate` gained `expectedVariableCount: number`, doc-commented as the field Plan 174-04's send-time guard will read, and explicitly flagged as a no-op for the 5 static REGISTRY entries
- `getApprovedTemplateForEvent` now selects `variables_schema` alongside `template_name`/`language_code` and computes `expectedVariableCount` defensively (`Array.isArray(...) ? .length : 0`); all 3 static-fallback branches (no client, no approved row, throwing query) funnel through `getTemplateForEvent`, which now carries `expectedVariableCount: 2` from the REGISTRY update
- Stale-opt-in pre-flight check run read-only against production before committing the gate lift: **0** `notification_preferences` rows currently carry a non-null `whatsapp_opt_in_at` — see "Stale WhatsApp opt-ins" below
- 12 tests in `preferences.test.ts` (3 new) and 13 in `whatsapp-registry.test.ts` (7 new) all green — 25/25 total across both target files; downstream `dispatch.test.ts`/`whatsapp-channel.test.ts` (19 tests, out of this plan's scope) sanity-checked green too, confirming zero regression from either change
- `npx tsc --noEmit -p tsconfig.ci.json` clean

## Stale WhatsApp opt-ins

Per plan-checker FLAG 4, a read-only count was run against the production database (`prmqgcrnpuvpzruyzvuv.supabase.co`, the same project `.env.local` points at locally) **before** committing the D-15 gate-lift task:

```sql
-- equivalent of the query run via supabase-js .not('whatsapp_opt_in_at', 'is', null)
SELECT count(*) FROM notification_preferences WHERE whatsapp_opt_in_at IS NOT NULL;
```

**Result: 0 rows.**

No tenant currently carries a pre-existing `whatsapp_opt_in_at` timestamp, so lifting the D-15 gate has **zero immediate live-send effect** on any existing tenant today. This is a point-in-time fact, not a permanent guarantee: any tenant who opts in going forward (via the existing NOTIF-05 opt-in flow) will now have a real path to WhatsApp delivery, gated only by (a) their `whatsapp` category toggle and (b) a Meta-approved, correctly-`variables_schema`'d template existing for the event (Plan 174-04's guard, wired next). The check script (`scripts/__tmp-check-stale-whatsapp-optins.mjs`) was a throwaway diagnostic — run once, verified read-only (`.select(..., { count: 'exact', head: true })`, no write calls), and deleted immediately after; it was never committed to the repository.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lift the D-15 forced-off WhatsApp gate + check for stale pre-existing opt-ins** - `d44fae7b` (feat)
2. **Task 2: expectedVariableCount on NotificationTemplate (Pitfall 3 guard data)** - `5502eae5` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/notifications/preferences.ts` - removed the unconditional `whatsapp = false` line under the `// D-15:` comment inside `resolveChannels`; renumbered the leading doc comment's resolution-order list; added a history breadcrumb
- `tests/unit/notifications/preferences.test.ts` - new `describe('... D-15 lifted, opt-in reaches resolveChannels (TNT-03)')` block with 3 tests: opted-in + toggle-on → `whatsapp:true`; non-opted-in + toggle-on → `whatsapp:false`; no-prefs-row → `whatsapp:false`
- `lib/notifications/whatsapp-registry.ts` - `expectedVariableCount: number` added to `NotificationTemplate`; all 5 static `REGISTRY` entries hardcode `expectedVariableCount: 2`; `getApprovedTemplateForEvent` selects `variables_schema` and computes the count defensively
- `tests/unit/notifications/whatsapp-registry.test.ts` - new `describe('... expectedVariableCount (TNT-03 / Pitfall 3)')` block with 7 tests: 2-element schema → 2, empty schema → 0, null schema → 0 (never throws), and the 3 existing static-fallback branches (no row / no client / throwing query) → 2, plus `getTemplateForEvent`'s sync path → 2

## Decisions Made
- Clean removal (not comment-out) of the D-15 override line, per the plan's stated preference for this codebase's convention — a dated history note was added to the doc comment instead of leaving dead code inline
- `expectedVariableCount`'s doc comment explicitly states it is a no-op for the static REGISTRY fallback, so a future reader doesn't mistake the hardcoded `2` for a real per-template guard — the honest scope is documented at the type definition itself, not just in planning docs
- The stale-opt-in check used a throwaway `scripts/*.mjs` (mirroring the existing `scripts/check-admin.mjs` read-only diagnostic pattern) rather than a persistent test, since it is a one-time pre-flight fact-finding step tied to this specific gate-lift moment, not a regression guard; it was deleted immediately after producing its result, before the Task 1 commit

## Deviations from Plan

None — plan executed exactly as revised (post plan-checker FLAG 4). Both tasks match their `<action>` and `<behavior>` specs; the stale-opt-in check was performed read-only, pre-commit, as instructed, with the result (0 rows) documented above rather than acted upon.

## Issues Encountered
None. `dispatch.ts` was not touched (out of scope per the plan's scope fence — Plan 174-04's job). No architectural decisions were required; both changes were additive/subtractive within existing function bodies and interfaces.

## User Setup Required
None — no external service configuration, env vars, or migrations required by this plan. The `variables_schema` column already exists (migration `20260621000003`); populating it for specific approved templates is an admin-panel/SQL task explicitly out of this plan's scope.

## Next Phase Readiness
- `resolveChannels()` now genuinely respects tenant WhatsApp opt-in — Plan 174-04 can wire `dispatch.ts`'s whatsapp branch to trust `channels.whatsapp` without any further preference-layer change here.
- `getApprovedTemplateForEvent`/`getTemplateForEvent` both return `expectedVariableCount` on every code path — Plan 174-04's Pitfall-3 runtime guard (comparing `tpl.expectedVariableCount` against the actual variables array length before every WhatsApp send) has the data it needs, with the honest caveat that the guard is a structural no-op for the 5 still-static REGISTRY events until an admin migrates them into `whatsapp_notification_templates` with a real `variables_schema`.
- No blockers for Wave 2.

---
*Phase: 174-tenant-cutover-whatsapp-reenable*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/notifications/preferences.ts
- FOUND: tests/unit/notifications/preferences.test.ts
- FOUND: lib/notifications/whatsapp-registry.ts
- FOUND: tests/unit/notifications/whatsapp-registry.test.ts
- FOUND: commit d44fae7b (Task 1)
- FOUND: commit 5502eae5 (Task 2)
