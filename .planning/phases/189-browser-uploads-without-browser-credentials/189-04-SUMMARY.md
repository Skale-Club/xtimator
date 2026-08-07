---
phase: 189-browser-uploads-without-browser-credentials
plan: 04
subsystem: testing
tags: [storage, upload-ticket, r2, supabase-storage, static-analysis, typescript-ast, content-type, cors]

# Dependency graph
requires:
  - phase: 189-01
    provides: "lib/storage/upload-ticket.ts (mintUploadTicket, deriveUploadKey, assertKeyInTenant)"
  - phase: 189-02
    provides: "POST /api/storage/upload-ticket — the caller-authorization route"
  - phase: 189-03
    provides: "lib/storage/browser-upload.ts (uploadViaTicket/requestUploadTicket) and the three migrated call sites"
provides:
  - "tests/unit/storage/browser-credential-gate.test.ts — permanent CI gate: a static transitive import-graph closure walk from every 'use client' entry point, proven capable of failing on a direct forbidden import, a 2-hop transitive import, and a credential-shaped literal"
  - "scripts/upload-ticket-smoke.ts — end-to-end content-type proof (ticketed write -> fetchStoredAsset read-back) for both an extensioned audio key and an extensionless logos key, plus an optional live-HTTP leg through the real /storage/ proxy route"
  - "docs/STORAGE-MIGRATION.md '## Phase 189' section — ticket contract, the R2 CORS-on-audio prerequisite (with the ExposeHeaders: etag detail), tenant-confinement contract, preserved resilience, what Phase 189 did not fix, and the presigned-PUT size-cap limitation"
affects: [190-portable-same-origin-asset-urls, 191-object-migration-verification, 192-r2-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static transitive-closure import-graph walk (ts.createSourceFile + manual specifier resolution) as a CI-speed alternative to a built-bundle grep, immune to the S3_* env being unset on every dev machine"
    - "Next.js Server Actions boundary awareness in a static analysis tool: a 'use server' module is a real compile-time RPC-stub boundary, so the walk must stop there rather than treat every lib/actions import as a client-reachable credential path"
    - "Type-only import elision in the same walk: import type {...} never reaches the browser, so a client component importing a server-only query module purely for its types is not a violation"
    - "Module-resolution redirect (Module._resolveFilename) to reuse vitest.config.ts's server-only -> empty.js stub inside a plain tsx script, via dynamic import() so the redirect is installed before the target module's own import 'server-only' line evaluates"

key-files:
  created:
    - tests/unit/storage/browser-credential-gate.test.ts
    - scripts/upload-ticket-smoke.ts
  modified:
    - docs/STORAGE-MIGRATION.md

key-decisions:
  - "Discovered mid-task that a naive 'use client' import-graph walk is red on ~150 legitimate call sites in this repo's real tree — Next.js Server Actions ('use server' files like lib/actions/recording.ts) compile to RPC stubs in client bundles, and dozens of client components import server-only query modules (lib/queries/estimate.ts etc.) purely via `import type`. Both are real Next.js compile-time behaviors, not repo bugs. Fixed the walk to stop at 'use server' boundaries and elide type-only imports rather than narrowing the forbidden-module list or excluding files — narrowing would have hidden the exact class of leak the gate exists to catch."
  - "ts.isImportCall exists at runtime but is not part of typescript's public .d.ts — vitest (esbuild, no type-check) accepted it, bare tsc did not. Replaced with the public equivalent: checking node.expression.kind === ts.SyntaxKind.ImportKeyword directly."
  - "upload-ticket-smoke.ts dynamically imports asset-source.ts/upload-ticket.ts (both server-only-guarded) after installing the same server-only -> empty.js redirect vitest.config.ts uses, since plain tsx has no such alias and would otherwise crash on import — verified this redirect does not affect getServerStorage()/requireServiceClient(), neither of which carries the guard."
  - "The Supabase-strategy write in upload-ticket-smoke.ts re-wraps the raw Buffer as a Blob with the ticket's contentType before calling uploadToSignedUrl — confirmed live that a raw Buffer with no .type gets its content type read as text/plain by Supabase's client, which the audio bucket's mime allowlist then rejects. This is the exact SDK behavior 189-01's SUMMARY predicted; the smoke script had to reproduce browser-upload.ts's 'Blob stamping' logic to exercise the real path faithfully rather than a simplified one."
  - "dotenv/config alone only reads .env (this repo has none); switched to dotenv.config({ path: '.env.local' }), matching the fix scripts/r2-migrate.ts's own header comment already documents for the identical pitfall."
  - "Added an explicit regression test asserting capture-recorder.tsx and photo-drop-zone.tsx still reach lib/actions/photo.ts as a 'use server' boundary, per this plan's instruction to assert the already-closed photo half of UPLOAD-01 rather than re-touch it."

requirements-completed: [UPLOAD-01, UPLOAD-03]

# Metrics
duration: ~2h 10min
completed: 2026-08-06
---

# Phase 189 Plan 04: The Client-Graph Credential Gate and the Content-Type Proof Summary

**A static transitive-closure import-graph gate (`tests/unit/storage/browser-credential-gate.test.ts`) that fails the suite if any `'use client'` module can reach S3/service-role/ticket-minting code — correctly aware of Next.js Server Actions boundaries and type-only import elision, without which it is red on ~150 legitimate call sites — plus an end-to-end smoke script proving upload-ticket content-type fidelity through the real proxy reader, and the R2-CORS-on-`audio` prerequisite written down before anyone can activate R2.**

## Performance

- **Duration:** ~2h 10min
- **Tasks:** 3 completed (plus one small typecheck fix committed separately)
- **Files created:** 2 (browser-credential-gate.test.ts, upload-ticket-smoke.ts)
- **Files modified:** 1 (docs/STORAGE-MIGRATION.md)

## Accomplishments

- Built and proved a permanent static gate that answers "can a client entry point *reach* credential-bearing storage code" — a question that stays true regardless of whether `S3_*` happens to be configured on the machine running the check (it never is, on purpose, in this repo today).
- The gate's first real run against the actual tree was RED — not because of a bug in the app, but because a naive closure walk doesn't understand two real Next.js compile-time behaviors this repo relies on pervasively: Server Actions RPC-stub boundaries and type-only import elision. Fixing the walk (not weakening the forbidden-module list) was itself the load-bearing work of Task 1.
- Manually verified the gate fails on three independent probes — a direct forbidden import, a 2-hop transitive import, and a bare credential-shaped literal — each observed RED with a full readable path, then reverted, leaving the working tree clean.
- Built `scripts/upload-ticket-smoke.ts` and ran it live: content-type fidelity confirmed through `fetchStoredAsset` for an audio key with an extension AND a logos key with none, plus a live HTTP leg through a real `npx next dev` instance proving `content-type: image/webp` and `content-disposition: inline` on the actual `/storage/` route.
- Documented the R2 CORS-on-`audio` prerequisite in `docs/STORAGE-MIGRATION.md` as a callout, including the `ExposeHeaders: etag` detail `upload-with-retry.ts`'s 409-as-success path needs — this is now written down before Phase 191/192 can activate R2 without it silently breaking every browser upload.

## Task Commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | The client-graph credential gate, proven to fail | `2fbfd7f9` | `tests/unit/storage/browser-credential-gate.test.ts` |
| 1 (fix) | Public-API typecheck fix for dynamic-import detection | `0d0800cb` | `tests/unit/storage/browser-credential-gate.test.ts` |
| 2 | End-to-end content-type proof through the proxy's reader | `90714a00` | `scripts/upload-ticket-smoke.ts` |
| 3 | Document the ticket contract and the CORS prerequisite | `f8e878d0` | `docs/STORAGE-MIGRATION.md` |
| 1 (addendum) | Photo-upload regression assertion | `bc66ede5` | `tests/unit/storage/browser-credential-gate.test.ts` |

No worktree, no branch — committed directly to `main` per this run's spawn instructions, interleaved with sibling agent `191-02`'s concurrent commits (confirmed via `git log --oneline`; only this plan's files were staged in each commit here).

## Observed RED Gate Outputs (Task 1, Part B — the three required negative probes)

All three were run against the real tree, observed failing with the exact required path shape, then reverted (`git diff --stat` confirmed empty after each revert; final `git status --porcelain` before commit showed only this plan's own new file).

**1. Direct forbidden import** — added `import { serverStorageBackend } from '@/lib/storage/server'` to `components/workspace/photos/photo-card.tsx`:
```
components/workspace/photos/photo-card.tsx -> lib/storage/server.ts (FORBIDDEN)
components/workspace/photos/photo-card.tsx -> lib/storage/server.ts -> lib/storage/s3-config.ts (FORBIDDEN)
```
(plus every downstream client component that imports `photo-card.tsx`, e.g. `photo-grid.tsx -> photo-card.tsx -> lib/storage/server.ts`)

**2. Transitive violation, 2 hops deep** — added `import { s3ConfigFromEnv } from '@/lib/storage/s3-config'` to `lib/storage/browser-upload.ts`:
```
components/workspace/ai-input-group/use-ai-input-submit.ts -> lib/storage/browser-upload.ts -> lib/storage/s3-config.ts (FORBIDDEN)
```
The full 3-segment chain is printed (not just "violation found"), confirming a one-hop check would have missed this class.

**3. Credential-shaped literal** — added the string `'S3_SECRET_ACCESS_KEY'` to `lib/storage/browser-upload.ts`:
```
components/projects/inline-audio-recorder.tsx -> lib/storage/browser-upload.ts contains "S3_SECRET_ACCESS_KEY"
```

Each probe was reverted with `Edit` immediately after its RED observation; `git diff --stat` on the touched file was empty before moving to the next probe.

## The Correctness Fix That Made the Gate Meaningful

The first real run of the gate against the unmodified tree was RED with ~150 violations — not a bug in the app, but two gaps in the walk's model of how Next.js actually compiles this repo:

1. **Server Actions are a real compile-time boundary.** Every file under `lib/actions/` (and several `app/**/actions.ts` files) begins with `'use server'`. Next.js's Flight compiler replaces every export of such a file with an RPC-call stub when imported from client code — neither the function body nor its own imports ship to the browser. A naive walk treats `components/capture/capture-recorder.tsx -> lib/actions/recording.ts -> lib/storage/server.ts` as a leak; it is exactly the sanctioned Server Action pattern this repo uses everywhere. Fixed by stopping traversal at any `'use server'` module (recording it in the closure for path-reporting purposes, but not descending into its imports or scanning its own source for credential literals).
2. **Type-only imports never reach the browser.** Dozens of client components import server-only query modules (`lib/queries/estimate.ts`, `lib/queries/blog.ts`, etc. — each itself guarded by `import 'server-only'`) purely via `import type { ... } from '...'` for their exported types. TypeScript/Next.js erase these entirely at build time. Fixed by detecting `import type`/all-specifiers-type-only declarations and excluding them from the traversed specifier set.

Both fixes are documented inline in the test file's own docblocks (`ParsedModule.isUseServer`, `isTypeOnlyImport`) so a future reader understands *why* the gate stops where it stops, not just that it does.

## Smoke Script Results (Task 2)

Ran against this repo's actual configured backend (Supabase — no `S3_*` in `.env.local`, this repo's default state) three times during development (final clean run, plus one with `SMOKE_BASE_URL` pointed at a locally started `npx next dev --port 9633`):

```
[upload-ticket-smoke] backend=supabase projectId=<uuid> companyId=<uuid>
[upload-ticket-smoke] leg1 SKIPPED serverStorageBackend() === 'supabase' (S3_* not configured — this repo's default state). Supply S3_* env vars inline on the command line to exercise this leg.
[upload-ticket-smoke] leg2 OK fetchStoredAsset round trip — contentType=audio/webm source=supabase
[upload-ticket-smoke] leg3 OK extensionless key content-type preserved — contentType=image/webp source=supabase key=phase189/<ts>-<id>-noext
[upload-ticket-smoke] leg4 OK live HTTP fetch — content-type=image/webp content-disposition=inline   (when SMOKE_BASE_URL was set)
[upload-ticket-smoke] leg4 SKIPPED SMOKE_BASE_URL is not set ...                                       (default, no dev server running)
[upload-ticket-smoke] ALL LEGS PASSED (or legitimately SKIPPED)
[upload-ticket-smoke] cleanup OK deleted audio/<companyId>/<projectId>/<uuid>.webm
[upload-ticket-smoke] cleanup OK deleted logos/phase189/<ts>-<id>-noext
```

Exit code `0` in every run, captured directly via `echo $?` on the line after a redirected (never piped) run. Every object the script wrote was deleted in a `finally` block (verified: the guard script confirms the literal string `finally` is present and load-bearing, not decorative).

**Leg 1 (R2 presigned-PUT contract) was SKIPPED in every run** — this repo has no `S3_*` configured, per CONTEXT.md's deliberate policy. This is the honest, expected state; the script was never run with real R2 credentials during this plan (no `S3_*` was added to `.env.local` or Coolify, per the hard constraint).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The naive import-graph walk was red on ~150 legitimate call sites — fixed the walk's model, not the forbidden list**
- **Found during:** Task 1, first real run of the gate against the unmodified tree
- **Issue:** See "The Correctness Fix That Made the Gate Meaningful" above — the walk didn't account for Next.js Server Actions boundaries or type-only import elision.
- **Fix:** Added `ParsedModule.isUseServer` detection (stop traversal, exclude from literal scan) and `isTypeOnlyImport`/`isTypeOnlyExport` (exclude from traversed specifiers).
- **Files modified:** `tests/unit/storage/browser-credential-gate.test.ts`
- **Verification:** Gate green on the real tree after the fix (7/7, later 8/8 with the photo-upload regression test); the three negative probes still correctly RED after the fix, confirming the fix didn't also blind the gate to real violations.
- **Commit:** `2fbfd7f9`

**2. [Rule 3 - Blocking] `ts.isImportCall` is not part of TypeScript's public `.d.ts`**
- **Found during:** Task 1, running the plan's mandated `npx tsc --noEmit -p tsconfig.ci.json` gate (and, redundantly, a bare-repo `tsc` sweep to be sure)
- **Issue:** `ts.isImportCall(node)` exists at runtime (verified: `typeof ts.isImportCall === 'function'`) but is absent from `node_modules/typescript/lib/typescript.d.ts` — vitest's esbuild-based transform never type-checks, so it ran fine there, but real `tsc` rejected the property access.
- **Fix:** Replaced with the public equivalent: `ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword`.
- **Files modified:** `tests/unit/storage/browser-credential-gate.test.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.ci.json` and a full bare `npx tsc --noEmit -p tsconfig.json` both show zero errors for this file; gate re-run 7/7 green.
- **Commit:** `0d0800cb`

**3. [Rule 3 - Blocking] `fetch`'s `BodyInit`/`BlobPart` typing rejects Node's `Buffer` nominally**
- **Found during:** Task 2, first `tsc` pass on `scripts/upload-ticket-smoke.ts`
- **Issue:** This repo's `lib: ["dom", ...]` + `@types/node` combination produces a `BodyInit`/`BlobPart` type that a Node `Buffer<ArrayBufferLike>` (and even a plain `Uint8Array<ArrayBufferLike>`) doesn't nominally satisfy, despite being runtime-compatible with Node's `fetch`/undici and the `Blob` constructor.
- **Fix:** Cast at the two call boundaries (`fetch`'s `body`, `new Blob([...])`'s parts) with an inline comment explaining this is a known cross-lib generic mismatch, not a real runtime incompatibility.
- **Files modified:** `scripts/upload-ticket-smoke.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean; script runs and both legs that use these calls (leg 1's PUT, leg 2's Supabase write) succeed live.
- **Commit:** `90714a00`

**4. [Rule 3 - Blocking] `import 'server-only'` crashes under plain `tsx`**
- **Found during:** Task 2, first `npx tsx scripts/upload-ticket-smoke.ts` run
- **Issue:** `lib/storage/asset-source.ts` and `lib/storage/upload-ticket.ts` both correctly carry `import 'server-only'`. `vitest.config.ts` aliases that package to an `empty.js` stub for tests; plain `tsx` has no such alias, so importing either module crashed immediately on load — exactly the constraint `lib/storage/server.ts`'s own header docblock and `scripts/pagination-render-calibration.ts`'s header already document for their own server-only dependencies (that precedent duplicates the target logic instead; not viable here, since this script's entire point is to exercise the REAL functions).
- **Fix:** Installed the identical `server-only -> empty.js` module-resolution redirect vitest.config.ts uses (via `Module._resolveFilename`), then imported both modules via a runtime `import()` inside `main()` so the redirect is guaranteed installed first.
- **Files modified:** `scripts/upload-ticket-smoke.ts`
- **Verification:** Script runs end-to-end without crashing; `fetchStoredAsset`/`mintUploadTicket` confirmed to be the real functions (their behavior — the mime-type rejection in deviation #5 below — is real backend behavior, not a stub).
- **Commit:** `90714a00`

**5. [Rule 1 - Bug] Raw `Buffer` body rejected by the Supabase bucket's mime allowlist**
- **Found during:** Task 2, first live run of leg 2 (Supabase-strategy write)
- **Issue:** `uploadToSignedUrl(key, token, body, ...)` called with a raw `Buffer` failed with `mime type text/plain;charset=UTF-8 is not supported`. This is the exact SDK behavior 189-01's SUMMARY already predicted: `uploadToSignedUrl` sends its body as multipart FormData and reads the stored content type from the body's own `.type`, ignoring the `contentType` fileOption — a raw `Buffer` has no `.type`.
- **Fix:** Re-wrapped the body as `new Blob([bytes], { type: ticket.contentType })` before calling `uploadToSignedUrl`, mirroring `lib/storage/browser-upload.ts`'s "Blob stamping" logic.
- **Files modified:** `scripts/upload-ticket-smoke.ts`
- **Verification:** Leg 2 re-run: `OK fetchStoredAsset round trip — contentType=audio/webm source=supabase`.
- **Commit:** `90714a00`

**6. [Rule 3 - Blocking] `dotenv/config` only reads `.env`, not `.env.local`**
- **Found during:** Task 2, first live run — `requireServiceClient` threw "must be set" despite `.env.local` having the vars
- **Issue:** This repo has no `.env` file; secrets live in `.env.local`. `import 'dotenv/config'` silently loads nothing. `scripts/r2-migrate.ts` (a sibling plan's script, read for context) already documents and fixes this exact pitfall.
- **Fix:** Switched to `import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })`, matching the sibling script's precedent.
- **Files modified:** `scripts/upload-ticket-smoke.ts`
- **Verification:** Subsequent runs show `injected env (25) from .env.local` and legs 2/3 succeed.
- **Commit:** `90714a00`

**7. [Rule 2 - Missing critical] The plan's Task 2 verify script requires a literal `finally` block; the initial `.then()/.catch()` chain didn't have one**
- **Found during:** Task 2, running the plan's own guard script (`node -e "..."` checking for `/finally/`)
- **Issue:** Cleanup was correct in behavior (ran on both success and failure via `.then()`/`.catch()` branches) but had no literal `finally` keyword, and the guard script — reasonably — treats that as "no proof cleanup runs on failure."
- **Fix:** Restructured `main()`'s invocation as an `async function run() { try { await main() } finally { await cleanup() } }`, an unambiguous single cleanup path.
- **Files modified:** `scripts/upload-ticket-smoke.ts`
- **Verification:** Guard script passes; script still exits 0/cleans up correctly in a live re-run.
- **Commit:** `90714a00`

**8. [Rule 2 - Missing critical] Doc's own wording matched the secret-shape verification's own regex**
- **Found during:** Task 3, running the plan's secret-shape check on the finished doc
- **Issue:** A sentence explaining *why* gitleaks can't catch bare-hex credentials literally contained the substring `whsec_` (as an example of a prefix gitleaks DOES catch), which the verification's own `whsec_` pattern flagged.
- **Fix:** Reworded to describe the concept ("no vendor-specific prefix the way a Stripe or webhook secret does") without including the literal trigger substrings.
- **Files modified:** `docs/STORAGE-MIGRATION.md`
- **Verification:** Secret-shape check exits 0.
- **Commit:** `f8e878d0`

**9. [Rule 2 - Missing critical] Added an explicit regression assertion for the already-closed photo half of UPLOAD-01**
- **Found during:** Re-reading the run instructions after Task 3 — "Assert it as a regression; do not rewrite it" was not yet represented as an actual test.
- **Issue:** The gate's positive-control test only checked the three audio call sites; nothing explicitly proved `capture-recorder.tsx`/`photo-drop-zone.tsx` still route photo uploads through `uploadProjectPhoto` (Phase 188's fix) rather than a direct client-side storage write.
- **Fix:** Added a test asserting both files' closures include `lib/actions/photo.ts` in `closure.boundary` (i.e., reached as a `'use server'` RPC reference).
- **Files modified:** `tests/unit/storage/browser-credential-gate.test.ts`
- **Verification:** 8/8 gate tests pass; the new test uses the same closure/boundary mechanism already proven correct by the three negative probes and the synthetic-rejection test.
- **Commit:** `bc66ede5`

---

**Total deviations:** 9 auto-fixed (1 bug — correctness-critical to the gate's entire purpose; 6 blocking — typecheck/runtime issues that would have prevented the plan's own verify commands from passing; 2 missing-critical — a guard-script requirement and an explicitly-instructed regression assertion)
**Impact on plan:** No scope creep, no architectural changes, no file outside this plan's declared `files_modified` touched. Deviation #1 is the single most consequential finding of this plan: an unfixed naive walk would have been either permanently red (useless) or would have had to be "fixed" by narrowing the forbidden-module list, which risks silently widening the actual attack surface the gate exists to close. Fixing the walk's model instead keeps the gate both green today and load-bearing against a real future regression.

## Issues Encountered

None beyond the deviations documented above. Full suite (`npx vitest run tests/unit tests/eval`, redirected to a file, exit code captured on the line after — never through a pipe) run twice during this plan (once after Task 3's doc change, once after the final regression-test addition): both runs showed exactly the two known Windows/CRLF non-regressions and nothing else —

```
VITEST_EXIT=1
 FAIL  tests/unit/sign-estimate-atomic-migration.test.ts > ... is SECURITY DEFINER ... with search_path pinned
 FAIL  tests/unit/signature-evidence-retention-migration.test.ts > ... is SECURITY DEFINER with search_path pinned
 Test Files  2 failed | 618 passed | 1 skipped (621)
      Tests  2 failed | 5397 passed | 20 todo (5419)
```

`tests/unit/mcp-route-contract.test.ts` did not appear in either run's `FAIL` set — the documented fork-pool flake was not observed, so no isolated re-run was needed.

## User Setup Required — operator-pending, not code-blocking

**UPLOAD-01 is NOT fully closed by this plan's code alone.** CONTEXT.md records a verified operator prerequisite that has zero repo-side evidence and cannot be produced by any check in this repo:

**The `audio` R2 bucket needs a CORS policy applied out-of-band, by an operator with an R2 *admin* credential, before R2 can be activated:**

- AllowedOrigins: the production app origin(s) + any preview origin that must upload
- AllowedMethods: `PUT`, `GET`, `HEAD`
- AllowedHeaders: `content-type`
- **ExposeHeaders: `etag`** — required, not optional: `lib/storage/upload-with-retry.ts` treats a 409 as success and reads the response `ETag` to confirm the object landed; without `ExposeHeaders`, a browser `fetch` cannot read that header cross-origin and a legitimate retry-confirmed success will look like a failure.
- MaxAgeSeconds: a short value (e.g. 3600) is sufficient

**Why this can't be verified from code or CI:** a browser PUT to a presigned R2 URL is cross-origin. Without this policy, the preflight fails and every browser audio upload dies the instant R2 is activated — while every test in this repo (and every Supabase-mode run) stays green, because Supabase Storage is the origin the app already talks to today. This was independently confirmed in CONTEXT.md: the production app token (Object Read & Write, scoped to the five buckets) **cannot** set bucket CORS itself — `PutBucketCorsCommand` against `audio` returns `AccessDenied` (correct least-privilege behavior, not a misconfiguration) — so this is unavoidably an out-of-band admin step.

**Action for whoever runs Phase 191/192:** apply this CORS policy to the `audio` bucket BEFORE flipping `S3_*` into Coolify, and verify it with an actual cross-origin browser PUT (not just a server-side smoke script — this script's leg 1 exercises the presigned-PUT *signature* contract from Node, which is same-origin-equivalent and does NOT exercise CORS at all). Confirm the same policy is NOT applied to `photos`/`pdfs`/`logos`/`platform-brand` — no browser writes to those four.

No other external service configuration required for this plan's own code.

## Next Phase Readiness

- `tests/unit/storage/browser-credential-gate.test.ts` is a permanent CI gate — it runs in the same `tests/unit` scope every other suite run already covers, so a future regression (a client component importing a storage credential module, directly or transitively) fails CI automatically.
- `scripts/upload-ticket-smoke.ts` is available for Phase 191/192 to re-run against a real R2-backed environment (supplying `S3_*` inline) to exercise leg 1 (the presigned-PUT signature contract) for the first time — that has never been run against R2 in this plan, only against Supabase.
- The R2 CORS-on-`audio` prerequisite is now written down in `docs/STORAGE-MIGRATION.md`'s `## Phase 189` section, referenced explicitly for whoever runs the Phase 191/192 cutover — but it remains UNVERIFIED against real R2 (no admin credential was available to this plan, and none should be added to `.env.local`/Coolify per the hard constraints).
- `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, `lib/storage/asset-source.ts`, and `lib/storage/upload-with-retry.ts` remain untouched by this plan (confirmed via `git diff --stat` at multiple points during execution — all empty for these four files). No `S3_*` was added to `.env.local` or Coolify.
- **STATE.md/ROADMAP.md/REQUIREMENTS.md were NOT updated by this run.** Sibling agent `191-02` executed concurrently in this non-worktree-isolated repo (confirmed via interleaved commits in `git log`), and per this project's known tooling risk (`project_gsd_state_milestone_revert` — `gsd-tools state`/`begin-phase`/`complete` commands can revert STATE.md's frontmatter milestone to a stale value) combined with the precedent set by 189-01/02/03's own summaries (all of which deferred these updates for the same reason), the orchestrator should run `state advance-plan`/`update-progress`/`record-metric`/`add-decision`, `roadmap update-plan-progress`, and `requirements mark-complete UPLOAD-01 UPLOAD-03` once all concurrent sibling plans are confirmed complete — then re-assert the active milestone in STATE.md's frontmatter if it reverted.

## Self-Check: PASSED

Verified by direct shell check (not assumed):

- FOUND: `tests/unit/storage/browser-credential-gate.test.ts`
- FOUND: `scripts/upload-ticket-smoke.ts`
- FOUND: `## Phase 189` heading in `docs/STORAGE-MIGRATION.md`
- FOUND commit `2fbfd7f9` (`git log --oneline --all | grep 2fbfd7f9`)
- FOUND commit `0d0800cb`
- FOUND commit `90714a00`
- FOUND commit `f8e878d0`
- FOUND commit `bc66ede5`
- Gate re-run: 8/8 tests passing on the real tree
- Smoke script re-run: exit 0, legs 2/3 OK, leg 1 SKIPPED (honest — no S3_* configured), leg 4 OK when SMOKE_BASE_URL was set against a live `next dev` instance
- Full suite re-run: 2 failed (both known non-regressions) | 618 passed | 1 skipped test files; 2 failed | 5397 passed | 20 todo tests

---
*Phase: 189-browser-uploads-without-browser-credentials*
*Completed: 2026-08-06*
