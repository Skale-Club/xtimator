---
phase: 176-end-customer-consent-optout-quiet-hours
plan: 03
subsystem: notifications
tags: [quiet-hours, timezone, intl, tdd, sms-compliance]

# Dependency graph
requires: []
provides:
  - "resolveRecipientZones({clientState, clientPhone, companyState}) -> { zones, source } | null (fail-closed timezone derivation)"
  - "isWithinQuietHours(zones, at?) -> boolean (8am-8pm platform-wide window, DST-aware, split-zone intersection)"
  - "STATE_TIMEZONES and AREA_CODE_TIMEZONES exported lookup tables"
  - "QUIET_HOURS_START_HOUR / QUIET_HOURS_END_HOUR named constants"
affects: [176-04, 177, 178]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure functions with injected clock (no Date.now() in logic path) for deterministic time-based tests"
    - "Fail-closed derivation: null/false on unresolved signal, never a guessed default"
    - "Intl.DateTimeFormat per-zone local-hour computation (zero new dependency, DST-aware) mirroring lib/utils/format-date.ts's pinned-locale convention"

key-files:
  created:
    - lib/notifications/timezone-derive.ts
    - lib/notifications/quiet-hours.ts
    - tests/unit/notifications/timezone-derive.test.ts
    - tests/unit/notifications/quiet-hours.test.ts
  modified: []

key-decisions:
  - "Split-timezone states resolved via an array-intersection design (isWithinQuietHours requires ALL zones to pass) instead of research's literal 'latest/earliest clock' boundary math — identical safety guarantee, simpler and more obviously correct"
  - "8am-8pm window adopted platform-wide (Operational Decision #3, FL/OK's stricter statute convention) since no single federal bright line exists"
  - "AZ shipped as single-zone America/Phoenix; Navajo Nation DST-observing sub-region documented as a known v1 simplification, not resolved"
  - "AREA_CODE_TIMEZONES is deliberately non-exhaustive (curated major-metro NPAs); unmapped codes fall through to company_state tier rather than failing resolution"

patterns-established:
  - "Named constants for compliance-sensitive magic numbers (QUIET_HOURS_START_HOUR/END_HOUR) so future window changes don't touch comparison logic"

requirements-completed: [CUST-04]

# Metrics
duration: 3min
completed: 2026-07-21
---

# Phase 176 Plan 03: Recipient-Local Quiet-Hours Guard Summary

**Two composable pure functions — `resolveRecipientZones()` (state -> area-code -> company-state -> fail-closed) and `isWithinQuietHours()` (DST-aware 8am-8pm window with split-timezone-state intersection) — fully unit-tested with an injected fake clock.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-22T02:11:57Z (22:11:57 local)
- **Completed:** 2026-07-22T02:14:48Z (22:14:48 local)
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `resolveRecipientZones()` implements the three-tier precedence chain (clients.state -> NPA area code -> tenant companies.state) with explicit fail-closed `null` when no signal resolves — proven by dedicated tests, not just asserted in prose.
- `isWithinQuietHours()` enforces the platform-wide 8am-8pm window via per-zone `Intl.DateTimeFormat` local-hour computation (no hardcoded UTC offsets — DST-awareness proven by a same-nominal-clock-time summer-vs-winter test) and requires ALL zones in a split-timezone-state array to pass (intersection), guaranteeing the most-restrictive-zone-wins safety property.
- Both `STATE_TIMEZONES` and `AREA_CODE_TIMEZONES` lookup tables exported (not module-private) so 176-04's gate tests can assert against real entries without duplicating data.
- `QUIET_HOURS_START_HOUR`/`QUIET_HOURS_END_HOUR` shipped as named constants, not inline magic numbers.

## Task Commits

Each task followed RED -> GREEN TDD:

1. **Task 1: resolveRecipientZones (TDD)**
   - `c13ba1e3` test(176-03): add failing tests for resolveRecipientZones
   - `1dce0e5a` feat(176-03): implement resolveRecipientZones (state/area-code/company fail-closed)
2. **Task 2: isWithinQuietHours (TDD, DST + split-zone aware)**
   - `31f0fe4d` test(176-03): add failing tests for isWithinQuietHours
   - `ad063b6b` feat(176-03): implement isWithinQuietHours (8am-8pm, DST-aware, split-zone intersection)

**Plan metadata:** (this commit)

_No REFACTOR commits needed — GREEN implementations were clean on first pass._

## Files Created/Modified
- `lib/notifications/timezone-derive.ts` - `resolveRecipientZones()`, `STATE_TIMEZONES`, `AREA_CODE_TIMEZONES` (all 51 states/DC + curated NPA table, verbatim per plan)
- `lib/notifications/quiet-hours.ts` - `isWithinQuietHours()`, `QUIET_HOURS_START_HOUR`/`QUIET_HOURS_END_HOUR`
- `tests/unit/notifications/timezone-derive.test.ts` - 8 tests covering all 3 tiers, case-insensitivity, split-state arrays, punctuation stripping, fail-closed null
- `tests/unit/notifications/quiet-hours.test.ts` - 8 tests covering window boundaries (inclusive/exclusive), split-zone intersection, DST-awareness, empty-array fail-closed

## Decisions Made
- Used the plan's array-intersection simplification for split-timezone states instead of the research doc's literal "latest/earliest clock" boundary math — same safety guarantee, simpler code (documented in-file and in plan frontmatter `interfaces` block already).
- No new dependencies: DST handling relies entirely on native `Intl.DateTimeFormat`, consistent with the existing `lib/utils/format-date.ts` convention.

## Deviations from Plan

None - plan executed exactly as written. Both lookup tables (`STATE_TIMEZONES`, `AREA_CODE_TIMEZONES`) were copied verbatim per the plan's explicit instruction. All 16 specified test cases (7 + 8, plus one extra dual-assertion in the fail-closed test) pass; `tsc -p tsconfig.ci.json --noEmit` is clean.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. These are pure, dependency-free modules.

## Next Phase Readiness
- 176-04's `customer-send-gate.ts` can now import `resolveRecipientZones` and `isWithinQuietHours` directly and treat `null` zones as an automatic gate failure (fail-closed by construction).
- `STATE_TIMEZONES`/`AREA_CODE_TIMEZONES` are exported and ready for 176-04's tests to assert against without re-deriving the data.
- No blockers. This plan has no dependencies (Wave 1, parallel with 176-01/176-02) and depends on nothing from either.

---
*Phase: 176-end-customer-consent-optout-quiet-hours*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 4 created files found on disk; all 4 task commits (c13ba1e3, 1dce0e5a, 31f0fe4d, ad063b6b) found in git history.
