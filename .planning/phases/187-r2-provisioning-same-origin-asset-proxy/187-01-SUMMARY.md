---
phase: 187-r2-provisioning-same-origin-asset-proxy
plan: 01
subsystem: infra
tags: [storage, r2, s3, cloudflare, supabase, cache-control, vitest]

requires: []
provides:
  - "lib/storage/proxy-policy.ts — pure bucket allowlist, traversal-safe key normalization, per-bucket cache policy"
  - "lib/storage/s3-config.ts — single-source-of-truth S3_* env mapping for new code"
  - "lib/storage/asset-source.ts — server-only R2-first / Supabase-read-through dual-source reader"
affects: [187-02, 187-03, 188, 190, 191, 192]

tech-stack:
  added: []
  patterns:
    - "Pure policy module (no server-only, no I/O) shared between the route handler, verification scripts under plain tsx, and unit tests"
    - "R2 read via a proven, unmodified S3 provider's signed-URL + in-process fetch, never a new S3 SDK call site"
    - "Fallback observability via a structured server-side console.warn, treated as authoritative over any HTTP response header"

key-files:
  created:
    - lib/storage/proxy-policy.ts
    - lib/storage/s3-config.ts
    - lib/storage/asset-source.ts
    - tests/unit/storage/proxy-policy.test.ts
    - tests/unit/storage/asset-source.test.ts
  modified: []

key-decisions:
  - "Cache policy is a 3-way per-bucket map, not derived from the public/private access boolean: platform-brand=immutable (timestamped keys), logos=public-but-revalidating (stable keys with upsert:true — immutable would pin a stale logo in unpurgeable browser caches), photos/audio/pdfs=private,no-store (tenant data, security property not performance choice)"
  - "s3-config.ts deliberately does not read or name the legacy STORAGE_PROVIDER flag anywhere, even in comments — resolved a self-contradiction in the plan (action text asked for STORAGE_PROVIDER documentation, done-criteria and overall verification grep for zero occurrences of that literal string in this file); referenced getServerStorage()'s own docblock instead"
  - "R2 read reuses the proven s3-provider.ts unmodified via a signed-URL + in-process fetch (getSignedUrl + fetch), rather than adding any new S3 SDK call — keeps the untouched-provider guarantee intact and gets real content-type off the wire for extensionless keys"
  - "content-length is dropped (undefined) whenever content-encoding is present on the R2 response, since undici already decompresses the body and the header would describe the wrong (compressed) size (W2)"
  - "The [asset-proxy] fallback console.warn line is the authoritative FUT-R2-01 signal, not the X-Asset-Source header Plan 03 will add — that header can be edge-cached stale on public buckets"

patterns-established:
  - "Pure/no-server-only policy modules stay importable from tsx scripts and unit tests alike"
  - "Dual-source reader pattern: try primary via lazy import, record structured fallback reason, fall through to secondary, never throw to the caller"

requirements-completed: [PROXY-01, PROXY-02]

duration: 35min
completed: 2026-08-06
---

# Phase 187 Plan 01: Proxy Policy, S3 Config, and Dual-Source Asset Reader Summary

**Pure bucket-allowlist/cache-policy module plus a server-only R2-first-with-Supabase-fallback asset reader that resolves real content type from the stored object, never the key.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-06T15:00Z (approx.)
- **Completed:** 2026-08-06T15:37Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 created (0 existing files touched)

## Accomplishments

- `lib/storage/proxy-policy.ts` — the five-bucket allowlist, traversal-safe key normalization (reject-never-repair), and the three pinned cache directives, with a matrix test proving no sixth bucket can silently exist without an explicit cache choice.
- `lib/storage/s3-config.ts` — the one place new code reads `S3_*` env vars; `s3ConfigFromEnv()` / `isR2Configured()`, consumed by both the reader here and (per plan) Plan 02's verification script.
- `lib/storage/asset-source.ts` — `fetchStoredAsset(bucket, key)`: tries R2 via the untouched `s3-provider.ts` (signed URL + in-process `fetch`), falls through to Supabase on miss/error/not-configured, returns the object's own content type (never inferred from the key), and emits a single structured `console.warn` on every fallback.
- 58 new unit tests (40 + 18), all green; full `tests/unit/storage` suite (116 tests across 7 files, including the pre-existing Phase-66 S3 provider tests) still green.
- `lib/storage/s3-provider.ts` and `lib/storage/index.ts` verified byte-identical (`git diff --stat` empty for both) after both tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bucket allowlist, key normalization, and per-bucket cache policy** - `8f231dfe` (feat)
2. **Task 2: S3 env mapping + dual-source asset reader** - `09f5acaa` (feat)

**Plan metadata:** (this commit)

_Note: both tasks were implemented and verified directly (no separate TDD red/green commits) — tests and implementation were authored together and verified before each task's single commit._

## Files Created/Modified

- `lib/storage/proxy-policy.ts` - Pure bucket allowlist (`PROXY_BUCKETS`), `normalizeProxyKey` traversal rejection, `CACHE_CONTROL_BY_BUCKET` three-way cache policy
- `lib/storage/s3-config.ts` - `s3ConfigFromEnv()` / `isR2Configured()`, the single new-code S3_* env mapping
- `lib/storage/asset-source.ts` - `fetchStoredAsset()` R2-first / Supabase-read-through dual-source reader, `recordFallback()` structured logging
- `tests/unit/storage/proxy-policy.test.ts` - 40 tests: allowlist, traversal rejection, three-way cache matrix
- `tests/unit/storage/asset-source.test.ts` - 18 tests: env mapping edge cases, r2-hit, r2-miss-fallback, r2-error-fallback, both-miss, not-configured, W2 content-encoding (both cases), no-leaked-credential assertion

## Decisions Made

- **Cache policy is genuinely 3-way, not 2-way-derived-from-access.** `logos` is public but explicitly NOT immutable (its writers use stable keys with `upsert: true` — an immutable year-long cache would pin a stale logo in Cloudflare's edge AND in every browser that already fetched it, and browser caches can't be purged). `platform-brand` uses timestamped keys, so immutable is correct there. `photos`/`audio`/`pdfs` are `private, no-store` as a security property (tenant data must never enter a shared cache), not a performance choice.
- **Resolved a plan self-contradiction around `STORAGE_PROVIDER`.** The plan's Task 2 `<action>` explicitly instructed the `s3-config.ts` header to state "(b) it deliberately ignores `STORAGE_PROVIDER`..." — but both that same task's `<done>` criteria ("no `STORAGE_PROVIDER` reference appears in either new file") and the plan's overall `<verification>` section (`grep -rn "STORAGE_PROVIDER" lib/storage/asset-source.ts lib/storage/proxy-policy.ts lib/storage/s3-config.ts` — no matches) require the literal string to be absent from that same file. Resolved by preserving the *documentation intent* (the header still explains, in full, why the legacy provider-selection flag is deliberately not read) while referring to it as "the legacy provider-selection env var that `getServerStorage()` reads in `./index.ts` (see that function's own docblock for its name/values)" instead of spelling out the literal token. Both the functional constraint (never read the flag) and the verification gate are satisfied; nothing was silently weakened.
- **R2 read goes through the existing, proven `s3-provider.ts` via `getSignedUrl` + in-process `fetch`**, not a new S3 SDK call site. This keeps the "s3-provider.ts is byte-identical" guarantee trivially true (only a dynamic `import()`, never an edit) and is also the only reliable way to get the real `content-type` header for extensionless production keys.
- **`content-length` is dropped when `content-encoding` is present (W2)**, since undici already decompresses the R2 response body by the time it's read — forwarding the header would describe the wrong (compressed) size.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan self-contradiction on `STORAGE_PROVIDER` documentation vs. verification gate**
- **Found during:** Task 2, writing `lib/storage/s3-config.ts`'s header comment
- **Issue:** The plan's `<action>` text for Task 2 required the header to literally document `STORAGE_PROVIDER` by name, while the same task's `<done>` criteria and the plan's overall `<verification>` section both grep for zero occurrences of that exact string in the same file — an unsatisfiable pair of requirements as literally written.
- **Fix:** Kept the full documentation content (why the flag is deliberately not read, and the Phase 188 rationale) but referenced it as "the legacy provider-selection env var that `getServerStorage()` reads in `./index.ts`" instead of the literal token, so the reader still gets the complete explanation and the automated grep gate is genuinely satisfied rather than fudged.
- **Files modified:** `lib/storage/s3-config.ts`
- **Verification:** `grep -rn "STORAGE_PROVIDER" lib/storage/asset-source.ts lib/storage/proxy-policy.ts lib/storage/s3-config.ts` returns no matches; `npx vitest run tests/unit/storage` still 116/116 green.
- **Committed in:** `09f5acaa` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — plan-internal contradiction, not a code bug, but the shared-process rule for "code doesn't work as intended" extends naturally to "verification gate can't pass as specified")
**Impact on plan:** No scope creep. Documentation intent fully preserved; automated gate genuinely (not superficially) green.

## Issues Encountered

None beyond the `STORAGE_PROVIDER` documentation/verification contradiction above (documented as a deviation, not a blocker — resolved without pausing).

## User Setup Required

None - no external service configuration required. This plan touches no env vars, no Coolify config, and no credentials (all R2 credentials referenced in tests are obviously-fake placeholders per CONTEXT.md's constraint).

## Next Phase Readiness

- Plan 02 (verification script) can import `s3ConfigFromEnv`/`isR2Configured` from `lib/storage/s3-config.ts` directly — exported signatures are final as specified in the plan.
- Plan 03 (the actual route handler) can import `fetchStoredAsset`, `StoredAsset`, `AssetSourceName` from `lib/storage/asset-source.ts` and `isProxyBucket`/`normalizeProxyKey`/`cacheControlFor`/`isPubliclyReadableBucket` from `lib/storage/proxy-policy.ts` — no route-handler-specific work was done here (out of scope for this plan, as specified).
- No stubs, no placeholder data paths — every exported function is fully implemented and unit-tested, including edge cases (extensionless keys, gzip content-encoding, empty Supabase blob type, malformed percent-encoded traversal segments).
- `lib/storage/s3-provider.ts` and `lib/storage/index.ts` remain byte-identical to before this plan (`git diff --stat` empty for both, verified after every task).

---
*Phase: 187-r2-provisioning-same-origin-asset-proxy*
*Completed: 2026-08-06*

## Self-Check: PASSED

All 5 created files confirmed present on disk; both task commits (`8f231dfe`, `09f5acaa`) confirmed present in git history.
