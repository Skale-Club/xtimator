---
phase: 187-r2-provisioning-same-origin-asset-proxy
plan: 02
subsystem: infra
tags: [storage, r2, s3, cloudflare, verification, vitest]

requires: ["187-01"]
provides:
  - "scripts/r2-verify.ts — MIG-03 assertion script: bucket reachability, scope, read/write round-trip, public-access-disabled"
  - "npm run verify:r2 — the operator entry point"
  - "docs/STORAGE-MIGRATION.md MIG-03 section — provisioning record + re-verification runbook"
affects: [191, 192]

tech-stack:
  added: []
  patterns:
    - "Verification script consumes s3ConfigFromEnv() from Plan 01 rather than re-implementing the S3_* mapping — a drift in env interpretation cannot make the script pass while the app fails"
    - "Scope check inverts pass/fail: HeadBucket succeeding on a bucket outside the allowlist is the failure condition, denial is the pass condition"
    - "Cloudflare API check is genuinely skippable (SKIPPED, distinct from PASS) rather than silently treated as passing when credentials for it are absent"

key-files:
  created:
    - scripts/r2-verify.ts
    - tests/unit/storage/r2-verify.test.ts
  modified:
    - package.json
    - docs/STORAGE-MIGRATION.md

key-decisions:
  - "main()'s missing-config message names the S3_* class generically ('one or more required S3_* env vars') rather than enumerating each variable name, because the done-criteria grep gate forbids the literal string 'S3_ACCESS_KEY_ID' anywhere in scripts/r2-verify.ts (the mapping, including its variable names, lives only in lib/storage/s3-config.ts) — this is stricter than a plain informational message would be, but it is what keeps 'the mapping lives in one place' actually true rather than merely true-in-spirit"
  - "verifyRoundTrip always attempts delete in a finally block, and a delete failure never masks the primary upload/download-comparison result — verified by a dedicated test"
  - "verifyPublicAccessDisabled treats any non-200 response, unparseable body, or missing/non-false 'enabled' field as FAIL, never a silent PASS or a crash — only the simultaneous absence of both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN produces SKIPPED"

requirements-completed: [MIG-03]

duration: 45min
completed: 2026-08-06
---

# Phase 187 Plan 02: R2 Verification Script and MIG-03 Provisioning Record Summary

**`scripts/r2-verify.ts` / `npm run verify:r2` makes MIG-03 (five R2 buckets, scoped token, public access disabled) demonstrable on demand instead of a remembered fact — bucket reachability, credential-scope inversion check, five read/write round-trips, and a Cloudflare-API public-access assertion that reports SKIPPED (never a silent PASS) without both `CLOUDFLARE_*` vars.**

## What this plan does NOT do (by design)

The five R2 buckets and the scoped Account API token already existed before this plan started (provisioned 2026-08-06, per `CONTEXT.md`). This plan creates the **repeatable assertion** that they are still exactly as provisioned — it does not create, rename, or delete any bucket or token, and `lib/storage/s3-provider.ts` / `lib/storage/index.ts` were not touched (`git diff --stat` empty for both, verified after every commit).

## The check list the script runs

Running `npm run verify:r2` performs, in order:

1. **`verifyBuckets`** — `HeadBucketCommand` against all five buckets (`audio`, `photos`, `pdfs`, `logos`, `platform-brand`). A 200 is reachable+readable; a rejection captures the SDK error `name` in the result's `detail`, never just a boolean.
2. **`verifyScope`** — `HeadBucketCommand` against a bucket outside the five (default `xtimator`, the already-deleted smoke bucket; overridable via `process.argv[2]`). **The pass/fail is inverted on purpose**: a denial (`AccessDenied`/`NotFound`) is `ok: true` ("correctly denied"); a success is `ok: false` ("token reaches a bucket outside the allowlist"). This is the check that would catch a credential quietly widening later.
3. **`verifyRoundTrip`** — for each of the five buckets: upload a tiny text payload via the untouched `createS3StorageProvider`, get a 60-second signed URL, download, compare content, delete — always deletes in a `finally`, even when an assertion above it failed.
4. **`verifyPublicAccessDisabled`** — for each of the five buckets, calls Cloudflare's `GET /accounts/{id}/r2/buckets/{bucket}/domains/managed` and asserts the managed-domain `enabled` field is exactly `false`. Runs only when both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set inline; otherwise the result is `{ ok: true, skipped: true, ... }` — rendered as `[SKIP]` in the report, never `[PASS]`.

## The exact exit-code contract

- `s3ConfigFromEnv()` returns `null` (any of the four `S3_*` vars missing/empty) → prints a message identifying that `S3_*` config is incomplete (deliberately not naming the individual var literals — see Decisions) and calls `process.exit(1)` **before any S3 call is attempted** — proven by a test that asserts zero `aws-sdk-client-mock` calls occurred in this path.
- Otherwise: runs all checks, prints a `[PASS]`/`[FAIL]`/`[SKIP]`-per-line report plus a summary line, then `process.exit(allPassed ? 0 : 1)`, where `allPassed = results.every(r => r.ok)`. A `skipped: true` entry has `ok: true` (it does not fail the run) but is rendered `[SKIP]`, never `[PASS]`.
- Importing the module (as the test file does, and as any future script that wants to reuse the exported helpers would) performs **zero** S3 calls and touches `process.exit` **zero** times — verified by a dedicated test with `process.exit` spied and the S3 mock's call count asserted to be `0` immediately after `await import(...)`.

## Whether the operator ran it against real credentials

**Not run against real credentials in this session.** Per `CONTEXT.md`, the R2 credentials live deliberately outside this repo/environment (operator's scratchpad, not `.env.local`, not Coolify) — this executor has no access to them, and `.env.local` was confirmed to contain no `S3_*`/`CLOUDFLARE_*` lines before proceeding. What was verified in this session instead:

- `npm run verify:r2` **was executed** with the real npm script wiring, with `S3_*` explicitly unset — it correctly printed the "not configured" message and exited `1` without throwing an SDK error or making any network call. This proves the exit-code contract and the "no crash on missing config" behavior end-to-end through the actual npm entry point, just not the real-credential success path.
- The real-credential run (all five buckets PASS, scope PASS, five round-trips PASS, public-access PASS/SKIPPED) is **SKIPPED** in this report, per the plan's own `<verification>` section marking it "Operator-run … not part of CI." It remains to be run by whoever holds the credential, using the runbook now recorded in `docs/STORAGE-MIGRATION.md`.

## Verify-gate self-audit (per execution instructions)

Both automated gates in this plan were proven capable of failing before being trusted:

- **Task 1** (`npx vitest run tests/unit/storage/r2-verify.test.ts`): this is a real test run with a real non-zero exit on failure — directly observed failing once during authoring (a `toMatchObject({ skipped: undefined })` assertion failed against a result object that simply omits the key), then fixed and re-run green. Not a gate that can silently pass.
- **Task 2**'s three checks were each proven against a deliberately bad input before being trusted:
  - `node -e "if(!s['verify:r2']) ...exit(1)"` — run against a stand-in object without the key → exited 1, confirmed.
  - `grep -rniE "r2\.cloudflarestorage\.com" ... | grep -qv "<account-id>"` (the anti-leak gate) — run against a temp file containing a real-looking, non-placeholder R2 endpoint → correctly detected it (`grep -qv` found a line without the placeholder, `if` branch fired). Then run against the real `docs/STORAGE-MIGRATION.md`, where the only occurrence is the placeholder line → passed cleanly.
  - `grep -c "S3_ACCESS_KEY_ID" scripts/r2-verify.ts` (the mapping-duplication gate from Task 1's done criteria) — run against a temp copy of the script with that literal string appended → returned `1` (would fail the check); run against the real file → returned `0`.

No `&&...|| echo ok` short-circuit shape and no `!`-under-`set -e` negation was used anywhere in this plan's verification.

## Task Commits

1. **Task 1: r2-verify script — reachability, scope, round-trip, public-access** — `86fefd10` (feat) — `scripts/r2-verify.ts`, `tests/unit/storage/r2-verify.test.ts` (20 tests, all green)
2. **Task 2: npm entry point and the MIG-03 provisioning record** — `3969e63e` (docs) — `package.json` (`verify:r2` script), `docs/STORAGE-MIGRATION.md` (MIG-03 section)

## Files Created/Modified

- `scripts/r2-verify.ts` — the verification script; exports `EXPECTED_BUCKETS`, `CheckResult`, `verifyBuckets`, `verifyScope`, `verifyRoundTrip`, `verifyPublicAccessDisabled`, `formatReport`, `main`
- `tests/unit/storage/r2-verify.test.ts` — 20 tests covering every exported function via `aws-sdk-client-mock` and `vi.stubEnv`/`vi.stubGlobal('fetch', ...)`, zero real credentials
- `package.json` — added `"verify:r2": "npx tsx scripts/r2-verify.ts"`
- `docs/STORAGE-MIGRATION.md` — new `### MIG-03 — provisioning record and re-verification (Phase 187)` section: the five-bucket table, the token's deliberate absence from `.env.local`/Coolify, the Phase-191 Coolify caution (~41 wasted presigns/warns per cold visit until objects are copied), and the placeholder-only re-verification runbook

## Decisions Made

- **The "missing config" message names the class of vars, not each literal name.** The plan's Task 1 `<action>` asked for "a message naming the missing var," but the same task's `<done>` criteria (and the file's own docblock intent) require zero occurrences of the literal string `S3_ACCESS_KEY_ID` in `scripts/r2-verify.ts` — enumerating all four var names would necessarily include that one. Resolved by pointing the operator at `lib/storage/s3-config.ts` ("see … for the exact list") instead of repeating the names, which keeps the single-source-of-truth guarantee real rather than nominal.
- **`verifyRoundTrip`'s delete always runs in `finally`, and a delete failure never overwrites the primary result** — covered by a dedicated test where `DeleteObjectCommand` rejects but the function still reports the earlier content-mismatch failure, not a delete-related one.
- **`verifyPublicAccessDisabled` treats every non-`{enabled: false}` outcome as FAIL**, including HTTP non-200, an unparseable JSON body, and a present-but-non-`false` `enabled` field — never a silent pass on ambiguity. Only the simultaneous absence of both Cloudflare env vars produces `SKIPPED`.

## Deviations from Plan

None — plan executed as written. The "missing config message" phrasing above is a clarification of ambiguous plan wording (Rule 1-style resolution of a plan-internal near-contradiction, same class as Plan 01's `STORAGE_PROVIDER` resolution), not a scope change.

## Issues Encountered

None. `npx tsc --noEmit` is clean; `npx vitest run tests/unit/storage` is 136/136 green across all 8 files in that directory (post-Phase-187-Plan-01 total, including this plan's 20 new tests).

## User Setup Required

**To close the loop on Success Criterion 5 with real credentials:** run the re-verification runbook now recorded in `docs/STORAGE-MIGRATION.md` (`### MIG-03 — provisioning record and re-verification`) with the real R2 + Cloudflare credentials from your scratchpad. Expected: all five buckets PASS, scope check PASS, five round-trips PASS, public-access PASS (or SKIPPED if you omit the two `CLOUDFLARE_*` vars). This was not run in this session — no credential was available to this executor, by design (see CONTEXT.md).

## Next Phase Readiness

- `npm run verify:r2` is the durable, re-runnable proof of MIG-03 for Phase 191 (object copy) to check its starting baseline against, and for Phase 192 (cache-HIT proof) to re-confirm buckets are still correctly scoped before wiring `S3_*` into Coolify.
- No stubs: every exported function in `scripts/r2-verify.ts` is fully implemented, not a placeholder — the only "not yet done" item is the operator's one-time real-credential run, which is explicitly a user-setup step, not a code gap.
- `lib/storage/s3-provider.ts` and `lib/storage/index.ts` remain byte-identical to before this plan (`git diff --stat` empty for both).

---
*Phase: 187-r2-provisioning-same-origin-asset-proxy*
*Completed: 2026-08-06*

## Self-Check: PASSED

Both created files (`scripts/r2-verify.ts`, `tests/unit/storage/r2-verify.test.ts`) confirmed present on disk; both task commits (`86fefd10`, `3969e63e`) confirmed present in git history.
