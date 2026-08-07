---
phase: 190-portable-same-origin-asset-urls
plan: 04
subsystem: infra
tags: [storage, asset-proxy, email, json-ld, csp, next-image, share-page, security]

# Dependency graph
requires:
  - phase: 190-portable-same-origin-asset-urls
    plan: 01
    provides: "absoluteAssetUrl / isStorageProxyPath / PERSISTABLE_PROXY_BUCKETS"
  - phase: 190-portable-same-origin-asset-urls
    plan: 02
    provides: "14 of 15 writers persist /storage/{bucket}/{key}; the B1 video exemption"
  - phase: 190-portable-same-origin-asset-urls
    plan: 03
    provides: "resolveAssetForRenderer — the origin-less PDF/favicon mechanism this plan must NOT reuse for email"
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "GET /storage/{bucket}/{...key} + canReadPrivateKey + isPubliclyReadableBucket"
provides:
  - "3 branded email builders emit an absolute https logo src (mail clients cannot resolve a relative path)"
  - "app/page.tsx absolutizes the organization JSON-LD logo at the CALL SITE"
  - "Both next/image company-logo sites carry `unoptimized` — the same-origin proxy path no longer routes through the self-hosted optimizer's 31-day cache"
  - "tests/unit/security/csp-same-origin-assets.test.ts — the CSP img-src/media-src pin"
  - "tests/unit/storage/anonymous-surface-invariant.test.ts — the executable form of Phase 187's 'no share-token path' exclusion"
  - "docs/STORAGE-MIGRATION.md Phase 190 section — both Phase 187 exclusions recorded as CLOSED BY CONSTRAINT"
affects: [192-cdn-cache-proof]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Origin-less consumers absolutize; browser surfaces do not — three deliberately different resolution mechanisms for one persisted path"
    - "Absolutize INSIDE, escape OUTSIDE: the resolver runs before escHtml, never after"
    - "A design exclusion is closed by an EXECUTABLE invariant (a bucket map whose justification file paths must exist on disk), not by a docblock"
    - "A CSP audit whose conclusion is 'change nothing' still ships a pinning test, so the next narrowing must be deliberate"
    - "Mutation-verify every automated gate before trusting its pass"

key-files:
  created:
    - tests/unit/email/branding-logo-absolute.test.ts
    - tests/unit/security/csp-same-origin-assets.test.ts
    - tests/unit/storage/anonymous-surface-invariant.test.ts
  modified:
    - lib/email/account-emails.ts
    - lib/email/invite-emails.ts
    - lib/email/notification-emails.ts
    - app/page.tsx
    - components/share/estimate-document-modern.tsx
    - components/workspace/estimate/estimate-document.tsx
    - next.config.ts
    - docs/STORAGE-MIGRATION.md

key-decisions:
  - "W2 resolved with `unoptimized` on both <Image> logo sites. The RED run proved the claim empirically: the rendered src really was /_next/image?url=%2Fstorage%2Flogos%2F..., which minimumCacheTTL (31 days) would pin, neutralising the proxy's deliberate 300s revalidating policy for logos (stable keys + upsert)."
  - "URL-04's code change to the CSP is ZERO. img-src already carried 'self', which is exactly what permits /storage/. No https://xtimator.com entry was added — strictly broader than 'self'. The deliverable is the pin + the recorded rationale."
  - "The JSON-LD fix is at the app/page.tsx CALL SITE, not inside organizationSchema(). The shaper is pure and has other potential callers; git grep confirmed app/page.tsx is its ONLY caller today."
  - "The invariant suite does NOT mock canReadPrivateKey (unlike tests/unit/api/storage-proxy-route.test.ts). The anonymous/non-member/member distinction IS the contract under test, so the real gate runs against mocked getAuthClaims + createClient."
  - "The branding-logo test deliberately does not mock @/lib/utils/site-url — APP_ORIGIN > NEXT_PUBLIC_SITE_URL precedence is part of the contract, and a hard-coded production domain would pass a mocked test while breaking staging."

patterns-established:
  - "Mutation-verify every automated gate: 11 mutations applied to the real tree, each observed red, each reverted"

requirements-completed: [URL-03, URL-04]

# Metrics
duration: 35min
completed: 2026-08-06
---

# Phase 190 Plan 04: Origin-less Consumers, the CSP, and the Anonymous-Surface Proof Summary

**Emails and schema.org JSON-LD now absolutize the branding logo against `getCanonicalBaseUrl()`; the two `next/image` company-logo sites stop routing the same-origin proxy path through the optimizer's 31-day cache; and Phase 187's "no share-token path" exclusion is closed by an executable invariant rather than by widening the proxy.**

## Performance

- **Duration:** ~35 min (22:38 → 23:02 UTC-4 for the commits; verification ran past that)
- **Tasks:** 3 (all TDD)
- **Files:** 11 (3 created, 8 modified)

## Task Commits

| # | Commit | Message |
| --- | --- | --- |
| 1 | `abfab2f6` | `test(190-04): failing tests for absolute logo URLs in emails and JSON-LD` (RED) |
| 2 | `f3adac9f` | `feat(190-04): absolutize the branding logo for emails and JSON-LD` (GREEN) |
| 3 | `4f7e54d9` | `test(190-04): pin the CSP img-src/media-src to the audited source list` |
| 4 | `b897a556` | `test(190-04): failing tests for the anonymous-surface invariant` (RED) |
| 5 | `b581b0c1` | `feat(190-04): skip /_next/image for the same-origin company logo` (GREEN) |
| 6 | `0762477e` | `docs(190-04): record the Phase 190 same-origin asset URL contract` |

No refactor commits were needed. 35 new tests (13 + 7 + 15).

## Accomplishments

### Task 1 — origin-less consumers (URL-03's remaining surfaces)

- `absoluteAssetUrl(logoUrl, getCanonicalBaseUrl())` added at the ONE place the logo string enters the markup in each of the three builders: `buildEmailShell` in `account-emails.ts` and `invite-emails.ts` (feeding BOTH the header and footer `<img>`), and `renderHtml` in `notification-emails.ts` (feeding both the ternary condition and the `src`). Not at the callers.
- Escaping order preserved — absolutize inside, `escHtml`/`escapeHtml` outside. Asserted: an `&` in a query string still escapes to `&amp;`.
- **W1** — `app/page.tsx` wraps the `organizationSchema` `logoUrl` argument. `git grep -n "organizationSchema("` confirmed `app/page.tsx:24` is its **only** caller, so no second wrap was needed. `lib/seo/structured-data.ts` is unchanged.
- OpenGraph/Twitter deliberately untouched: `app/layout.tsx` sets `metadataBase` and Next absolutizes metadata images against it.
- **The regression net**: a sweep asserting `expect(html).not.toMatch(/src="\/[^/]/)` on all four branded emails under all three logo shapes (relative, absolute, null). Any future email template that emits a relative `src` fails this.

### Task 2 — the CSP audit (URL-04)

**Audit conclusion: nothing was broadened, and nothing needed to be.** `img-src` already contained `'self'`, which is precisely what permits `/storage/{bucket}/{key}`. The code change to the policy string is **zero**; a 27-line rationale block and a pinning test are the deliverables.

The four recorded bullets (now at the code site in `next.config.ts`, and pinned by the test):

1. `'self'` permits the proxy route — Phase 190 requires no new source, and `https://xtimator.com` was deliberately NOT added (strictly broader than `'self'`).
2. `*.supabase.co` / `*.supabase.in` must remain in `img-src` until Phase 192 rewrites the existing absolute rows.
3. `*.supabase.co` must remain in `media-src` for a second, longer-lived reason: the hero background video stays on Supabase because the proxy has no Range/206 and Safari will not play a `<video>` without it. **Phase 192 must not drop it.**
4. `*.googleusercontent.com` is unrelated (OAuth avatars), out of scope.

The `media-src` assertion is worded — in the test, in a paragraph-long comment, and here — as a **change-detector only**. It is never a claim that `media-src 'self'` "covers" a proxied video: no video is served from `/storage/`, and CSP permission is not playback capability.

### Task 3 — `next/image`, the invariant, and the docs

**W2 was real and is now proven.** The RED run captured the actual rendered `src`:

```
expected '/_next/image?url=%2Fstorage%2Flogos%2F…' to be '/storage/logos/a1b2c3d4-…/logo.webp'
```

Both sites now carry `unoptimized` (the route the landing components already took), with the rationale at each code site. The alternative — proving the `/_next/image` path works end-to-end — was not taken, and the optimizer path is no longer reachable from these two components at all.

`tests/unit/storage/anonymous-surface-invariant.test.ts` (15 tests) covers:

- **The `AUTHENTICATED_ONLY_PERSISTED` map** — the point of the file. Every `PERSISTABLE_PROXY_BUCKETS` entry must be publicly readable OR listed with a non-empty `renderedOn`; every listed path must exist on disk; a listed bucket must not be publicly readable (dead prose detector).
- **Anonymous route reads**, against the REAL `canReadPrivateKey`:
  - `/storage/logos/{uuid}/logo.webp` → **200**, and `createClient` is never called (the exact key `lib/actions/settings.ts` hard-codes — not `buildStorageKey`).
  - `/storage/platform-brand/logo-1777861695749.webp` → **200**.
  - `/storage/photos/{uuid}/price-book/1784854705622-{itemUuid}.webp` → **404, asserted not 403**, body `Not found`, `fetchStoredAsset` never called. The millisecond segment is present, matching what `buildStorageKey` actually emits.
  - authenticated **non-member**, same key → 404; authenticated **member** → 200 with `private, no-store`.
- **Share-page resolution** — `attachedPhotos[].url` is an absolute signed URL with `isStorageProxyPath(url) === false`, resolved with the unchanged `getSignedUrl('photos', path, 3600)`; a relative `companies.logo_url` passes through verbatim; an absolute one also does.

`docs/STORAGE-MIGRATION.md` gained a ~150-line `## Phase 190` section with all six mandated parts, including the 15-writer table and the video exemption stated as a standing consequence rather than a footnote.

## Deviations from Plan

### 1. [Process] Commits were made per task, contradicting the plan's verification step 7

`190-04-PLAN.md` step 7 says "Nothing is committed … the orchestrator handles commits." The orchestrator's dispatch instruction for this run says the opposite: *"Atomic commit per task."* The explicit, more recent instruction was followed. Six commits exist; the plan file itself was not edited.

### 2. [Rule 3 - Blocking] Two plan-stated test paths do not exist

- Task 3's `<verify>` names `tests/unit/share`. There is no such directory — the share-query suite is the single file `tests/unit/share-query.test.ts`. Run as that path instead.
- `tests/unit/email/` and `tests/unit/security/` did not exist and were created by this plan. (The three pre-existing email suites live under `tests/unit/notifications/`; they were run as a regression check and stayed green.)

### 3. [Documented] Verification step 6c's stated expectation was violated — by the plan's own mandated comment

Step 6c expects `grep -n "supabase" next.config.ts | grep -E "img-src|media-src"` to return **2 hits**. It returns **4**, because Task 2's mandated rationale block quotes both directive names while explaining them. The two *directive* lines are still exactly two:

```
$ grep -nE '^\s+"(img|media)-src' next.config.ts
52:  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://*.googleusercontent.com",
56:  "media-src 'self' blob: https://*.supabase.co",
```

The substantive criterion holds; the grep as literally written is now self-defeating for the same reason 190-03's `asset-inline.ts` gate was (prose that explains a symbol also matches a grep for it). Recorded rather than worked around by weakening the comment.

### 4. [Naming, inherited] The plan's `<behavior>` says `saveCompanySettings`

The real export is `updateCompanySettings` (`lib/actions/settings.ts`) — already recorded as a deviation in 190-02's summary. The **key shape** the plan cited (`{companyId}/logo.webp`, hard-coded, not via `buildStorageKey`) is correct and is what the test asserts.

**No Rule 1/2/4 deviations. No architectural change. No checkpoint.**

## Verification (actual, honest results)

### 1. Full CI suite — `npx vitest run tests/unit tests/eval`, redirected to a file, `$?` captured directly (never through a pipe)

```
FULL_EXIT=1
Test Files  4 failed | 626 passed | 1 skipped (631)
     Tests  4 failed | 5539 passed | 20 todo (5563)
```

Verbatim failing list, and the verdict on each:

| File | Verdict |
| --- | --- |
| `tests/unit/sign-estimate-atomic-migration.test.ts` | KNOWN Windows/CRLF — passes in CI. **Confirmed still failing in isolation.** |
| `tests/unit/signature-evidence-retention-migration.test.ts` | KNOWN Windows/CRLF — passes in CI. **Confirmed still failing in isolation.** |
| `tests/unit/mcp-route-contract.test.ts` | `Error: Test timed out in 15000ms` — the documented fork-pool flake |
| `tests/unit/actions/team-invite.test.ts` | `Error: Test timed out in 15000ms` — CPU contention |

**This is EXACTLY the four-file baseline stated in the dispatch instruction. Zero files beyond it. Zero regressions attributable to this plan.**

`team-invite` deserves the extra scrutiny because it exercises `lib/actions/team` → `lib/email/invite-emails.ts`, a file this plan modified. It is a timeout, not an assertion failure, and re-running the two contended files isolated gives:

```
ISO_EXIT=0
Test Files  2 passed (2)
     Tests  19 passed (19)
```

Contention was self-inflicted and is accounted for: `npx next build` was running concurrently with the full suite on the same box.

The two CRLF files re-run isolated alongside the demo sweep:

```
EXIT=1
Test Files  2 failed | 1 passed (3)
     Tests  2 failed | 40 passed (42)
```

— i.e. only the two known CRLF files, with `tests/unit/demo/mutation-boundary-sweep.test.ts` green.

### 2. `npx tsc -p tsconfig.ci.json --noEmit` → **TSC_EXIT=0**

### 3. `npx next build` → **BUILD_EXIT=0** (`✓ Compiled successfully in 58s`)

Route manifest checked directly (not just the build log — this repo has a prior route-manifest outage):

```
/storage/[bucket]/[...key]   PRESENT
/icon                        PRESENT
/apple-icon                  PRESENT
/                            PRESENT
```

No route-conflict error.

### 4. No route handler added — the demo mutation-boundary manifest needs no edit

No file under `app/` was added by this plan (`app/page.tsx` is modified, not created). `tests/unit/demo/mutation-boundary-sweep.test.ts` is green both inside the full run and in isolation.

### 5. Forbidden files untouched

```
$ git log --oneline abfab2f6^..HEAD -- lib/storage/s3-provider.ts lib/storage/index.ts \
    lib/storage/asset-source.ts lib/actions lib/image
(empty)
```

`git diff --stat` over `lib/actions` / `lib/image` shows changes only in the WIDER phase range (sibling plans 190-02 / 189), never in this plan's six commits. **PDF-LOGO-01 was not attempted.** The per-commit file list above is the full extent of this plan's writes.

### 6. The revised falsifiable greps — every expectation met exactly

```
(a) $ grep -rn "supabase\.co/storage" app lib components --include=*.ts --include=*.tsx
    (no output, grep exit 1)                                       EXPECTED: none  ✓

(b) $ grep -rn "\.getPublicUrl(" app lib components --include=*.ts --include=*.tsx
    app/admin/landing/actions.ts:202:  newBgVideoUrl = storage.getPublicUrl('platform-brand', result.path)
    lib/storage/supabase-provider.ts:76: const { data } = client.storage.from(bucket).getPublicUrl(path)
                                                                       EXPECTED: exactly 2  ✓

(c) CSP directive lines naming supabase: exactly 2 (see Deviation 3 for the
    grep-wording discrepancy — the directives themselves are as expected)
```

### 7. Every automated gate was proven capable of failing

Eleven mutations, each applied to the real tree, observed red, and reverted with a clean `git status` afterwards.

**Task 1** (`tests/unit/email/branding-logo-absolute.test.ts`, 13 tests):

| Mutation | Result |
| --- | --- |
| Revert `app/page.tsx` to `logoUrl: branding.logoUrl` | **2 failed** |
| Revert the header `<img>` in all three shells to the raw value | **5 failed** |
| (the suite before implementation) | **9 failed / 4 passed** |

**Task 2** (`tests/unit/security/csp-same-origin-assets.test.ts`, 7 tests):

| Mutation | Result |
| --- | --- |
| A — add `https://evil.example.com` to `img-src` | 2 failed |
| B — add `https://xtimator.com` to `img-src` (the forbidden broadening) | 2 failed |
| C — drop `*.supabase.co` from `media-src` (the Phase 192 mistake) | 1 failed |
| D — drop `'self'` from `img-src` | 2 failed |
| E — reword the `Range/206` rationale away | 1 failed |

**Task 3** (`tests/unit/storage/anonymous-surface-invariant.test.ts`, 15 tests):

| Mutation | Result |
| --- | --- |
| (the suite before the `unoptimized` fix) | **3 failed** — and the failure message is the W2 evidence |
| A — add `audio` to `PERSISTABLE_PROXY_BUCKETS` | 1 failed |
| B — point a `renderedOn` entry at a nonexistent file | 1 failed |
| C — make `photos` publicly readable in `proxy-policy.ts` | **3 failed** (invariant + anon-404 + non-member-404) |
| D — delete the private-bucket ownership gate from the route | 2 failed |
| E — make `share.ts` persist `/storage/photos/...` instead of signing | 1 failed |

Mutations C, D and E are the security-relevant ones: each is a plausible future edit that would leak a tenant-private object or bake a credential-less URL into a share payload, and each is now caught.

## Known Stubs

None. Every function and assertion added is fully implemented. No placeholder values, no empty-array data sources, no TODO/FIXME markers introduced. The one deliberately *unchanged* thing — the hero background video's absolute Supabase URL — is a documented exemption owned by Plan 02 and now recorded as a standing consequence in `docs/STORAGE-MIGRATION.md`, not a stub.

## Issues Encountered

- **The plan's step-6c grep is self-defeating**, in the same way 190-03's `asset-inline.ts` gate was: a comment that explains a directive also matches a grep for that directive. Recorded in full (Deviation 3) rather than silently weakening the comment the plan itself mandated.
- **Running `next build` concurrently with the full vitest suite is enough to produce two timeout flakes on this box.** Both re-ran green isolated. Worth remembering: on this machine, `Error: Test timed out` in the full-suite output means contention until proven otherwise, and the proof is a targeted re-run.

## User Setup Required

None. No env var, no `S3_*` value, no Coolify change, no migration to apply. Nothing about this plan requires production configuration.

## Next Phase Readiness

- **Phase 192 (URL-02 + PROXY-05) is unblocked.** Before it narrows the CSP it must read `tests/unit/security/csp-same-origin-assets.test.ts` — narrowing `img-src` requires a deliberate edit to that test, and **`media-src` must keep `https://*.supabase.co`** regardless (the video prerequisite is Range/206 on the proxy, not a row rewrite).
- **When 192 rewrites rows**, the "absolute input is byte-identical" property that every resolver in this phase relies on is what makes the rewrite a no-op for already-migrated surfaces — and `absoluteAssetUrl` will simply stop having anything to do for `logos`/`platform-brand`.
- **PDF-LOGO-01 should be scheduled.** It is unrelated to this plan and untouched by it, but company logos still do not render in any estimate PDF (WebP vs `@react-pdf/image`'s jpg/png-only decoder), while the header still reserves 64-72pt for them.
- **Two known Windows/CRLF migration-shape tests still fail locally.** They pass in CI; not this plan's.

## State-Update Notes (honest record)

1. **URL-03 and URL-04 are marked complete by this plan.** URL-03 was deliberately left unchecked by 190-03 because it reads "*every* surface … **and email/WhatsApp sends**" — email is this plan. URL-04 ("the CSP permits the same-origin image source and gains no new host") is closed here, with the honest note that the closing evidence is an audit + a pin, not a policy edit.
2. **A pre-existing uncommitted `.planning/STATE.md` correction was present** when this plan started (a hand-fix of the corrupted `progress` counters that 190-02's summary flagged: `374/369 = 100%` → `381/387 = 98%`, plus a refreshed `last_activity`). It is not this plan's work; it was carried into the final metadata commit rather than left to be lost, and is disclosed here.
3. Any milestone-revert by the state tooling was re-asserted to `v4.24 / Same-Origin Storage on R2 / in_progress` after the last state command, per the known GSD bug.

## Self-Check: PASSED

All 11 claimed files exist on disk (3 created, 8 modified). All 6 claimed commit
hashes resolve (`abfab2f6`, `f3adac9f`, `4f7e54d9`, `b897a556`, `b581b0c1`,
`0762477e`). The `AUTHENTICATED_ONLY_PERSISTED` justification paths are verified
on disk by the test suite itself, not just by this check.

---
*Phase: 190-portable-same-origin-asset-urls*
*Completed: 2026-08-06*
