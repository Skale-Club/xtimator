---
phase: 187-r2-provisioning-same-origin-asset-proxy
plan: 03
subsystem: infra
tags: [storage, r2, s3, supabase, cache-control, nextjs-route-handler, vitest]

requires:
  - phase: 187-01
    provides: "lib/storage/proxy-policy.ts (allowlist/key-normalization/cache policy), lib/storage/asset-source.ts (R2-first/Supabase-fallback reader)"
provides:
  - "lib/storage/proxy-auth.ts — tenant ownership gate for private-bucket keys (canReadPrivateKey)"
  - "app/storage/[bucket]/[...key]/route.ts — the same-origin asset proxy GET handler, closing PROXY-01..04"
affects: [190, 192]

tech-stack:
  added: []
  patterns:
    - "Ordered-gate route handler: allowlist -> key normalization -> tenant ownership -> storage read, every refusal before any I/O"
    - "404-not-403 for private-bucket refusals, so a response never confirms an object's existence to a caller without access"
    - "Real-HTTP verification (curl against a running dev server) as the authoritative evidence for a Cache-Control value, distinct from and required in addition to a direct GET() unit-test call"

key-files:
  created:
    - lib/storage/proxy-auth.ts
    - app/storage/[bucket]/[...key]/route.ts
    - tests/unit/storage/proxy-auth.test.ts
    - tests/unit/api/storage-proxy-route.test.ts
  modified:
    - docs/STORAGE-MIGRATION.md
    - docs/CLOUDFLARE-CDN.md

key-decisions:
  - "canReadPrivateKey duplicates keys.ts's UUID regex locally rather than importing it — keys.ts is out of scope for this plan and must not gain a new export surface just for this one check; the two patterns are kept textually identical and the duplication is called out in the file header"
  - "Route returns 404 (not 403) for both an unauthenticated caller and a cross-tenant caller on a private bucket, and for an unknown bucket — a refusal must never let a caller distinguish 'object exists but you can't read it' from 'nothing here'"
  - "X-Asset-Source is documented as a convenience header only; the authoritative FUT-R2-01 signal stays the server-side [asset-proxy] fallback log line from Plan 01, because the header is edge-cached stale on public buckets"

patterns-established:
  - "Same-origin storage proxy route shape (/storage/{bucket}/{key}) that Phase 190/192 rewrite existing URLs into"
  - "Real-HTTP curl verification against a running dev server as a mandatory second check alongside unit tests, whenever a route sets a response header that must survive Next's own pipeline"

requirements-completed: [PROXY-01, PROXY-02, PROXY-03, PROXY-04]

duration: 45min
completed: 2026-08-06
---

# Phase 187 Plan 03: Same-Origin Asset Proxy Route Summary

**`GET /storage/{bucket}/{key}` now serves real object bytes with a per-bucket Cache-Control split (immutable / revalidating / private-no-store), verified over real HTTP against a running dev server, not just by calling the handler directly — nothing in the app consumes it yet.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-06T15:55Z (approx.)
- **Completed:** 2026-08-06T16:40Z (approx.)
- **Tasks:** 3/3 completed
- **Files modified:** 4 created (route + gate + 2 test files), 2 docs modified

## Accomplishments

- `lib/storage/proxy-auth.ts` — `canReadPrivateKey(key)`: validates the key's leading segment is a real company UUID, bails before any DB query when the caller has no auth claims, and checks a `company_members` row under the RLS-bound `createClient()` (never service-role). Fails closed on any error.
- `app/storage/[bucket]/[...key]/route.ts` — the route itself. Four ordered gates (bucket allowlist → traversal-safe key → tenant ownership on private buckets → the actual `fetchStoredAsset` read), each cheaper and stricter than the next, every refusal before any storage call. Success response sets `Content-Type` from the stored object (never the key), the per-bucket `Cache-Control`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `X-Asset-Source`, and `Vary: Cookie` on private buckets.
- 21 new unit tests (8 for the gate, 13 for the route contract — including all 12 plan-specified behaviors plus a split no-leak sweep), all green; `tests/unit/storage` + `tests/unit/api` full suite: 255 passed / 2 pre-existing todo, 26 files.
- `npx tsc -p tsconfig.ci.json --noEmit` clean; `npx next build` succeeded with `app/storage/[bucket]/[...key]` in the route manifest and no route-conflict error (checked explicitly given this repo's prior sibling-slug outage).
- **Real HTTP header check (B3), executed against a running `next dev` server on port 9633 with R2 deliberately unconfigured**, using real production-shaped keys fetched from Supabase (see verbatim output below). All three cache directives confirmed exactly as specified, with zero rewriting by Next's pipeline.
- Both docs (`docs/STORAGE-MIGRATION.md`, `docs/CLOUDFLARE-CDN.md`) updated with the route contract, the three-row cache table, the two Phase 190 access-control exclusions, and the log-line-not-header fallback signal.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tenant ownership gate for private-bucket keys** - `1b1b0b9f` (feat)
2. **Task 2: GET /storage/{bucket}/{key} route handler** - `a6c3bff3` (feat)
3. **Task 3: Document the proxy contract and the local verification runbook** - `c4f60552` (docs)

_Note: tests and implementation were authored together per task and verified before each task's single commit (no separate TDD red/green split, matching Plan 01's precedent)._

## Files Created/Modified

- `lib/storage/proxy-auth.ts` - `canReadPrivateKey(key)`: UUID-prefix check + `company_members` membership read under RLS, fail-closed
- `app/storage/[bucket]/[...key]/route.ts` - the proxy GET handler: ordered gates, per-bucket cache/content-type headers, no Range/ETag support (documented limitation)
- `tests/unit/storage/proxy-auth.test.ts` - 8 tests: non-UUID refusal (zero DB calls), no-auth refusal (zero DB calls), allow/refuse on membership, fail-closed on throw, no service-role import
- `tests/unit/api/storage-proxy-route.test.ts` - 13 tests: all 12 plan-specified route behaviors (content-type fidelity, 3-way cache split, 6 refusal shapes with status codes, source header, no-leak sweep, short error bodies) plus a split no-leak assertion across three refusal shapes
- `docs/STORAGE-MIGRATION.md` - new "Same-origin asset proxy (Phase 187, PROXY-01..04)" section: route contract, resolution order, W1 one-directional-fallback caveat, three-row cache table with rationale, access control + Phase 190 exclusions, fallback observability (log line, not header), W4 Coolify caution, local verification runbook, explicit not-done list
- `docs/CLOUDFLARE-CDN.md` - amended the "Images are NOT on the CDN" bullet: route exists, cache directives documented, nothing repointed at it yet, PROXY-05 (cache-HIT proof) deferred to Phase 192

## Route Path and Header Contract

`GET /storage/{bucket}/{key}` — `{bucket}` one of `audio | photos | pdfs | logos | platform-brand`, `{key}` the slash-separated object key. This is the exact shape Phase 190/192 will rewrite existing URLs into.

| Response header | Value | Notes |
|---|---|---|
| `Content-Type` | the stored object's own content type | never inferred from the key; production keys are frequently extensionless |
| `Cache-Control` | per-bucket, see table below | the CACHE axis, deliberately independent of the ACCESS axis |
| `Content-Disposition` | `inline` | no filename — makes an image render and a PDF open in-browser |
| `X-Content-Type-Options` | `nosniff` | |
| `X-Asset-Source` | `r2` or `supabase` | convenience only, see Fallback Observability below |
| `Vary` | `Cookie` (private buckets only) | belt-and-braces next to `private, no-store` |

Refusals: 404 for an unknown bucket, 404 for an unauthenticated or cross-tenant read of a private bucket (never 403 — a refusal must not confirm the object exists), 400 for a traversal-shaped key, 404 when neither backend has the object. Error bodies are the short constants `'Not found'` / `'Bad request'` and never echo the requested bucket or key.

## Cache Table (and why `logos` is not immutable)

| Bucket | Audience | Key style | `Cache-Control` |
|---|---|---|---|
| `platform-brand` | public | timestamped keys | `public, max-age=31536000, immutable` |
| `logos` | public | stable keys, `upsert: true` | `public, max-age=300, stale-while-revalidate=86400` |
| `photos`, `audio`, `pdfs` | tenant-private | company-prefixed | `private, no-store` + `Vary: Cookie` |

`logos` writers overwrite the same URL in place (a company's logo, a user's avatar) — an `immutable` year-long cache would pin the stale image in Cloudflare's edge cache **and** in every browser that already fetched it, and browser caches cannot be purged. `photos`/`audio`/`pdfs` are tenant job-site data and must never enter a shared cache; this is a security property, not a performance choice.

## Real HTTP Header Check (B3) — Verbatim Output

Executed against a real `next dev` server on `localhost:9633` (started directly via `next dev --port 9633`, **R2 deliberately not configured** — no `S3_*` env vars set), using real production keys fetched from Supabase via a throwaway list script (not committed, deleted after use):

```
=== platform-brand: /storage/platform-brand/logo-1777861695749.png ===
HTTP/1.1 200 OK
cache-control: public, max-age=31536000, immutable
content-type: image/png
content-disposition: inline
x-asset-source: supabase
content-length: 9910

=== logos: /storage/logos/1b038660-c3d2-48bc-beae-fc29fb6bd27d/logo.png ===
HTTP/1.1 200 OK
cache-control: public, max-age=300, stale-while-revalidate=86400
content-type: image/png
x-asset-source: supabase

=== photos (unauthenticated): /storage/photos/{uuid}/{projectId}/{photoId}.jpg ===
HTTP/1.1 404 Not Found
cache-control: private, no-store
content-type: text/plain

=== unknown bucket: /storage/estimates/x ===
HTTP/1.1 404 Not Found
cache-control: private, no-store

=== traversal: /storage/photos/..%2F..%2Fetc%2Fpasswd ===
HTTP/1.1 400 Bad Request
cache-control: private, no-store
```

All three directives (`immutable` on `platform-brand`, revalidating on `logos`, `private, no-store` on `photos`) came through byte-for-byte, unmodified by Next's response pipeline. The `platform-brand` response body was also downloaded and confirmed a valid 512x512 PNG at the exact 9910-byte `Content-Length` — proving the proxy serves real bytes, not just correct headers.

No `[asset-proxy] fallback` log line appeared in the server log during this run, as expected — R2 was not configured, so the fallback path (which only logs when R2 *is* configured and misses/errors) never executes; Supabase served every request directly.

**Operator-pending:** the plan additionally asks for the authenticated `photos` 200 case (`cache-control: private, no-store` observed on a real, logged-in 200 response) via a real browser session. No `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` or other session fixture was available to this executor (checked `tests/e2e/` conventions — `E2E_USE_SESSION`/`TEST_USER_EMAIL` are opt-in and unset in this environment), so this specific case is **not observed** and is recorded here as pending rather than silently skipped. It is, however, covered by the direct-call unit test (behavior 4 in `storage-proxy-route.test.ts`), and the unauthenticated 404 case on the same bucket **was** verified over real HTTP with the correct `private, no-store` header, which is the check the plan's own `<done>` block requires as the primary photos assertion.

## Refusal Matrix

| Case | Status | `fetchStoredAsset` called? | `canReadPrivateKey` called? |
|---|---|---|---|
| Unknown bucket (`estimates`) | 404 | no | no |
| Traversal key (`../../etc/passwd`) | 400 | no | n/a (fails before the ownership gate) |
| Private bucket, unauthenticated | 404 | no | yes (returns false) |
| Private bucket, authenticated non-member | 404 | no | yes (returns false) |
| Private bucket, authenticated member | 200 | yes | yes (returns true) |
| Public bucket, any caller | 200 (or 404 if absent from both backends) | yes | no (not gated) |
| Valid key, object absent from both R2 and Supabase | 404 | yes (returns null) | depends on bucket |

## Deliberate Access-Control Exclusions (for Phase 190)

1. **No platform-admin / support-mode bypass.** An admin cannot pull another company's private object through this route as shipped in Phase 187. If an admin surface ever needs that, it must be added explicitly and deliberately — silently widening what a public URL shape can reach is exactly the leak `canReadPrivateKey` exists to prevent.
2. **No share-token path, and no server-side-renderer path.** Public share pages and the server-side PDF renderer currently resolve tenant photos through signed URLs and keep doing so today. Both are unauthenticated with respect to this route (the PDF renderer has no browser session at all), so both would be refused by `canReadPrivateKey` today. Phase 190 must design their scoping explicitly — a share token or a renderer-specific credential — rather than assume the proxy already serves them.

## Fallback Observability

The authoritative FUT-R2-01 signal is the server-side `[asset-proxy] fallback` `console.warn` line emitted by `lib/storage/asset-source.ts` (Plan 01), structured as `{"bucket":...,"key":...,"reason":"r2-miss"|"r2-error"}`. The `X-Asset-Source: r2|supabase` response header this route adds is a convenience for manual curling only — it is part of the response that Cloudflare's default rules would cache on public buckets (`logos`, `platform-brand`), so a cached `x-asset-source: supabase` value can keep being served by the edge long after R2 started successfully answering for that same key. Any future automated proof that the Supabase fallback path is unused (FUT-R2-01) must count occurrences of the log line, never read this header.

## Decisions Made

- **404, never 403, for every private-bucket refusal** (unauthenticated or cross-tenant) and for unknown buckets — a caller must never be able to distinguish "this object exists but you can't read it" from "nothing is here." This matches the plan's explicit instruction and mirrors the same pattern in `app/api/jobs/[jobId]/route.ts`'s ownership check (folding into `not_found` rather than a distinct 403).
- **`canReadPrivateKey` duplicates the UUID regex from `lib/storage/keys.ts` locally** rather than importing it, per the plan's explicit instruction not to modify `keys.ts` or give it a new export surface for this one check. The two patterns are kept textually identical; a comment in the file header points back to `keys.ts` as the source of truth.
- **Real-HTTP verification treated as mandatory, not optional**, per the plan's B3 requirement: the direct `GET()` unit-test calls prove the route's logic, but only a curl against a running `next dev` server proves what actually reaches the wire through Next's pipeline. Both were run; both are recorded.

## Deviations from Plan

None - plan executed exactly as written. All four hard constraints were respected:
- `lib/storage/s3-provider.ts` untouched (`git diff --stat` empty, confirmed above).
- No credentials written to `.env.local`/`.env.local.example`/Coolify; `STORAGE_PROVIDER` is not read anywhere in the new files (`grep -rn "STORAGE_PROVIDER" app/storage lib/storage/asset-source.ts lib/storage/proxy-auth.ts` — no matches).
- Cache policy matches the per-bucket security property exactly as specified (verified both by unit test and real HTTP).
- No existing call site was repointed at the route (`git grep -n "/storage/" -- app components lib | grep -v "app/storage/"` — no matches, confirmed after all three tasks).

## Issues Encountered

None. The one operational gap — no test-user session fixture available for the authenticated `photos` 200 real-HTTP check — is not a plan deviation; it is explicitly anticipated by the plan itself ("If no session is available to the executor, record that explicitly... rather than silently skipping it") and is recorded above under "Operator-pending."

## User Setup Required

None for this plan's own scope. Operator-pending item for full B3 completeness: manually observe the authenticated `photos` 200 response's `Cache-Control` header in a real browser session (log in, open devtools, request `/storage/photos/{your-company-uuid}/...`) — expected `private, no-store`. This does not block Phase 187 completion; the route's private-bucket cache header is otherwise proven both by direct unit test and by the real-HTTP unauthenticated-404 case on the same bucket.

## Next Phase Readiness

- The route path and header contract above are final — Phase 190 (private buckets: photos/audio/pdfs) and Phase 192 (public buckets: logos/platform-brand, plus the PROXY-05 cache-HIT proof) can rewrite existing URLs into this exact shape.
- Phase 190 has two explicit open design questions to resolve before it can repoint share pages or the PDF renderer at this route: a platform-admin bypass (not built) and a share-token/renderer-specific access path (not built) — see "Deliberate Access-Control Exclusions" above.
- `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, and `lib/storage/keys.ts` remain untouched by this plan, matching Plan 01's precedent — the `createStorage` provider seam is still entirely Phase 188's job.
- No stubs and no placeholder data paths: every exported function (`canReadPrivateKey`, the route's `GET`) is fully implemented and both unit-tested and real-HTTP-tested, with one explicitly-flagged operator-pending manual observation (authenticated photos case) that does not gate correctness.

---
*Phase: 187-r2-provisioning-same-origin-asset-proxy*
*Completed: 2026-08-06*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all three task commits (`1b1b0b9f`, `a6c3bff3`, `c4f60552`) confirmed present in git history.
