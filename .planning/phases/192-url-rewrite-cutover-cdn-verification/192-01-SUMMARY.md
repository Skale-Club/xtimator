---
phase: 192-url-rewrite-cutover-cdn-verification
plan: 01
subsystem: storage
tags: [supabase, postgres, jsonb, migration, url-rewrite, r2, same-origin, tdd]

# Dependency graph
requires:
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "The asset proxy route + proxy-policy (PROXY_BUCKETS, normalizeProxyKey) this rewrite targets"
  - phase: 190-portable-same-origin-asset-urls
    provides: "storageProxyPath / PERSISTABLE_PROXY_BUCKETS / isStorageProxyPath — the ONE emitter, delegated to here; plus the hero-bg-videos writer exemption this module mirrors"
provides:
  - "public.storage_url_rewrites — the URL-02 reversible-record table (migration authored, NOT yet applied)"
  - "lib/storage/url-rewrite.ts — pure Supabase-public-URL parser, exemption rules, and key-agnostic JSONB deep walk"
  - "Proven idempotency (fixed point) and a positively-tested video exemption, offline, before any production row is touched"
affects: [192-02 apply/revert scripts, 192-03 production rewrite, 192-05 CDN verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk-rewriter/writer contract reconciliation: the writer throws, the bulk rewriter converts the throw into a counted `unserveable` flag and never aborts the run"
    - "Literal-bucket emission table (Record<PersistableProxyBucket, fn>) instead of a cast — keeps 'only persistable buckets are persisted' a STATIC property"
    - "Key-agnostic JSONB deep walk: value-level rewrite of every string leaf, never a document-level substitution or a field-path enumeration"

key-files:
  created:
    - supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql
    - lib/storage/url-rewrite.ts
    - tests/unit/storage/url-rewrite.test.ts
    - tests/unit/storage/phase192-rewrite-migration.test.ts
  modified: []

key-decisions:
  - "old_value/new_value are jsonb (not text) so a scalar column, a whole JSONB document and a whole user_metadata object record identically; the restore guarantee is DEEP-EQUAL, not byte-exact, because jsonb does not preserve key order"
  - "new_value is stored so Plan 02's revert can refuse to clobber a row that drifted after the rewrite"
  - "The gate is PERSISTABLE_PROXY_BUCKETS (3), never isProxyBucket (5) — persisting an audio/ or pdfs/ path is the exact hole canReadPrivateKey exists to prevent"
  - "hero-bg-videos/ is EXEMPT, matched on key PREFIX not file extension — mirrors Phase 190's writer exemption (proxy has no Range/206; Safari refuses such a <video>)"
  - "storageProxyPath is delegated to, never reimplemented; its by-design throw becomes { unserveable: true } so one bad legacy row cannot abort a production run"
  - "Replaced `parsed.bucket as PersistableProxyBucket` with a literal-bucket emission table after the Phase 190 static gate caught the cast"

patterns-established:
  - "Mutation-verified gates: every gate in this plan was proven capable of failing by deliberately breaking the thing it guards, then restoring"
  - "CRLF-insensitive migration-shape tests (normalize \\r\\n and lowercase before asserting) so new tests never join this repo's Windows-only failing set"

requirements-completed: []  # URL-02 deliberately NOT marked complete — see "Requirement status" below

# Metrics
duration: 22min
completed: 2026-08-06
---

# Phase 192 Plan 01: Reversible Record & URL Translation Module Summary

**A `storage_url_rewrites` audit table that can restore a scalar column, a whole JSONB document or a whole `user_metadata` object from data alone, plus a pure, offline-tested URL translation module that is idempotent, delegates all path construction to `storageProxyPath`, refuses `audio`/`pdfs`, and leaves the hero background video absolute.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-07T03:28:00Z
- **Completed:** 2026-08-07T03:50:13Z
- **Tasks:** 3/3
- **Files created:** 4 (984 lines total)

## Accomplishments

### Task 1 — `public.storage_url_rewrites` (commit `50464d13`)

**Migration filename chosen: `supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql`** — the name the plan specified was free (the newest existing migration was `20260729000002`, and no `20260806*` file existed), so no slot bump was needed. **Plan 03 applies this by hand.**

The table stores the FULL previous value, not a per-field patch, which is what makes the restore exact and single-statement. Three indexes (batch lookup, partial open-batch for Plan 02's crash-recovery read, and a `(batch_id, target, row_pk)` unique index so the crash-resume path cannot double-record). RLS enabled with **no policies**, matching the `platform_integrations` convention. The file carries its own rollback and, twice, the warning that **this repo applies migrations to production BY HAND — the deploy pipeline never runs them**.

Shape test: 13 assertions, all run against a `\r\n`-normalized, lowercased copy so it cannot join this repo's Windows-only failing set.

### Task 2 — `lib/storage/url-rewrite.ts` (commits `b4f343ff` RED → `ff594888` GREEN → `3b20cef1` fix)

57 tests, all green. Exports `parseSupabasePublicUrl`, `isExemptFromRewrite`, `rewriteAssetUrl`, `rewriteJsonAssetUrls`.

The `landing_content` fixture mirrors production exactly: **8 `.webp` images (1 hero, 3 step, 4 feature) plus a `hero-bg-videos/` leaf asserted UNCHANGED and still absolute** — `changed: 8, exempt: 1, unserveable: 0`.

Emitted paths are compared against **real `storageProxyPath` output** across an 8-case key matrix (spaces, `+`, `%`, non-ASCII, `#?&`, extension-less), never against string literals.

### Task 3 — full-suite gate

Typecheck (`tsc -p tsconfig.ci.json`) exit 0. Full `vitest run tests/unit tests/eval`: **2 failed | 630 passed | 1 skipped (633 files)** — exactly the documented baseline.

## Baseline failing-file set (recorded for Plans 02 and 05)

| File | Cause | Mine? |
|---|---|---|
| `tests/unit/sign-estimate-atomic-migration.test.ts` | Windows CRLF — asserts `/LANGUAGE plpgsql\nSECURITY DEFINER/` against a file on disk holding `\r\n`. Green in CI. | No (pre-existing) |
| `tests/unit/signature-evidence-retention-migration.test.ts` | Same CRLF class. Green in CI. | No (pre-existing) |

Neither log references `url-rewrite` or `storage_url_rewrites` (grep count: 0). `tests/unit/demo/mutation-boundary-sweep.test.ts` is **green with no manifest edit** — this plan adds no route handler. `mcp-route-contract.test.ts` and `actions/team-invite.test.ts` did not fail in this run.

## Requirement status — URL-02 left PENDING on purpose

`requirements mark-complete URL-02` was run per the standard executor flow and **I reverted it**. URL-02 reads "Existing rows … **are rewritten** to the new form, with a reversible record of what changed." After this plan, **zero production rows have been rewritten** and the migration is not even applied. The requirement is claimed by plans **01, 02, 03 and 04** of this phase; the plan that actually rewrites production data (03, verified by 04) should be the one to check it off.

`.planning/REQUIREMENTS.md` is therefore unchanged: `URL-02 | Phase 192 | Pending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A cast defeated the very invariant the runtime check established**

- **Found during:** Task 3 (the full suite caught what the two per-task gates could not)
- **Issue:** `rewriteAssetUrl` called `storageProxyPath(parsed.bucket as PersistableProxyBucket, parsed.key)`. Phase 190's repo-wide static gate `tests/unit/storage/persisted-url-form.test.ts` fails any `storageProxyPath(` call whose first argument is not a **literal** persistable bucket, because "a variable bucket defeats the 'no persisted URL for a bucket with no defined viewer' invariant statically". The gate was right: the `as` cast asserted exactly what the runtime check was supposed to prove.
- **Fix:** Replaced with an `EMIT_BY_BUCKET: Record<PersistableProxyBucket, (key: string) => string>` table whose three entries each pass a literal bucket, plus an `isPersistableBucket` type guard that makes the table total. **No cast remains anywhere in the module**, and adding a fourth persistable bucket is now a compile error here rather than a silent pass-through.
- **Files modified:** `lib/storage/url-rewrite.ts`
- **Commit:** `3b20cef1`

**2. [Rule 1 - Bug] A doc comment baked a backend hostname into `lib/`**

- **Found during:** Task 3
- **Issue:** The same gate fails any line in `app/`/`lib/`/`components/` containing `supabase.co/storage/v1/object/public` — **comments included, deliberately**. The module header illustrated the input shape with a full literal URL.
- **Fix:** Host and path are now spelled separately in the header, with a note explaining why. The parser's own `SUPABASE_PUBLIC_PATH_PREFIX = '/storage/v1/object/public/'` constant never tripped the gate (it has no host glued to it) and was left as-is.
- **Files modified:** `lib/storage/url-rewrite.ts`
- **Commit:** `3b20cef1`

**3. [Rule 1 - Bug] My own `audio`/`pdfs` refusal tests passed vacuously**

- **Found during:** Task 2 (caught by mutation-testing my own gate, not by the suite)
- **Issue:** The tests asserted only `changed: false` and an untouched value. When I deliberately widened the bucket gate to all 5 proxy buckets, **the tests still passed** — because `storageProxyPath` then threw and the result came back as `unserveable: true`, which is also `changed: false`. The assertion could not distinguish "refused at the bucket gate" from "refused because the emitter blew up".
- **Fix:** The `audio`/`pdfs` tests now additionally require `unserveable` and `exempt` to be **falsy**, pinning the refusal to the bucket gate itself, plus a new JSONB-level case. Re-running the same mutation now produces 3 targeted failures.
- **Files modified:** `tests/unit/storage/url-rewrite.test.ts`
- **Commit:** `ff594888`

### Deviation from the plan's `<verification>` block (not fixed — reported)

Three of the plan's five verification greps are **satisfied in the executable code but return comment-only matches**, because the plan's own `<action>` text required the module to *document* these rules:

| Plan grep | Raw result | Code-body result |
|---|---|---|
| `server-only\|process\.env` | 1 hit — header says *"no `import 'server-only'`, no env read"* | clean |
| `'/storage/'` / `` `/storage/ `` | 2 hits — header markdown spans describing the proxy path shape | clean |
| `isProxyBucket` | 1 hit — the comment the plan **mandated**: *"NEVER `isProxyBucket` (5)"* | clean |

I verified the actual intent by re-running all five patterns against a **comment-stripped** copy of the module: `CODE_BODY_CLEAN` on every one, with the stripper itself proven non-vacuous (it still sees `storageProxyPath(` and no longer sees `DELIBERATE EXEMPTION`). I did **not** reword the documentation to make a naive grep pass — that would have deleted the exact warnings the plan asked for. Plans 02-05 should grep comment-stripped source if they reuse this check.

## Gate honesty — every gate was proven capable of failing

Per the standing instruction that gates must be able to fail and must be checked against their own mandated output:

| Gate | Mutation applied | Result |
|---|---|---|
| Migration shape test | `old_value jsonb` → `text` | exit 1, 1 test failed → restored, exit 0 |
| Video exemption | Deleted the `isExemptFromRewrite` branch | exit 1, **3** tests failed → restored |
| Persistable-bucket gate (1st attempt) | Widened set to 5 buckets | **exit 0 — VACUOUS**, test strengthened |
| Persistable-bucket gate (after fix) | Same mutation | exit 1, 3 targeted failures → restored |
| Full-suite file-count gate | n/a — observed live | Ran at `FAILED_FILES=3` before the tripwire fix (would have printed `GATE_FAIL`), `=2` after |
| `$TMPDIR` idiom | Probed first, per Task 1 | `T=C:\Users\Vanildo\AppData\Local\Temp`, write+read OK |

Vitest exit codes were captured directly into `$?` and never through a pipe; `tail`/`grep` only ever ran on the redirected log file after the exit code was recorded.

## Known Stubs

None. No placeholder values, no unwired data sources — this plan ships a migration and a pure module, both fully exercised by tests.

## Notes for Plan 02 / Plan 03

- `parseSupabasePublicUrl` returns the **decoded** raw key, which is what `storageProxyPath` expects.
- An empty inner segment (`.../logos//x.webp`) deliberately survives parsing and is reported as `unserveable` by the emitter, not silently dropped at parse time.
- `%2e%2e` cannot appear in a parsed key — the WHATWG `URL` parser folds double-dot segments away before this module ever sees them. The traversal fixture uses `%252e%252e`, which survives.
- `rewriteJsonAssetUrls` never mutates its input and caps recursion at depth 32, returning deeper subtrees untouched.
- Plan 02 should print `SKIPPED_UNSERVEABLE=<n>` and treat any non-zero as a finding to investigate **before** applying.

## Self-Check: PASSED

- All 4 created files verified present on disk.
- All 4 commits verified present in `git log`: `50464d13`, `b4f343ff`, `ff594888`, `3b20cef1`.
- Typecheck exit 0; full suite failing-file count 2, matching the documented baseline exactly.

## Uncommitted work NOT mine (flagged for the orchestrator)

`192-01` through `192-05-PLAN.md` were already modified-but-uncommitted in the working tree when this executor started (the adversarial-check revisions, +1014/-792 across 5 files). I did not author, stage, or commit them; they remain uncommitted so their author can review and commit them deliberately.
