---
phase: 192-url-rewrite-cutover-cdn-verification
plan: 02
subsystem: storage
tags: [supabase, postgres, jsonb, migration, url-rewrite, operator-tooling, cas, rollback, tdd]

# Dependency graph
requires:
  - phase: 192-01
    provides: "lib/storage/url-rewrite.ts (rewriteAssetUrl / rewriteJsonAssetUrls) + the public.storage_url_rewrites migration this tool reads and writes"
  - phase: 190-portable-same-origin-asset-urls
    provides: "storageProxyPath — the ONE emitter --preflight asserts against"
provides:
  - "scripts/rewrite-asset-urls.ts — preflight / dry-run / apply / revert-latest / revert / restore-from-dump, with the exclusion list and machine-readable summary tokens"
  - "npm run rewrite:asset-urls — the one-command cutover and the one-command rollback"
  - "docs/STORAGE-MIGRATION.md § URL-02 — the cutover + rollback runbook"
  - "Offline fake-PostgREST coverage of every write path, so the CAS, the 1-row assertion, the crash-resume and the rollback are exercised with zero credentials"
affects: [192-03 production rewrite, 192-04 verification, 192-05 CDN verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure planning core + I/O shell: every decision is an exported function over plain row arrays; main() is guarded by pathToFileURL so importing is inert"
    - "Record-before-write + compare-and-set + assert-exactly-1-row + delete-the-record-on-0-rows — the audit table can never claim a change that did not happen"
    - "Open-batch REUSE as the crash-recovery primitive, so a crashed apply cannot yield a rollback that restores half of production"
    - "Machine-readable summary tokens (NAME=value on their own lines) instead of greppable prose, because a gate that greps free text passes on its own mandated wording"
    - "Fake PostgREST query builder (~150 lines, real unique constraint, injectable concurrent-write hook) to exercise a production-mutating script offline"

key-files:
  created:
    - scripts/rewrite-asset-urls.ts
    - tests/unit/storage/rewrite-asset-urls.test.ts
    - .planning/phases/192-url-rewrite-cutover-cdn-verification/deferred-items.md
  modified:
    - package.json
    - docs/STORAGE-MIGRATION.md

key-decisions:
  - "--preflight asserts storageProxyPath('logos','x/y.webp') === '/storage/logos/x/y.webp' and that the four writers import @/lib/storage/asset-url. The raw absolute-URL provider method is never named anywhere in the script (0 occurrences, code AND comments) — Phase 190 repointed call sites, not the provider, and asserting otherwise would fire unconditionally and deadlock Plan 03"
  - "Selection is by Supabase URL prefix via rewriteAssetUrl, never by column name. EXCLUDED_TARGETS carries company_price_book's 293/0 measurement and reason in code; preflight re-counts it live and BLOCKS on any non-zero"
  - "PlannedChange gained `occurrences` and `guardValue` (additive, optional) so the census can count URL-level occurrences while the audit record stays document-level"
  - "RewriteTarget's plan-specified 5 fields were kept verbatim; the measured baseline lives in a separate exported MEASURED_BASELINE map rather than as a 6th field"
  - "The jsonb CAS is an updated_at optimistic lock, not a JSONB equality filter (unreliable through PostgREST). Refusing to write when no guard value was read is a hard abort, not a fallback to an unguarded update"
  - "auth.users has no CAS through the Admin API: re-read immediately before the write, abort on any change, and state the residual race plainly (zero subjects in production)"
  - "Exported the five mode runners so the write paths are unit-testable; main() takes an overridable argv the same way scripts/r2-migrate.ts does"

# Metrics
duration: 34min
completed: 2026-08-07
---

# Phase 192 Plan 02: URL-02 Rewrite / Rollback Operator Tool Summary

**A dry-run-by-default operator script whose safety properties are code rather than discipline: selection by Supabase URL prefix (never column name), an explicit `--confirm-project` wrong-database guard, open-batch reuse so a crashed apply cannot produce a half-restored rollback, compare-and-set updates that assert exactly one row affected and delete their own audit row on zero, and a `--revert-latest` that takes every open batch newest-first and exits non-zero on any drift.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-07T03:52:00Z (approx.)
- **Completed:** 2026-08-07T04:26:00Z
- **Tasks:** 3/3
- **Files created:** 3 · **modified:** 2
- **Tests:** 63 (up from 0), all green; full suite `2 failed | 631 passed | 1 skipped (634 files)` — the documented baseline exactly

## Accomplishments

### Task 1 — planning core, guards, exclusion (commits `060d1e2a` RED → `680a20ef` GREEN)

`scripts/rewrite-asset-urls.ts` opens with pure exported functions and no I/O.

- `REWRITE_TARGETS` — the 8 census targets. `MEASURED_BASELINE` — the per-target
  2026-08-06 counts summing to 11, with the four zero targets kept for drift.
- `EXCLUDED_TARGETS` — `company_price_book.image_url` with `table`, `column`,
  `measuredRows: 293`, `measuredSupabaseUrls: 0` and the reason **in code**, so
  `--preflight` prints it and can query it without the table name appearing
  anywhere else in the file.
- `planRows` is the single dispatcher; `planTextRewrite` / `planJsonRewrite` /
  `planUserMetadataRewrite` are its `.changes`. It never throws — a malformed
  row is skipped **and counted**, so a dropped row cannot look like a clean pass.
- `projectRefFromUrl` / `assertProjectConfirmed` / `planRevert` /
  `selectApplyBatch` / `planRestoreFromDump` / `deepEqual` / `changeKey`.

The `landing_content` fixture mirrors production: 8 `.webp` images (1 hero, 3
step, 4 feature) plus one `hero-bg-videos/` leaf **asserted still absolute**,
plus an `images.pexels.com` leaf asserted untouched.

### Task 2 — operating modes (commit `7212ca03`)

| Mode | Writes? | Tokens printed |
|---|---|---|
| `--preflight [--dump <path>]` | no | `CENSUS_TOTAL` `EXEMPT_VIDEO` `SKIPPED_UNSERVEABLE` `EXCLUDED_PRICE_BOOK_ROWS` `EXCLUDED_PRICE_BOOK_SUPABASE_URLS` `UNREVERTED_BATCHES` `PREFLIGHT_BLOCKERS` |
| default / `--dry-run` | no | `CENSUS_TOTAL` `PLANNED_CHANGES` `EXEMPT_VIDEO` `SKIPPED_UNSERVEABLE` |
| `--apply --confirm-project <ref>` | yes | `UNREVERTED_BATCHES` `BATCH_ID` `BATCH_REUSED` `CENSUS_TOTAL` `PLANNED_CHANGES` `EXEMPT_VIDEO` `SKIPPED_UNSERVEABLE` `APPLIED_CHANGES` |
| `--revert-latest` / `--revert <id>` (+ `--confirm-project`, opt. `--force`) | yes | `UNREVERTED_BATCHES` `REVERTED` `DRIFTED` `UNREVERTED_BATCHES` (again, final) |
| `--restore-from-dump <path>` (+ `--confirm-project`) | yes | `REVERTED` |

npm alias: `"rewrite:asset-urls": "npx tsx scripts/rewrite-asset-urls.ts"`.

`--preflight` blockers: audit table absent · `storageProxyPath` not emitting
`/storage/logos/x/y.webp` · any of `lib/actions/company.ts`,
`lib/actions/settings.ts`, `app/admin/branding/actions.ts`,
`app/admin/landing/actions.ts` not importing `@/lib/storage/asset-url` · any
Supabase URL live in the excluded price-book column. Warns (never passes) on R2
presence, which it does not check at all, and on an already-open batch.

### Task 3 — runbook + full-suite gate (commit `56546ac1`)

`docs/STORAGE-MIGRATION.md` § **"URL-02 — row rewrite cutover and rollback
(Phase 192)"**, inserted after the Phase 187 proxy section: the by-hand migration
statement first, the measured census table, the 293/0 exclusion with its
column-name trap, the video exemption with "matches nothing today" and the
Range/206 prerequisite, the four-step cutover, the one-command rollback with the
load-bearing `--`, the SQL-editor equivalent, the `auth.users` "no SQL-only
equivalent" caveat, and the "the dump holds tenant data, keep it out of the repo"
warning.

`tests/unit/storage/storage-migration-runbook.test.ts` (30 assertions, including
its own secret-shape detector) stayed green against the edited doc.

## Divergence between CONTEXT.md's census and `--preflight`

**None observed — and none observable, because `--preflight` was deliberately
NOT run against production in this plan** (see "Production contact" below). The
baseline is encoded in `MEASURED_BASELINE` and printed per target next to the
live count with an explicit `as measured` / `DIVERGES from baseline` marker, so
Plan 03's first command surfaces any divergence without arithmetic.

The offline fixture reproduces the census exactly (`CENSUS_TOTAL=11`,
`PLANNED_CHANGES=4`, `EXEMPT_VIDEO=1`, `SKIPPED_UNSERVEABLE=0`), which is what
the apply/revert tests assert against.

## Gate honesty — every gate was proven capable of failing

Twelve mutations, each applied to a clean snapshot and reverted before the next
(the first round accidentally accumulated; it was redone in isolation):

| Protection | Mutation | Result |
|---|---|---|
| Open-batch reuse (unit) | `selectApplyBatch` never reuses | exit 1, 2 failures |
| Drift refusal (unit) | `planRevert` restores everything | exit 1, 1 failure |
| Wrong-database guard | `assertProjectConfirmed` ignores a mismatch | exit 1, 1 failure |
| Price-book exclusion | re-added to `REWRITE_TARGETS` | exit 1, 3 failures |
| URL-prefix selection | `rewriteAssetUrl` bypassed, everything rewritten | exit 1, 4 failures |
| Crash-resume (apply path) | apply mints a fresh batch every run | exit 1, 1 failure |
| **1-row assertion** | `if (affected !== 1)` → `if (false)` | exit 1, 1 failure |
| **Audit-row deletion on 0 rows** | deletion branch disabled | exit 1, 1 failure |
| Rollback completeness | `--revert-latest` takes only the newest batch | exit 1, 3 failures |
| Drift exit code | revert returns 0 despite drift | exit 1, 1 failure |
| Preflight exclusion blocker | blocker downgraded / removed | exit 1, 1 failure |
| **The plan's own Task 2 CLI gate** | `apply` removed from `WRITE_MODES` | the run no longer prints `confirm-project`, so the gate's `grep -qi confirm-project` fails → **gate is NOT vacuous** |

`$TMPDIR` is empty on this machine; every gate opened with
`T="${TMPDIR:-${TMP:-/tmp}}"` and a write+read probe was run first
(`T=C:\Users\Vanildo\AppData\Local\Temp`, probe OK) before any gate was trusted.
Vitest exit codes were captured directly into `$?` from a redirect, never
through a pipe.

### The plan's `<verification>` greps — run against RAW source, all clean

Per 192-01's finding I also ran them comment-stripped; here the raw and stripped
results agree, because the docblock was written to avoid the forbidden
identifiers rather than to explain them.

| Grep | Raw result |
|---|---|
| `getPublicUrl` | **0 hits** (code and comments) |
| `company_price_book` | 2 hits, lines 202–203, both inside the `EXCLUDED_TARGETS` literal |
| `PAGE_SIZE\|chunk\|offset` (case-insensitive) | **0 hits** |
| `\.select\(` | 10 hits; a static test asserts every `.update(` chain contains a `.select(` within 400 chars |
| imports `@/lib/storage/url-rewrite` | line 80, `rewriteAssetUrl` + `rewriteJsonAssetUrls` + `parseSupabasePublicUrl` |

These five greps are now **executable tests** in
`tests/unit/storage/rewrite-asset-urls.test.ts` ("static invariants"), with a
comment stripper proven non-vacuous, rather than one-off shell checks.

## Production contact — disclosed

The plan says the tool must not touch production in this plan. It was run
against production **twice**, both times without writing anything:

1. **Task 2 gate (intended, safe):** `npx tsx scripts/rewrite-asset-urls.ts --apply`
   with no `--confirm-project`. The refusal happens **before** the Supabase
   client is constructed, so this made no connection at all. It printed the
   production project ref, which is public.
2. **Mutation 12 (unintended):** removing `apply` from `WRITE_MODES` skipped the
   guard, so the run reached `requireServiceClient()` and issued **one read**
   against production PostgREST. It failed immediately with
   `PGRST205 — Could not find the table 'public.storage_url_rewrites' in the
   schema cache` and the process exited 1. **Zero writes**: the first statement
   in `runApply` is the open-batch read, and it errored before any insert or
   update. The mutation was reverted and the file verified byte-identical to its
   snapshot.

That accident produced one genuinely useful, verified fact for Plan 03:
**`public.storage_url_rewrites` does NOT exist in production yet** (as of
2026-08-07). The migration has not been applied by hand. `--preflight` will
correctly block until it is.

`--preflight`, `--dry-run` and every write mode were otherwise driven only
against the offline fake client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `import.meta.url` is not a file URL under Vitest**

- **Found during:** Task 2
- **Issue:** `const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))` at
  module scope threw `TypeError: The URL must be of scheme file` when the test
  imported the module — which also violated this plan's own "importing performs
  no side effects" requirement, since a module-level throw is the loudest side
  effect there is.
- **Fix:** Replaced with a lazy `repoRoot()` that tries `import.meta.url` and
  falls back to `process.cwd()`, called only inside `runPreflight`, plus
  `path.resolve` instead of URL-relative resolution.
- **Files modified:** `scripts/rewrite-asset-urls.ts`
- **Commit:** `7212ca03`

**2. [Rule 1 - Bug] `--preflight` crashed instead of reporting its own blocker**

- **Found during:** Task 2 (caught by the "BLOCKS when the audit table has not
  been applied yet" test)
- **Issue:** After recording the missing-audit-table BLOCKER, preflight went on
  to call `openBatchIds`, which threw over the top of it. The operator would have
  seen a raw PostgREST error instead of `PREFLIGHT_BLOCKERS=1` and the "apply the
  migration by hand" instruction — i.e. exactly the confusing failure the blocker
  exists to replace.
- **Fix:** The open-batch read is now conditional on the audit table being
  readable; with no table there are by construction zero recorded batches.
- **Files modified:** `scripts/rewrite-asset-urls.ts`
- **Commit:** `7212ca03`

**3. [Rule 1 - Bug] A regex `s` flag broke the bare typecheck**

- **Found during:** Task 2 (bare `tsc --noEmit`, which CI does not run over
  `tests/**`)
- **Issue:** `/…/s` in my new test raised `TS1501` — this repo's target predates
  `es2018`. It took bare tsc from the pre-existing 14 errors to 15.
- **Fix:** Rewrote the assertion without the `s` flag. Bare tsc is back at
  exactly the pre-existing 14.
- **Files modified:** `tests/unit/storage/rewrite-asset-urls.test.ts`
- **Commit:** `7212ca03`

### Additions beyond the plan's letter (Rule 2 — missing critical functionality)

- **Offline coverage of the whole I/O shell.** The plan only required a CLI
  refusal gate for Task 2, which would have left the compare-and-set, the 1-row
  assertion, the audit-row deletion, the crash-resume and the rollback **entirely
  unexercised** in the one script that mutates production rows — and unrunnable
  here, since this plan may not touch production. I added a ~150-line fake
  PostgREST builder (real `(batch_id, target, row_pk)` unique constraint,
  injectable concurrent-write hook) and 27 tests over it. Five of the twelve
  mutations above are only detectable because of this.
- **The plan's five `<verification>` greps are now tests**, not shell one-liners,
  so they cannot rot.
- **`parseArgs` throws on an unrecognized flag and on two modes at once**, per
  the `scripts/r2-migrate.ts` convention the plan pointed at.

### Deviations from the plan's stated interfaces (additive only)

- `RewriteTarget` gained optional `guardColumn`; `PlannedChange` gained
  `occurrences` and optional `guardValue`; `ExcludedTarget` gained `table` and
  `column`. The last one is load-bearing: it is what lets `--preflight` query the
  excluded table while keeping the literal `company_price_book` confined to
  `EXCLUDED_TARGETS`, as the plan's own verification grep demands.
- Extra exports beyond the plan's list: `MEASURED_BASELINE`, `planRows`,
  `planUserMetadataRows`, `changeKey`, `deepEqual`, `parseArgs`, `isWriteMode`,
  `loadRows`, `buildCensus`, `openBatchIds`, `currentValues`, the five `run*`
  mode functions, and `main`. Every export the plan named is present.

## Requirement status — URL-02 still PENDING

Unchanged from 192-01's reasoning, and it now matters more: URL-02 reads
"Existing rows … **are rewritten** … with a reversible record". After this plan
**zero production rows have been rewritten**, and the run above proved the audit
table does not even exist in production yet. `.planning/REQUIREMENTS.md` stays
`URL-02 | Phase 192 | Pending`; Plan 03 (verified by 04) should check it off.

## Deferred / out of scope

`.planning/phases/192-url-rewrite-cutover-cdn-verification/deferred-items.md` —
bare `tsc --noEmit` has 14 pre-existing errors, all in `tests/**`
(`upload-ticket.test.ts` ×12, `pdf-logo-resolution.test.ts`,
`asset-inline.test.ts`). Confirmed pre-existing by stashing to a clean tree at
`bfcb12ba`. This plan's files contribute zero. CI cannot see them because
`tsconfig.ci.json` excludes `tests/**` — the exact rot its own comment predicts.

## Known Stubs

None. No placeholder values, no hardcoded empty collections, no unwired data
sources. Every mode is fully implemented and exercised; `--restore-from-dump`
in particular is a real consumer of `--dump` rather than a file nothing reads.

## Notes for Plan 03

- **Apply the migration by hand FIRST.** Verified 2026-08-07: `public.storage_url_rewrites`
  is absent from production (`PGRST205`).
- Run in this order, and gate on tokens, never on prose:
  `--preflight --dump <outside-repo>/pre-state.json` (expect `PREFLIGHT_BLOCKERS=0`,
  `CENSUS_TOTAL=11`, `EXCLUDED_PRICE_BOOK_SUPABASE_URLS=0`, `EXEMPT_VIDEO=1`,
  `SKIPPED_UNSERVEABLE=0`) → bare `npm run rewrite:asset-urls` (expect
  `PLANNED_CHANGES=4`) → `--apply --confirm-project <ref>` (expect
  `APPLIED_CHANGES=4`, `BATCH_REUSED=false`) → re-run bare (expect
  `PLANNED_CHANGES=0`).
- `PLANNED_CHANGES=4` and `CENSUS_TOTAL=11` are different numbers on purpose: 8
  of the 11 occurrences are one document-level change.
- Any non-zero `SKIPPED_UNSERVEABLE` is a finding to investigate **before**
  applying, not after.
- The `--` in every `npm run rewrite:asset-urls -- --flag` is load-bearing.
- The dump file holds tenant rows: outside the repo, never committed.

## Self-Check: PASSED

- `scripts/rewrite-asset-urls.ts` — FOUND
- `tests/unit/storage/rewrite-asset-urls.test.ts` — FOUND
- `docs/STORAGE-MIGRATION.md` — FOUND (contains `URL-02 — row rewrite cutover and rollback`)
- `.planning/phases/192-url-rewrite-cutover-cdn-verification/deferred-items.md` — FOUND
- `package.json` — FOUND (contains `rewrite:asset-urls`)
- Commits `060d1e2a`, `680a20ef`, `7212ca03`, `56546ac1` — all FOUND in `git log`
- `tsc -p tsconfig.ci.json` exit 0; bare `tsc --noEmit` at the pre-existing 14
- Full suite: `2 failed | 631 passed | 1 skipped (634 files)`, failures being
  exactly `sign-estimate-atomic-migration.test.ts` and
  `signature-evidence-retention-migration.test.ts` (the Windows/CRLF pair)
