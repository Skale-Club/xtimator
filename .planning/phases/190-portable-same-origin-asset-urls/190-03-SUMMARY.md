---
phase: 190-portable-same-origin-asset-urls
plan: 03
subsystem: infra
tags: [storage, asset-proxy, pdf, react-pdf, favicon, data-uri, r2]

# Dependency graph
requires:
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "fetchStoredAsset(bucket, key) — the R2-first / Supabase-read-through reader"
  - phase: 190-portable-same-origin-asset-urls
    plan: 01
    provides: "parseStorageProxyPath / isAcceptableAbsoluteAssetUrl — the shared path parser and absolute-URL predicate"
provides:
  - "lib/storage/asset-inline.ts — resolveAssetForRenderer(): same-origin path -> data: URI, in-process, no HTTP"
  - "PDF renderer resolves company.logo_url BEFORE header measurement, one company object for all three consumers"
  - "app/icon.tsx + app/apple-icon.tsx resolve a same-origin platform-brand asset"
affects: [190-04-email-absolute-urls, 192-cdn-cache-proof]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Origin-less resolution: renderers with no browser origin read object bytes in-process instead of requesting the app's own public domain"
    - "Content-type allowlist as a LOGGING-SAFETY control, not just a correctness check"
    - "Measure-and-render from the SAME object: resolution happens before the first consumer, never between two of them"
    - "Mutation-verify every automated gate before trusting its pass"

key-files:
  created:
    - lib/storage/asset-inline.ts
    - tests/unit/storage/asset-inline.test.ts
    - tests/unit/pdf/pdf-logo-resolution.test.ts
    - tests/unit/brand-icon.test.ts
  modified:
    - lib/pdf/render-estimate-pdf.ts
    - lib/brand-icon.ts
    - components/workspace/estimate/use-paginated-preview.ts

key-decisions:
  - "The content-type allowlist is verified against @react-pdf/image's ACTUAL source, not the plan's summary of it: resolveBase64Image's regex is /^data:image\\/([a-zA-Z]*);base64,/ and the whole-URI throw fires whenever that regex misses — which is exactly application/octet-stream, text/html, image/svg+xml and image/vnd.microsoft.icon. The allowlist blocks every one of them."
  - "Of the four allowlisted types only png and jpeg actually render in react-pdf; webp and gif are allowed because the ImageResponse favicon route decodes them AND because react-pdf rejects them with a SHORT, non-leaking message"
  - "readCapped duck-types on getReader/arrayBuffer rather than `instanceof Blob`, because an instanceof against a global constructor is unreliable across realms (jsdom vs node, undici Blob vs global Blob)"
  - "The file header states explicitly that it may not call an HTTP client, a signed-URL helper, the canonical-base-URL helper or a logger, and deliberately spells none of those symbols literally — so the plan's grep gate stays literally empty and stays meaningful"

patterns-established:
  - "Under concurrent executors, commit with `git commit --only -- <paths>`: the shared index picks up sibling-staged files and a plain `git commit` would sweep them in"

requirements-completed: [URL-03]

# Metrics
duration: 60min
completed: 2026-08-06
---

# Phase 190 Plan 03: Origin-less Asset Resolution for Server-Side Renderers Summary

**`resolveAssetForRenderer()` reads a same-origin `/storage/{bucket}/{key}` object in-process and hands it to react-pdf and the ImageResponse favicon routes as a `data:` URI — with a content-type allowlist that exists to keep multi-megabyte base64 blobs out of container logs.**

## Performance

- **Duration:** ~60 min (a large share of it waiting on test runs starved by two concurrent sibling executors)
- **Tasks:** 3 (all TDD)
- **Files:** 7 (4 created, 3 modified)

## Accomplishments

- `lib/storage/asset-inline.ts` (186 lines): falsy -> `null`; same-origin path -> data URI for allowlisted raster types only; acceptable absolute URL -> byte-identical passthrough; everything else -> `null`. Never throws, never logs, never constructs a URL.
- The PDF renderer now resolves `company.logo_url` **before** `computeEstimatePageConstraints`, and one `companyForRender` object reaches constraints, `blocksFromModel` and `createElement` — proven by reference identity in both the resolved and failed-resolution cases.
- `loadBrandLogoDataUri()` no longer calls `fetch('/storage/...')` (which threw "Failed to parse URL" in Node and silently degraded every browser tab icon to the bundled logo the moment an admin uploaded a new favicon).
- The W3 paginated-preview parity divergence is documented at **both** `computeEstimatePageConstraints` call sites, with the truthiness invariant that makes it safe — and a test asserts both comments exist.

## Task Commits

1. **Task 1 (RED)** — `a99709d0` `test(190-03): add failing tests for resolveAssetForRenderer`
2. **Task 1 (GREEN)** — `bf92dc80` `feat(190-03): resolveAssetForRenderer inlines same-origin assets as data URIs`
3. **Task 2 (RED)** — `a89134e3` `test(190-03): add failing tests for PDF company-logo resolution`
4. **Task 2 (GREEN)** — `09adab1e` `feat(190-03): resolve company.logo_url before the PDF measures its header`
5. **Task 3 (RED)** — `5ba19570` `test(190-03): add failing tests for same-origin brand icon resolution`
6. **Task 3 (GREEN)** — `b9e4caff` `feat(190-03): resolve same-origin brand assets for the dynamic favicon routes`

No refactor commits were needed. Test counts: 32 (asset-inline) + 11 (pdf-logo-resolution) + 12 (brand-icon) = **55 new tests**.

## Decisions Made

### 1. The B3 allowlist rationale was verified against react-pdf's real source, and is more precise than the plan stated

`node_modules/@react-pdf/image/lib/index.js:153-160`:

```js
const resolveBase64Image = async ({ uri }) => {
    const match = /^data:image\/([a-zA-Z]*);base64,([^"]*)/g.exec(uri);
    if (!match) throw new Error(`Invalid base64 image: ${uri}`);   // <- WHOLE uri
    const format = match[1];
    ...
    if (!isValidFormat(format)) throw new Error(`Base64 image invalid format: ${format}`);  // <- format only
```

The whole-URI leak fires **only when the regex misses**, i.e. when the media type is not `image/<letters-only>`. That is precisely:

| Rejected type | Why the regex misses | Would leak the full base64 blob? |
| --- | --- | --- |
| `application/octet-stream` (asset-source's default on BOTH branches) | not `data:image/` | **YES** |
| `text/html` | not `data:image/` | **YES** |
| `image/svg+xml` | `+` is outside `[a-zA-Z]*` | **YES** |
| `image/vnd.microsoft.icon` (a real `.ico` upload) | `.` is outside `[a-zA-Z]*` | **YES** |

So the allowlist blocks four *actual* whole-URI-leak paths, not a hypothetical one. This is stronger evidence than the plan had, and it is why the allowlist is a security/observability control rather than a nicety.

### 2. Only 2 of the 4 allowlisted types actually render in a PDF — and that is correct

`isValidFormat` accepts only `jpg`/`jpeg`/`png`. `image/webp` and `image/gif` are in the allowlist anyway because:
- `app/icon.tsx`'s `ImageResponse` renderer **does** decode them (excluding WebP would break the favicon route, which is the whole point of Task 3), and
- react-pdf rejects them via the **second** throw (`Base64 image invalid format: webp`), which contains the format string only — no URI, no blob, no leak.

### 3. `readCapped` duck-types instead of `instanceof Blob`

`instanceof` against a global constructor is unreliable across realms. `getReader` (stream) is checked first, `arrayBuffer` (Blob) second. The Blob branch also short-circuits on `blob.size` so the cap costs no allocation.

### 4. Committing under concurrent executors requires `git commit --only`

Mid-run, `git status` showed `tests/unit/storage/storage-migration-runbook.test.ts` **staged by sibling 191-03** in the shared index. A plain `git commit` would have swept it into a 190-03 commit — and in fact the pre-commit `gitleaks` hook blocked the attempt, because that sibling file contains intentional fake-secret fixtures. All subsequent commits used `git commit --only -- <paths>`. Verified afterwards: my 6 commits touch exactly 6 files, no sibling file among them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The `contentLength` cap test asserted on the wrong signal**

- **Found during:** Task 1 GREEN (31/32 passing)
- **Issue:** The test asserted "0 chunks enqueued" to prove the body was never read. A `ReadableStream` pre-pulls its first chunk on construction (default `highWaterMark` of 1), so the counter read 1 regardless of implementation. The test was measuring the stream, not the code.
- **Fix:** Assert that `getReader` is never called instead — the honest signal for "we never opened the body".
- **Files modified:** `tests/unit/storage/asset-inline.test.ts`
- **Commit:** `bf92dc80`

**2. [Rule 3 - Blocking] File-header prose defeated the plan's own grep gate**

- **Found during:** Task 1 verification
- **Issue:** Verification gate 4 requires `grep -nE "getSignedUrl|getCanonicalBaseUrl|fetch\(|console\."` on `asset-inline.ts` to return **nothing**. My header comments explained *why the module does not do those things* — and so matched on 4 comment lines. A gate that cannot be satisfied literally is a gate the next reader will delete.
- **Fix:** Reworded the prose to keep every bit of rationale without spelling the symbols literally, plus an explicit header note saying the omission is deliberate and gate-driven. Gate now returns nothing, and was proven still able to fail (appending `// console.log("x")` makes it match; removing it clears it).
- **Files modified:** `lib/storage/asset-inline.ts`
- **Commit:** `bf92dc80`

**Total deviations:** 2 auto-fixed. No architectural decisions were needed; no Rule 4 checkpoint.

## Named Follow-Up: PDF-LOGO-01 — company logos are stored as WebP and have never rendered in any estimate PDF

**Not fixed here, by explicit plan instruction.** Evidence gathered and verified during this plan:

1. **All four `logos` writers convert to WebP.** `lib/actions/company.ts`, `lib/actions/settings.ts`, `lib/actions/client.ts`, `lib/actions/admin-company.ts` are exactly the files that both write to the `logos` bucket and call `convertImageToWebp` (`lib/image/webp.ts`).
2. **`@react-pdf/image` decodes only jpg/jpeg/png**, verbatim: `isValidFormat = lower === 'jpg' || lower === 'jpeg' || lower === 'png'`, and `getImage()`'s switch returns `null` for anything else. This applies on **both** the remote-URL path and the data-URI path, so Phase 190 changes nothing about it either way.
3. **`lib/pdf/measure-header-height.ts:111` nonetheless reserves 64pt (modern) / 72pt (classic) + the header-right gap**, charged purely on `company.logo_url` being **truthy**.

**Net effect:** every estimate PDF belonging to a company with a logo has a blank reserved block where the logo should be. This is a live product bug that **predates Phase 190 and is unchanged by it** — a relative path and a data URI are both truthy, exactly like the absolute URL before them.

**Why it is not fixed here:** the fix means changing what those four writers upload (PNG, or dual-writing a PNG alongside the WebP), which alters upload behaviour across four server actions and needs its own scoped change and its own migration story for existing rows. Proof it was not attempted: **none of this plan's 6 commits touches `lib/actions/` or `lib/image/`** (per-commit file lists below under Verification).

## Known Stubs

None. Every function added is fully implemented and covered. No placeholder values, no empty-array data sources, no TODO/FIXME markers introduced.

## Verification (actual, honest results)

### 1. Full CI suite — `npx vitest run tests/unit tests/eval`, redirected to a file, `$?` captured on the next line (never through a pipe)

```
FULL_EXIT=1
Test Files  18 failed | 609 passed | 1 skipped (628)
     Tests  28 failed | 5480 passed | 20 todo (5528)
```

**18 failed files is NOT the real number.** Two sibling executors (190-02, 191-03) were running their own full vitest suites on the same machine; tests that normally take <1s took 30–100s, and vitest printed `[vitest-pool]: Timeout terminating forks worker` for six more files. I re-ran the **exact** 18 failing files in isolation:

```
EXIT=1
Test Files  5 failed | 13 passed (18)
     Tests  6 failed | 142 passed (148)
```

13 of 18 were pure contention flakes. The remaining 5, re-run again isolated:

| File | Isolated verdict |
| --- | --- |
| `tests/unit/actions/team-invite.test.ts` | **PASSES** isolated (contention flake) |
| `tests/unit/billing/seat-billing-wiring.test.ts` | **PASSES** isolated (contention flake) |
| `tests/unit/mcp-route-contract.test.ts` | **PASSES** isolated — the documented fork-pool flake |
| `tests/unit/sign-estimate-atomic-migration.test.ts` | **FAILS** — KNOWN Windows/CRLF, passes in CI |
| `tests/unit/signature-evidence-retention-migration.test.ts` | **FAILS** — KNOWN Windows/CRLF, passes in CI |

`team-invite` + `seat-billing-wiring` + `mcp-route-contract` together: `EXIT=0, 29 passed (29)`.

**Verbatim final failing list: exactly the two known Windows/CRLF migration-shape files** (last touched by `1073b68f feat(signature)`, unrelated to this phase). **Zero regressions attributable to this plan.**

Also confirmed green in isolation: `tests/unit/estimate/paginated-view-engine-parity.test.tsx` (the one contended failure that *could* plausibly have been mine, since it exercises the pagination engine) and `tests/unit/demo/mutation-boundary-sweep.test.ts` — `EXIT=0, 9 passed (9)`.

`tests/unit/pdf` (whole suite, pagination snapshots included): **EXIT=0, 14 files, 72 tests passed.**

### 2. `npx tsc -p tsconfig.ci.json --noEmit` → **EXIT=0**

### 3. `npx next build` → **BUILD_EXIT=0**, and the icon routes survive

Checked against `.next/routes-manifest.json`, not just the build log (this repo has a prior route-manifest outage):

```
/icon                        PRESENT
/apple-icon                  PRESENT
/manifest.webmanifest        PRESENT
/storage/[bucket]/[...key]   PRESENT
```

Build output also lists `○ /apple-icon` and `○ /icon`.

### 4. No credential/URL leak and no logging

```
$ grep -nE "getSignedUrl|getCanonicalBaseUrl|fetch\(|console\." lib/storage/asset-inline.ts
(no output, grep exit 1)
```

Proven able to fail: appending `// console.log("x")` makes the same grep match 1; removing it returns to 0.

### 5. No route handler added — the demo mutation-boundary manifest needs no edit

No file under `app/` is touched by this plan. `tests/unit/demo/mutation-boundary-sweep.test.ts` passes.

### 6. `lib/storage/s3-provider.ts`, `index.ts`, `asset-source.ts` untouched

`git log a99709d0^..HEAD -- lib/storage/s3-provider.ts lib/storage/index.ts lib/storage/asset-source.ts` → **empty** (across MY commits and the siblings' alike).

### 7. PDF-LOGO-01 recorded, and no logo writer touched

Per-commit file lists — my 6 commits, all 6 files:

| Commit | Files |
| --- | --- |
| `a99709d0` | `tests/unit/storage/asset-inline.test.ts` |
| `bf92dc80` | `lib/storage/asset-inline.ts`, `tests/unit/storage/asset-inline.test.ts` |
| `a89134e3` | `tests/unit/pdf/pdf-logo-resolution.test.ts` |
| `09adab1e` | `lib/pdf/render-estimate-pdf.ts`, `components/workspace/estimate/use-paginated-preview.ts` |
| `5ba19570` | `tests/unit/brand-icon.test.ts` |
| `b9e4caff` | `lib/brand-icon.ts` |

Nothing under `lib/actions/` or `lib/image/`. (`git log` for those paths in the range returns `11659ce9 feat(190-02)` — sibling Plan 02's own writer-repointing work, which is its scope, not a leak from mine.)

### 8. Every automated gate was proven capable of failing

Task 1 (`tests/unit/storage/asset-inline.test.ts`, 32 tests). Mutations applied cumulatively; each one added NEW failures on top of the previous:

| Mutation | Failures |
| --- | --- |
| Drop the content-type allowlist check | 6 |
| `console.warn('could not inline', url)` on the reject branch | 8 (+2) |
| Drop the `contentLength` cap | 9 (+1) |
| Drop the in-stream cap + cancel | 10 (+1) |
| Return `url` opaquely instead of `isAcceptableAbsoluteAssetUrl(url) ? url : null` | 15 (+5) |
| Stop decoding the key segments | 16 (+1) |
| Drop the `split(';')[0]` media-type parse | 17 (+1) |

Task 2 (`tests/unit/pdf/pdf-logo-resolution.test.ts`, 11 tests):

| Mutation | Result |
| --- | --- |
| `createElement` gets the raw `company` again | 4 failed |
| `computeEstimatePageConstraints` gets the raw `company` (measure/render desync) | 3 failed |
| Delete the parity note from the client hook | 1 failed |

Task 3 (`tests/unit/brand-icon.test.ts`, 12 tests):

| Mutation | Result |
| --- | --- |
| Revert to the bare `fetch(url)` | 4 failed |
| Invert `faviconUrl ?? logoUrl` precedence | 1 failed |
| Drop the `data:` guard (would feed an absolute URL back as a tile source) | 3 failed |

## Issues Encountered

- **Concurrent-executor contention is the dominant source of false failures on this box.** A full-suite run under three concurrent executors produced 18 red files, of which 16 were flakes. The plan's "run the full suite" gate is only trustworthy when paired with an isolated re-run of the failing set — recorded above in full.
- **The shared git index is a real hazard under parallel executors.** See Decision 4; `git commit --only -- <paths>` is the mitigation.
- A first full-suite attempt was killed at the 10-minute tool timeout; re-run in the background to completion.

## User Setup Required

None. No env var, no `S3_*` value written to `.env.local` or Coolify, no external service configuration. The resolver works today with R2 unconfigured — `fetchStoredAsset` falls through to Supabase, which is exactly the reversibility property Phase 187 built.

## Next Phase Readiness

- **Plan 04 (emails)** is unblocked and must NOT use this module: emails genuinely need an absolute URL, which is why `absoluteAssetUrl()` (Plan 01) exists as a separate mechanism.
- **Plan 02's repointed writers** are now safe for the PDF and favicon surfaces: a `logos` or `platform-brand` row rewritten to `/storage/...` resolves in both renderers.
- **PDF-LOGO-01** should be scheduled: once Plan 02's writers start emitting same-origin paths, the reserved-but-blank logo block becomes more visible, not less.
- **Deferred, not mine:** the two Windows/CRLF migration-shape tests still fail locally on this machine; they pass in CI.

## State-Update Notes (honest record)

1. **URL-03 was deliberately left UNCHECKED in REQUIREMENTS.md.** It reads "*Every* surface that renders these assets — app UI, public share pages, PDFs, **and email/WhatsApp sends** — resolves the new relative URLs correctly". This plan closes the PDF renderer and the favicon routes; **email/WhatsApp is Plan 04**, which declares `requirements: [URL-03, URL-04]`. Marking it complete here would be false. Same precedent as 190-01 with URL-01.
2. **`state advance-plan` was NOT run.** Three executors (190-02, 190-03, 191-03) were running concurrently; advancing a shared counter from inside one of them corrupts the position for the others. `roadmap update-plan-progress 190` was run instead — it counts SUMMARY files on disk and correctly moved Phase 190 from `1/4` to `2/4`.
3. **The known GSD milestone-revert bug fired TWICE** (once on `state record-metric`, once on `state add-decision`). Each time it rewrote the frontmatter to the stale `milestone: v3.1.1 / MVP Launch Prep + Future-Proofing`, flipped `status` to `verifying`, clobbered `last_activity` to a stale Phase 188 line, and wrote a self-contradictory `progress` block (`completed_plans: 373` > `total_plans: 369`). Re-asserted by hand both times to `v4.24 / Same-Origin Storage on R2 / in_progress` and `136/113/372/372`.
4. The metrics row landed correctly as `| Phase 190 P03 | 60min | 3 tasks | 7 files |`.

## Self-Check: PASSED

All 7 claimed files exist on disk. All 6 claimed commit hashes resolve
(`a99709d0`, `bf92dc80`, `a89134e3`, `09adab1e`, `5ba19570`, `b9e4caff`).
`lib/storage/asset-inline.ts` is 186 lines (min_lines 60).

---
*Phase: 190-portable-same-origin-asset-urls*
*Completed: 2026-08-06*
