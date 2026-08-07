---
phase: 191-object-migration-verification
plan: 03
subsystem: infra
tags: [storage, r2, supabase, migration, runbook, gitleaks, vitest]

# Dependency graph
requires:
  - phase: 191-01
    provides: source enumeration + comparison engine (MIGRATION_BUCKETS, walkSupabaseBucket, enumerateSource, compareObject, formatMigrationReport)
  - phase: 191-02
    provides: "npm run migrate:r2 / npm run migrate:r2 -- --verify-only CLI, report row vocabulary, exit-code contract"
provides:
  - "docs/STORAGE-MIGRATION.md — Phase 191 authoritative section: verified R2 settings, preconditions, migration/verify-only runbook, cutover gate, both rollback cases, execution record"
  - "tests/unit/storage/storage-migration-runbook.test.ts — automated doc gate: required content, >=6 supersession banners, zero secret-shaped literals, self-proving detector"
  - "The live migration executed against production R2: 55 objects copied, idempotency proven, corruption drill caught and restored"
  - ".gitleaks.toml allowlist entry for the doc-gate's intentional fake-secret fixtures"
affects: [192]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-gate pattern: read a markdown runbook from disk in a plain vitest test, assert required strings/headings by .toContain / regex, and assert a shared SECRET_PATTERNS array both finds zero real hits AND matches a hard-coded fake-secret sample per pattern — so a typo'd regex cannot silently turn the gate into a no-op"
    - "gitleaks allowlist-by-path for test files that deliberately contain secret-shaped (but fake) fixtures, rather than weakening the custom rule or the fixture itself"

key-files:
  created:
    - tests/unit/storage/storage-migration-runbook.test.ts
  modified:
    - docs/STORAGE-MIGRATION.md
    - .gitleaks.toml
    - .planning/phases/191-object-migration-verification/deferred-items.md

key-decisions:
  - "New authoritative section inserted immediately after the 'Same-origin asset proxy (Phase 187, PROXY-01..04)' block and before the Phase 188/189 sections (i.e. before 'Why this is a 1-line change'), per the plan's literal placement instruction — the doc is a living/newest-first document, not strictly chronological"
  - "Execution record states the verified totals (55 copied / 0 failed; second run 0 copied, 55 matched; corruption drill caught and restored) but does NOT fabricate a per-bucket count breakdown that was never captured/pasted during the live run — the doc explicitly says so rather than inventing plausible-looking numbers"
  - "The object count (51 at scoping time, 55 at copy time) is stated as a moving target throughout, never hard-coded as a fact to rely on — matches the plan's explicit instruction and the doc's own pre-existing tail content"
  - ".gitleaks.toml gained one allowlist path entry for the new test file (same pattern as the pre-existing tests/unit/estimates/public-url.test.ts entry) — required because the file intentionally contains fake sk_live_/rk_test_/sb_secret_-shaped strings to prove its own detector is not vacuous, and gitleaks' generic Stripe/Supabase rules otherwise blocked the commit"

patterns-established:
  - "Pattern: a runbook doc that needs to stay trustworthy gets an automated content+secret gate in tests/, not just a human review — see storage-migration-runbook.test.ts as the template for any future doc"

requirements-completed: [MIG-04]

duration: 40min
completed: 2026-08-07
---

# Phase 191 Plan 03: R2 Cutover and Rollback Runbook (MIG-04) Summary

**`docs/STORAGE-MIGRATION.md` now carries the authoritative R2 cutover/rollback runbook — verified settings, both rollback cases, and the actual production execution record (55 objects copied, idempotency proven, a deliberate corruption caught and restored) — gated by a new vitest test that fails if a required command disappears or a secret-shaped literal appears, and proves its own detector is not vacuous.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-07T01:43Z
- **Tasks:** 3/3 (Task 3's live execution was performed by the operator against production before this plan started — see "Deviations" below)
- **Files modified:** 2 modified (`docs/STORAGE-MIGRATION.md`, `.gitleaks.toml`), 1 created (`tests/unit/storage/storage-migration-runbook.test.ts`)

## Accomplishments

- Added `## Phase 191 — R2 migration, cutover, and rollback (authoritative)` to `docs/STORAGE-MIGRATION.md`: verified R2 settings (placeholders only), preconditions (no maintenance window, no write pause — the asset proxy's Supabase fallback makes this safe), the migration/re-run/verify-only commands quoted verbatim from `scripts/r2-migrate.ts`'s own report vocabulary, the cutover gate (`npm run migrate:r2 -- --verify-only` exits 0 across all five buckets — the concrete precondition that lifts the standing S3_* Coolify prohibition), and both rollback cases (before any R2 write vs. after Phase 188/189 write directly to R2, including the `[EXTRA]`-rows-as-copy-back-list mechanism).
- Both standing caution paragraphs ("Phase-191 caution" inside the MIG-03 section, and "W4 — do not set `S3_*` in Coolify yet") now point at the concrete gate instead of stating an open-ended prohibition.
- Marked all 6 stale Hetzner-era headings (Pre-migration checklist, Steps 1-4, Rollback procedure) with the same `> **Superseded**` banner convention already used for "Why this is a 1-line change" — 7 banners total, none of the original bodies deleted.
- Recorded the live execution (already run by the operator against production before this plan started, per the task instructions): baseline `verify:r2` 16/16 PASS zero SKIP; initial copy 55 copied / 0 failed; second run 0 copied / 55 matched (idempotency, MIG-01); `--verify-only` zero writes, all matched; a deliberate corruption drill (one R2 object truncated to 9 bytes) caught by verification (`[FAIL]`, source vs. destination size, non-zero exit) and then restored; CORS applied to the `audio` bucket via an out-of-band admin token (the app token cannot set bucket CORS itself — verified `AccessDenied`).
- Built `tests/unit/storage/storage-migration-runbook.test.ts` (30 tests): required strings/headings present; supersession-banner count `>= 6`; a shared `SECRET_PATTERNS` array asserted to find zero matches in the real doc AND to match a corresponding hard-coded fake-secret sample for every pattern (proven non-vacuous by deliberately breaking one regex, observing red, then restoring — see Verification below).
- `.gitleaks.toml` gained one path-allowlist entry for the new test file, matching the existing `tests/unit/estimates/public-url.test.ts` precedent — required because the file's fake secret fixtures (`sk_live_deadbeef...`, `rk_test_deadbeef...`, `sb_secret_FAKE...`) trip gitleaks' generic Stripe/Supabase rules even though they are obviously not real.

## Task Commits

1. **Task 1: R2 cutover and rollback runbook** - `7bb6c179` (docs)
2. **Task 2: automated doc gate** - `11659ce9` (unplanned co-commit with sibling 190-02 work — see Deviations) + `1921904a` (chore: gitleaks allowlist fix required to get the file committed cleanly)
3. **Task 3: operator executes the migration** - performed by the operator against production **before this plan's execution started**; this plan's job was to write the runbook to match the already-recorded facts, not to re-run or re-verify the migration itself.

**Plan metadata:** committed together with the final state-update commit (see below).

## Files Created/Modified

- `docs/STORAGE-MIGRATION.md` — new authoritative Phase 191 section (settings, preconditions, migration/verify-only/cutover/rollback, execution record); both S3_*-in-Coolify caution paragraphs repointed at the concrete gate; 6 new `> **Superseded**` banners.
- `tests/unit/storage/storage-migration-runbook.test.ts` — 30-test doc gate (required content, supersession count, secret absence, detector self-proof).
- `.gitleaks.toml` — one allowlist path entry for the new test file's intentional fake-secret fixtures.
- `.planning/phases/191-object-migration-verification/deferred-items.md` — appended item 3, documenting the 14-failed-file/21-failed-test full-suite gate result and why none of it is in this plan's scope.

## Decisions Made

See `key-decisions` in frontmatter. The one worth calling out beyond that list: the plan's Task 3 was written as a `checkpoint:human-action` because in the normal flow the scoped R2 credential would never touch this environment. In this execution, the operator had already run the live migration against production **before** invoking this plan, and supplied the verified facts (55 copied/0 failed, idempotency, corruption-drill outcome, `verify:r2` 16/16, CORS applied) directly. This plan therefore executed Tasks 1 and 2 as ordinary `auto` work and treated Task 3 as already-satisfied — writing the runbook and the "Execution record" subsection to match the supplied facts rather than re-running or re-verifying anything against live R2 (this executor was never given the credential and could not have run it anyway).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] gitleaks blocked the commit of the new test file's intentional fake-secret fixtures.**
- **Found during:** Task 2, committing `tests/unit/storage/storage-migration-runbook.test.ts`.
- **Issue:** The test file deliberately contains one obviously-fake value per secret shape (`sk_live_deadbeef...`, `rk_test_deadbeef...`, `sb_secret_FAKE...`) to prove `SECRET_PATTERNS` is not vacuous. gitleaks' generic Stripe/Supabase rules matched these as if they were real secrets and blocked the commit.
- **Fix:** Added a path-allowlist entry for the file in `.gitleaks.toml`, following the exact precedent already established for `tests/unit/estimates/public-url.test.ts` (deterministic test fixtures, never real secrets).
- **Files modified:** `.gitleaks.toml`
- **Commit:** `1921904a`

**2. [Not a deviation, but worth recording plainly] A concurrent sibling plan's commit swept up this plan's staged test file.**
- **Found during:** Attempting to commit `tests/unit/storage/storage-migration-runbook.test.ts` in isolation.
- **Issue:** Plans 190-02/190-03 were executing concurrently in this same (non-worktree-isolated) working directory. Between this plan's `git add` of only its own file and its `git commit`, a sibling agent's own commit (`11659ce9`, `feat(190-02): tenant-scoped writers emit same-origin asset paths`) included the already-staged file in its own commit — a shared-index race, not a git error on this plan's part.
- **Fix:** Verified via `git show 11659ce9:tests/unit/storage/storage-migration-runbook.test.ts` that the committed content exactly matches this plan's intended (post-corruption-drill-restore) content, byte for byte on the relevant lines. No further action — rewriting a sibling's already-existing commit in a shared branch mid-flight was judged riskier than leaving the (correct) content attributed to the wrong commit message. Recorded here for traceability rather than silently accepted.
- **Files affected:** `tests/unit/storage/storage-migration-runbook.test.ts` (content correct; commit attribution is `11659ce9`, not a dedicated 191-03 commit).

---

**Total deviations:** 1 auto-fixed (Rule 3, blocking) + 1 recorded shared-working-tree artifact (no fix needed, content verified correct).
**Impact on plan:** No scope creep, no incorrect content shipped. The gitleaks fix was strictly necessary to get a legitimate file committed at all.

## Issues Encountered

**Mandated full-suite gate (`npx vitest run tests/unit tests/eval`)** — `VITEST_EXIT=1`: 14 failed test files, 21 failed tests, 5475 passed, 20 todo, 611.91s (roughly 3x the ~215s baseline 191-02 recorded). Investigated every failing file by name:

- **Expected, per the plan's own note:** `tests/unit/sign-estimate-atomic-migration.test.ts`, `tests/unit/signature-evidence-retention-migration.test.ts` (Windows/CRLF, pre-existing), `tests/unit/mcp-route-contract.test.ts` (fork-pool-contention flake).
- **Sibling 190-02/190-03 mid-edit collateral** (confirmed via `git status` showing these exact files as concurrently modified/untracked by the sibling plans while this gate ran): `tests/unit/branding-actions.test.ts`, `tests/unit/admin/save-landing-asset-urls.test.ts` (5 sub-failures), `tests/unit/admin/save-seo.test.ts`, `tests/unit/storage/persisted-url-form.test.ts` (2 sub-failures, itself a brand-new file belonging to 190-02/190-03's own TDD cycle).
- **Apparent resource-contention timeouts/flakes**, none touching storage/R2/this plan's files, several with 20-70s durations consistent with CPU starvation from 2-3 concurrently-running full-suite gates (the log shows multiple `[vitest-pool]: Timeout terminating forks worker` lines): `tests/unit/actions/team-invite.test.ts`, `tests/unit/billing/seat-billing-wiring.test.ts` (2 sub-failures), `tests/unit/inngest/generate-estimate-job.test.ts`, `tests/unit/whatsapp/confirm.test.ts` (a hard 30000ms timeout), `tests/unit/estimate/paginated-view-engine-parity.test.tsx`, `tests/eval/harness.test.ts`, `tests/eval/price-research-regression.test.ts` (2 sub-failures).

Zero failures named `r2-migrate`, `r2-verify`, or `storage-migration-runbook`. This plan's own doc-gate test (30/30) is not in the failing set. Per the executor's scope boundary rule, none of these were fixed and the full suite was not re-run "hoping it resolves itself" — logged to `deferred-items.md` (item 3) instead, for whoever verifies 190-02/190-03 or re-runs the gate once concurrent sessions are done.

**Scoped CI gate (`npx tsc -p tsconfig.ci.json --noEmit`)** — clean, zero errors.

**Bare `npx tsc --noEmit`** — 15 pre-existing errors, all in test files belonging to concurrently-executing sibling plans (`tests/unit/pdf/pdf-logo-resolution.test.ts`, `tests/unit/storage/asset-inline.test.ts`, `tests/unit/storage/upload-ticket.test.ts`) — none reference this plan's files. Matches the documented "bare tsc is red by design outside CI scope" project convention.

**Doc-gate self-verification, run explicitly:**
- Deliberately broke one `SECRET_PATTERNS` regex (`whsec_` → `whsec_NOPE`) — the "detector is not vacuous" test went red as expected, then the regex was restored and re-verified green.
- Deliberately removed every occurrence of `npm run migrate:r2` from a live copy of the doc — the "contains required string" test went red as expected (found via `expect(doc).toContain('npm run migrate:r2')` failing), then the doc was restored to its exact original content (verified by re-counting all 12 occurrences of `npm run migrate:r2` matched the pre-corruption count) and re-verified green.
- Confirmed `gitleaks protect --staged` genuinely blocks a commit containing the test file's fake-secret fixtures (that block is what led to the `.gitleaks.toml` fix above) — proof the secret-scan gate is capable of failing, per this plan's mandate.

## Known Stubs

None. The runbook's "Execution record" states real, verified facts throughout; where a precise number was not available (per-bucket source/destination counts for the live 55-object run, which were not individually pasted into this record beyond the aggregate totals), the doc says so explicitly rather than inventing a number.

## User Setup Required

None — no external service configuration required by this plan. The live R2 migration itself was already executed by the operator, outside this plan's own actions, using a credential this executor never held.

## Next Phase Readiness

- Phase 192 (URL rewrite cutover + CDN verification) can now cite `docs/STORAGE-MIGRATION.md`'s "Cutover" subsection directly for its own precondition-gate language, and the "Rollback" subsection for its own safety net.
- The standing "do not set `S3_*` in Coolify" prohibition is formally lifted in the doc — Phase 192 is the phase that actually flips it, per the doc's own explicit statement that setting `S3_*` alone changes which backend serves the proxy and nothing else (no DB row rewrite, no `getPublicUrl()` change, no CDN cache-HIT proof — all still Phase 192).
- Sibling plans 190-02/190-03 are still mid-flight in this same working tree; the deferred-items.md entry (item 3) gives whoever runs 190's own full-suite gate a categorized starting point rather than a blank 14-file failure list.

---
*Phase: 191-object-migration-verification*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: docs/STORAGE-MIGRATION.md
- FOUND: tests/unit/storage/storage-migration-runbook.test.ts
- FOUND: .gitleaks.toml
- FOUND: commit 7bb6c179 (docs: R2 cutover and rollback runbook)
- FOUND: commit 1921904a (chore: gitleaks allowlist fix)
- FOUND: commit 11659ce9 (sibling commit containing the doc-gate test file, content verified identical to this plan's intended version)
