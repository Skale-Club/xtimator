---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 02
subsystem: database
tags: [supabase, postgres, migration, estimate-deliveries, dormant-first, check-constraint]

# Dependency graph
requires:
  - phase: 81-whatsapp-outbound-delivery
    provides: DROP CONSTRAINT + ADD CONSTRAINT CHECK-widening idiom for estimate_deliveries.channel/provider
  - phase: 161-presentation-settings
    provides: dormant-first, nullable, no-DEFAULT column-add precedent (estimates.presentation_settings)
provides:
  - Nullable `format` column on estimate_deliveries (online_link | pdf | plain_text OR NULL)
  - Widened `channel` CHECK: email | sms | whatsapp | copy | open | download | manual
  - Widened `provider` CHECK: resend | twilio | meta | client
  - Byte-cheap migration-contract test (static file-contents assertions, no live DB) gating dormant-first invariant
affects:
  - 163-03-PLAN.md (cross-surface resolver rollout — no schema dependency)
  - 163-04-PLAN.md (SendHubDialog — schema READ-side users)
  - 163-05-PLAN.md (delivery-action wiring — 6+ INSERT sites that WRITE format/channel/provider)
  - 163-06-PLAN.md (delete old channel-first surfaces — no schema dependency)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dormant-first schema widening (Phase 129/161 lineage): additive-nullable column + no DEFAULT + no backfill; legacy rows read as NULL/unknown."
    - "CHECK-constraint widening: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (mirrors Phase 81 20260526000005) — no enum type, plain TEXT + CHECK."
    - "Sentinel provider value ('client') instead of NULL-able provider — keeps the base migration's provider NOT NULL contract intact; no schema DDL beyond the CHECK swap."
    - "Migration-contract test as a byte-cheap gate: static file-contents assertions via readFileSync + regex; never touches a live DB (matches Phase 161's authored-only migration pattern)."

key-files:
  created:
    - supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql
    - tests/unit/db/phase163-migration-contract.test.ts
  modified: []

key-decisions:
  - "format column is PERMANENT-nullable — CHECK explicitly accepts NULL; never tighten to NOT NULL (pre-Phase-163 rows would violate). NULL semantically = 'unknown', never an implicit online_link."
  - "'client' sentinel added to provider CHECK (not NULL-ability) — preserves base migration's provider NOT NULL and allows copy/open/download/manual actions to log without schema surgery."
  - "Bundled the migration-contract test (semantically 163-01 Wave 0 scaffold) into this commit — Rule 3 blocking-fix: the acceptance criteria require observable RED→GREEN, and 163-01 has not been executed yet."

patterns-established:
  - "Same-day migration timestamp sequencing (20260708000002 → 20260709000001) mirrors Phase 160→161 idiom."
  - "Idempotent migration: ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS. Safe to re-run on local supabase db reset."

requirements-completed: [SENDHUB-03]

# Metrics
duration: 3m 6s
completed: 2026-07-08
---

# Phase 163 Plan 02: Dormant-First estimate_deliveries Widening Summary

**Nullable `format` column + widened `channel`/`provider` CHECK constraints on `estimate_deliveries` — dormant-first schema prep for Wave 3's format-first Send hub INSERT sites; ships ahead of the code so downstream INSERTs land against a permissive schema.**

## Performance

- **Duration:** 3m 6s
- **Started:** 2026-07-08T23:36:00Z
- **Completed:** 2026-07-08T23:39:06Z
- **Tasks:** 1 (bundled 1 Rule-3 fix)
- **Files created:** 2

## Accomplishments

- Shipped the single new migration (`20260709000001_phase163_send_hub_delivery_schema.sql`) with three coordinated widenings:
  1. `ADD COLUMN IF NOT EXISTS format TEXT` with `CHECK (format IN ('online_link', 'pdf', 'plain_text') OR format IS NULL)` — permanent-nullable.
  2. `channel` CHECK widened: DROP + ADD to include `copy`, `open`, `download`, `manual` alongside `email`, `sms`, `whatsapp`.
  3. `provider` CHECK widened: DROP + ADD to include the `client` sentinel alongside `resend`, `twilio`, `meta`.
- Bundled the byte-cheap migration-contract test (`tests/unit/db/phase163-migration-contract.test.ts`) that gates every subsequent Wave — 4/4 `it` blocks now GREEN.
- Dormant-first invariant proven statically: no `ALTER COLUMN format SET NOT NULL`, no `DEFAULT`, no backfill script. Legacy rows keep working with `format = NULL` = "unknown".
- Hidden-regression sweep clean: 36 tests across `estimate-pdf-totals.test.tsx`, `estimate-pdf-modern-totals.test.tsx`, `whatsapp/formatter.test.ts`, `utils/estimate-template.test.ts` all still green.

## Task Commits

1. **Task 1: Write the Phase 163 delivery-schema widening migration** — `e76d4439` (feat)
   - Also carries the 163-01 migration-contract test (Rule 3 blocking fix).

## Files Created/Modified

- `supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql` — dormant-first migration: `format` column + widened `channel` CHECK + widened `provider` CHECK.
- `tests/unit/db/phase163-migration-contract.test.ts` — static file-contents assertions gating the three widenings + dormant-first invariant. 4 `it` blocks, all GREEN post-migration.

## Decisions Made

- **`'client'` sentinel over nullable provider.** The base migration has `provider NOT NULL`; introducing NULL-able provider would be a wider schema surgery than needed. Adding a `'client'` sentinel to the CHECK preserves the invariant while enabling copy/open/download/manual actions to log without a null-exception.
- **Bundle the 163-01 migration-contract test into this commit.** The plan's acceptance criteria explicitly require observable RED→GREEN of `tests/unit/db/phase163-migration-contract.test.ts`, but 163-01 has not been executed. Creating both the migration and the test together in one commit is the smallest safe unit that satisfies verification. The user's framing "1 file + 1 migration-contract test" confirmed this scope.
- **Comment rewording to avoid `SET NOT NULL` literal.** The plan's verbatim comment body clashed with its own `grep -c "SET NOT NULL" == 0` acceptance criterion. Reworded to "Do NOT tighten the column to non-nullable later" — same semantic intent. The migration-contract test's stricter `/ALTER\s+COLUMN\s+format\s+SET\s+NOT\s+NULL/i` regex is the load-bearing check (still passes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bundled the missing 163-01 migration-contract test scaffold**
- **Found during:** Pre-verification setup for Task 1.
- **Issue:** Plan 163-02's acceptance criteria (`The 163-01 migration-contract test transitions from RED to GREEN`) and `<verify>` step (`npx vitest run tests/unit/db/phase163-migration-contract.test.ts`) both depend on `tests/unit/db/phase163-migration-contract.test.ts` existing. Plan 163-01 (Wave 0 test scaffolds) has NOT been executed — the file is absent. Without it, this plan cannot be verified.
- **Fix:** Created the test file verbatim from Plan 163-01's Task 3 spec. Byte-cheap (no live DB, pure file-contents assertions). Doubles as a Wave 3+ gate for the dormant-first invariant.
- **Files modified:** `tests/unit/db/phase163-migration-contract.test.ts` (created).
- **Verification:** All 4 `it` blocks GREEN.
- **Committed in:** `e76d4439` (part of Task 1 commit).

**2. [Rule 1 - Bug] Rephrased "SET NOT NULL" header comment to satisfy grep-c==0 gate**
- **Found during:** Task 1 acceptance-criteria sweep.
- **Issue:** The plan's own verbatim migration body contained the phrase "Do NOT add SET NOT NULL later" (in the header comment), which collided with the plan's own acceptance criterion `grep -c "SET NOT NULL" ... == 0`. A self-contradiction: the plan asked me to include the phrase and asked me to have zero matches.
- **Fix:** Rephrased the comment to "Do NOT tighten the column to non-nullable later" — same semantic intent, zero grep matches on `SET NOT NULL`. The migration-contract test's stricter `/ALTER\s+COLUMN\s+format\s+SET\s+NOT\s+NULL/i` regex (which correctly targets DDL, not comments) still passes.
- **Files modified:** `supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql` (comment-only edit).
- **Verification:** `grep -c "SET NOT NULL" migration.sql` = 0; migration-contract test still GREEN.
- **Committed in:** `e76d4439` (part of Task 1 commit).

---

**Total deviations:** 2 auto-fixed (1 blocking [Rule 3], 1 bug [Rule 1]).
**Impact on plan:** Both fixes are surgical and preserve intent. The Rule 3 bundle is the smallest safe unit satisfying the plan's own acceptance criteria; the Rule 1 comment-reword is a wording tweak with zero semantic impact.

## Issues Encountered

- Windows line-ending warnings on staging (`LF will be replaced by CRLF`) — normal, no action needed.

## User Setup Required

**Remote migration application is manual.** The migration is authored-only; per the standing `Deploy via CI→GHCR, not on VPS` memory, the CI/CD ladder (GitHub Actions → GHCR → Coolify) applies it on the next deploy. Local Supabase (`supabase start` / `supabase db reset`) will run the file idempotently. No additional environment variables, secrets, or dashboard configuration required.

## Next Phase Readiness

- Wave 1 half-complete: 163-02 shipped, 163-01 (remaining Wave 0 test scaffolds) still pending. **163-01 no longer needs to create `tests/unit/db/phase163-migration-contract.test.ts`** — this plan bundled it. The other 6 scaffold files (`_pdf-text-walker.ts`, `presentation-settings-cross-surface.test.tsx`, `delivery-insert-format.test.ts`, `send-sms-format-fallback.test.ts`, `send-estimate-format-fallback.test.ts`, `send-hub-dialog.test.tsx`) still need creating.
- 163-03 (cross-surface resolver rollout) is unblocked — no schema dependency.
- 163-05 (delivery-action wiring) is now unblocked at the schema level; INSERT payloads can safely carry `format` + widened `channel`/`provider` values from Wave 3 onward.
- 163-06 (deletion sweep of old channel-first surfaces) has no schema dependency.

## Self-Check: PASSED

Verified via absolute-path existence + git-log grep:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/supabase/migrations/20260709000001_phase163_send_hub_delivery_schema.sql`
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/db/phase163-migration-contract.test.ts`
- FOUND: commit `e76d4439` in git log
- FOUND: 4/4 GREEN in `npx vitest run tests/unit/db/phase163-migration-contract.test.ts`
- FOUND: 36/36 GREEN in hidden-regression sweep (`estimate-pdf-totals` + `estimate-pdf-modern-totals` + `whatsapp/formatter` + `utils/estimate-template`)
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exit 0
- FOUND: gitleaks pre-commit hook: `no leaks found`

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-08*
