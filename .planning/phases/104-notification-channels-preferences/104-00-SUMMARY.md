---
phase: 104-notification-channels-preferences
plan: 00
subsystem: testing
tags: [vitest, notifications, whatsapp, sms, twilio, tdd, red-scaffold]

# Dependency graph
requires:
  - phase: 77-notifications-system
    provides: notify() dispatch, resolveChannels() resolver, event-types catalog, notifications-form matrix
provides:
  - 6 NEW failing-by-design vitest files locking the Wave 1-3 contracts (event reduction, pure migration fn, WhatsApp dispatch branch, owner-phone resolver, SMS client, admin template panel)
  - 3 EXTENDED existing vitest files with 4-channel routing + best-effort + TCPA-consent gating cases
affects: [104-01, 104-02, 104-03, notifications, whatsapp, sms]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 RED scaffold: static import for ASSERTION-fail RED where the module exists (event-types); lazy await import() inside each it for module-not-found RED where the module is new"
    - "Scoped vi.mock + afterEach(clearAllMocks) so cross-suite forks-pool runs do not leak mocks"
    - "EXTEND pattern: widen shared mocks additively (resolveChannels 2->4 keys) + append a new describe block, never delete pre-existing green cases"

key-files:
  created:
    - tests/unit/notifications/event-types.test.ts
    - tests/unit/notifications/category-migration.test.ts
    - tests/unit/notifications/whatsapp-channel.test.ts
    - tests/unit/notifications/owner-phone.test.ts
    - tests/unit/sms/client.test.ts
    - tests/unit/admin/whatsapp-templates.test.ts
  modified:
    - tests/unit/notifications/dispatch.test.ts
    - tests/unit/notifications/preferences.test.ts
    - tests/unit/notifications/preferences-form.test.tsx

key-decisions:
  - "event-types.test.ts uses ASSERTION-fail RED (static import; current 8-category values differ) rather than module-not-found — valid RED, the module already exists"
  - "Explicit TCPA/consent defense (INFO-2): a category sms toggle ON with no sms_opt_in_at must NOT send — asserted in preferences.test.ts so Wave 2 cannot ship SMS on toggle alone"
  - "WhatsApp dispatch contract mirrors the email branch: an Inngest event whose name includes 'whatsapp' carrying data.userId — assert the Inngest-event seam, not a direct sendWhatsAppTemplate call"

patterns-established:
  - "Per-RED Wave owner is documented in each file's header docblock (Wave 1 / Wave 2 / Wave 3) so downstream tasks know which test they must turn green"
  - "Placeholder-only third-party creds in tests (AC_test / tok_test) — gitleaks-clean"

requirements-completed: []  # Wave-0 scaffold locks contracts; requirements NOT satisfied until Waves 1-3 turn these GREEN

# Metrics
duration: 18min
completed: 2026-06-21
---

# Phase 104 Plan 00: Wave-0 RED/EXTEND Test Scaffold Summary

**Six new failing-by-design vitest files + three extended ones that lock every Phase-104 notification-revamp contract (3-category reduction, pure JSONB migration fn, WhatsApp + SMS senders, owner-phone resolver, admin template panel, 4-channel routing with TCPA-consent gating) before any implementation lands.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-21T21:44:00Z
- **Completed:** 2026-06-21T21:50:00Z
- **Tasks:** 3
- **Files modified:** 9 (6 created, 3 extended)

## Accomplishments

- 6 NEW RED files authored, each pointing at a not-yet-existing module/export so every downstream Wave 1-3 task has a concrete test to turn green (the Nyquist-compliance gate).
- 3 EXISTING files EXTENDED additively with 4-channel + best-effort + consent cases; all pre-existing Phase-77 green cases left intact.
- Explicit TCPA/consent hardening (INFO-2): SMS must not send on a category toggle alone without a recorded `sms_opt_in_at`.
- `vi.mock` scoped with `afterEach` clear in every new file; placeholder-only Twilio creds — gitleaks clean on all three commits.

## Task Commits

1. **Task 1: NEW RED — event map, migration fn, owner-phone, SMS client** - `b994e7f` (test)
2. **Task 2: NEW RED — WhatsApp dispatch branch + admin template panel** - `fcb1cfa` (test)
3. **Task 3: EXTEND dispatch + preferences + preferences-form for 4 channels** - `a8caae4` (test)

## Files Created/Modified

### Created (NEW RED)
- `tests/unit/notifications/event-types.test.ts` — NOTIF-01: 3-category set (estimate/billing/system/_dropped) + billing/_dropped remap + 4-channel defaults. **Owner: Wave 1.** (assertion-fail RED)
- `tests/unit/notifications/category-migration.test.ts` — NOTIF-06: pure `migrateCategories` (OR-merge → billing, drop whatsapp/ai_job, idempotent, no null writes, paid channels not defaulted-on). **Owner: Wave 1.** (module-not-found RED)
- `tests/unit/notifications/owner-phone.test.ts` — NOTIF-05: per-user `resolveOwnerPhone` + null/error gate. **Owner: Wave 2.** (module-not-found RED)
- `tests/unit/sms/client.test.ts` — NOTIF-04: `sendSms` (Messages.json + Basic auth + From/To/Body; unconfigured gate; never-throw). **Owner: Wave 2.** (module-not-found RED)
- `tests/unit/notifications/whatsapp-channel.test.ts` — NOTIF-03: WhatsApp `notify()` branch (Inngest dispatch when channel+phone+template present; no-op on null phone/template; best-effort). **Owner: Wave 2.** (module-not-found RED)
- `tests/unit/admin/whatsapp-templates.test.ts` — 104.3: `createTemplate`/`listTemplates`/`applyTemplateStatusUpdate`/`submitTemplateToMeta` against `whatsapp_notification_templates`. **Owner: Wave 3.** (module-not-found RED)

### Modified (EXTEND)
- `tests/unit/notifications/dispatch.test.ts` — NOTIF-07: resolveChannels mock widened to 4 keys; new RED whatsapp/sms Inngest-routing case + best-effort (throwing send does NOT block in-app insert). **Owner: Wave 2.**
- `tests/unit/notifications/preferences.test.ts` — NOTIF-02: new RED block for 4-key ResolvedChannels + whatsapp/sms default-false + TCPA gate. **Owner: Wave 1 (shape) + Wave 2 (gate).**
- `tests/unit/notifications/preferences-form.test.tsx` — NOTIF-01/02: new RED block for 3 reduced category rows + `pref-whatsapp-billing`/`pref-sms-billing` switches disabled without `verifiedPhone`. **Owner: Wave 1 (rows/columns) + Wave 2 (gating).**

## Decisions Made

- event-types.test.ts uses **assertion-fail RED** (static import) because the module already exists with 8 categories; this is a valid RED form per the plan note.
- The WhatsApp dispatch contract is asserted via the **Inngest-event seam** (event name contains `whatsapp`, carries `data.userId`) to mirror the existing email branch rather than coupling to a direct `sendWhatsAppTemplate` call.
- The form's new prop is named `verifiedPhone` (null in RED) — Wave 1/2 will type it on `NotificationsFormProps`; vitest's esbuild transform strips types so the RED file compiles today.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All three task verifications produced the expected RED-by-design state:
- 6 new files: 4 module-not-found RED + event-types assertion-fail RED (4 failing assertions; the estimate/system carry-through assertion incidentally passes, which is correct and stable).
- 3 extended files: 7 new RED cases, 19 pre-existing green cases intact.
- Full `npx vitest run tests/unit/notifications tests/unit/sms tests/unit/admin/whatsapp-templates.test.ts` collects all 9 target files (no "No test files found"): 9 failed | 6 passed (15 files), 11 failed | 84 passed (95 tests) — the 11 reds are exactly the Wave-0 scaffold.

## Known Stubs

None. This plan authors test scaffolding only — no source modules, no UI data wiring. The not-yet-existing modules referenced by the RED tests are intentional Wave 1-3 deliverables, documented per-file with their Wave owner.

## User Setup Required

None - no external service configuration required for the test scaffold. (Live Twilio/Meta creds are needed only for the Wave 2/3 manual UAT items listed in 104-VALIDATION.md.)

## Next Phase Readiness

- `wave_0_complete: true` can now be set in 104-VALIDATION.md frontmatter.
- Every VALIDATION.md Wave-0 gap has a corresponding RED file on disk.
- Wave 1 (104.1) turns event-types + category-migration + preferences (shape) + preferences-form (rows/columns) green.
- Wave 2 (104.2) turns owner-phone + sms/client + whatsapp-channel + dispatch (4-channel) + preferences (gate) + preferences-form (gating) green.
- Wave 3 (104.3) turns admin/whatsapp-templates green.

## Self-Check: PASSED

- All 9 target files verified present on disk.
- All 3 task commits verified in git log (b994e7f, fcb1cfa, a8caae4).
- gitleaks passed on every commit; no secret literals in any test file.
- Unrelated pre-existing working-tree files (onboarding/settings/skeletons, next-env.d.ts) left untouched.

---
*Phase: 104-notification-channels-preferences*
*Completed: 2026-06-21*
