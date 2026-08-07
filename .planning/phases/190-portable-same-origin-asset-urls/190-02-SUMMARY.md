---
phase: 190-portable-same-origin-asset-urls
plan: 02
subsystem: storage
tags: [storage, asset-proxy, url, server-actions, static-gate, safari, range-requests]

# Dependency graph
requires:
  - phase: 190-portable-same-origin-asset-urls
    plan: 01
    provides: "storageProxyPath() + PERSISTABLE_PROXY_BUCKETS — the one emitter for /storage/{bucket}/{key}"
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "GET /storage/{bucket}/{...key} asset proxy + canReadPrivateKey gate"
provides:
  - "14 of 15 persisted-URL writers emit a same-origin /storage/ path — no backend hostname reaches a new DB row"
  - "The hero-background-VIDEO exemption, documented at the code site, narrowly allowlisted, and pinned by a POSITIVE test"
  - "tests/unit/storage/persisted-url-form.test.ts — repo-wide static gate on the .getPublicUrl( CALL shape"
affects: [190-03, 190-04, 192-cdn-cache-proof]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Writers persist a path, never a hostname — the origin is chosen at render time (Plans 03/04)"
    - "A deliberate exemption is pinned by a POSITIVE test, not by silence"
    - "Static gates scan the CALL shape, not the identifier — declarations and docblocks are not call sites"

key-files:
  created:
    - tests/unit/actions/persisted-asset-urls.test.ts
    - tests/unit/admin/save-landing-asset-urls.test.ts
    - tests/unit/storage/persisted-url-form.test.ts
  modified:
    - lib/actions/settings.ts
    - lib/actions/company.ts
    - lib/actions/client.ts
    - lib/actions/admin-company.ts
    - lib/actions/price-book.ts
    - app/admin/branding/actions.ts
    - app/admin/landing/actions.ts
    - app/admin/seo/actions.ts
    - tests/unit/branding-actions.test.ts
    - tests/unit/admin/save-seo.test.ts

key-decisions:
  - "The hero background video is NOT repointed: the proxy has no Range/206, and Safari refuses to play a <video> from an origin without byte-range support"
  - "settings.ts's URL derivation moved INSIDE the existing try, because storageProxyPath() throws by design"
  - "The gate scans `\\.getPublicUrl\\(`; a bare-identifier scan is red on a clean tree (6 files hold the word as a comment or declaration)"
  - "The landing-file allowlist is narrowed to exactly one occurrence bound to `newBgVideoUrl`, not a whole-file pass"

requirements-completed: [URL-01]

# Metrics
duration: 65min
completed: 2026-08-06
---

# Phase 190 Plan 02: Repoint the Asset Writers Summary

**14 of the 15 `getPublicUrl()` writers now persist `/storage/{bucket}/{key}`; the 15th — the landing hero background video — is deliberately left absolute because the asset proxy has no Range/206 and Safari will not play a `<video>` without it.**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-08-07T01:17:05Z
- **Completed:** 2026-08-07T02:22:52Z
- **Tasks:** 3 (Tasks 1 and 2 TDD)
- **Files modified:** 13 (3 created, 10 modified)

## Task Commits

1. **Task 1 (RED)** — `25f1f073` `test(190-02): failing tests for the 7 tenant-scoped persisted asset URLs`
2. **Task 1 (GREEN)** — `11659ce9` `feat(190-02): tenant-scoped writers emit same-origin asset paths`
3. **Task 2 (RED)** — `d2c65b38` `test(190-02): failing tests for platform-brand same-origin paths`
4. **Task 2 (GREEN)** — `50bc49c0` `feat(190-02): platform-brand writers emit same-origin paths, except the video`
5. **Task 3** — `4d8fac52` `test(190-02): repo-wide static gate against getPublicUrl regressions`
6. **Deviation** — `f3a1bb05` `docs(190-02): correct the onboarding-logo docstring for same-origin paths`

No refactor commits were needed.

## Accomplishments

- **14 call sites repointed**, verified by an exact count that excludes the comment lines which also mention `storageProxyPath()`:

  | File | Call sites |
  | --- | --- |
  | `lib/actions/settings.ts` | 95, 476 |
  | `lib/actions/company.ts` | 106 |
  | `lib/actions/client.ts` | 136 |
  | `lib/actions/admin-company.ts` | 93 |
  | `lib/actions/price-book.ts` | 261, 340 |
  | `app/admin/branding/actions.ts` | 61, 84 |
  | `app/admin/landing/actions.ts` | 91, 143, 249, 302 |
  | `app/admin/seo/actions.ts` | 78 |

- **The 15th site is untouched and now self-documenting.** `app/admin/landing/actions.ts:202` keeps `storage.getPublicUrl('platform-brand', result.path)` under a 9-line comment naming the Range/206 prerequisite, the Safari consequence, the 20MB/no-transcode reality, and the tripwire test.
- **Price-book thumbnails are fixed as a side effect.** `photos` is a PRIVATE bucket; `getPublicUrl()` was writing a Supabase *public-object* URL that 400s. Those images have been silently broken. They now resolve through the proxy's `canReadPrivateKey` gate.
- **Pre-existing rows are untouched.** No backfill, no migration, no rewrite — confirmed by verification 7 below.

## Decisions Made

1. **`settings.ts:94` moved inside the `try`.** `storageProxyPath()` throws by design (Plan 01: reject-never-repair). Left outside, a throw would have escaped the server action instead of returning `'Failed to upload logo. Please try again.'`. Same reasoning applied to `branding` and `seo`, whose derivations also sat outside their `try`.
2. **The gate scans the call shape.** Confirmed empirically before writing it: a bare `getPublicUrl` scan matches 6 files that are comments or declarations (`app/storage/[bucket]/[...key]/route.ts:14`, `lib/storage/index.ts:107`, `s3-provider.ts:43,113`, `supabase-provider.ts:75`, and — new since the plan was written — `lib/storage/browser-upload.ts:247`, an object-literal method from 189-03). The call-shape scan matches none of them.
3. **The landing allowlist is narrow.** Two separate assertions: exactly ONE `.getPublicUrl(` in that file, and its line must bind `newBgVideoUrl`. A second occurrence, or the same one rebound, fails.
4. **`vi.spyOn(Date, 'now')` rather than a literal-free regex** for the price-book key, so the assertion is the literal `{companyId}/price-book/1700000000000-{itemId}.webp` — with a regex assertion kept alongside it as a second net.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two plan-stated action names do not exist**
- **Found during:** Task 1
- **Issue:** The plan's `<behavior>` names `saveCompanySettings` and `createCompanyAsAdmin`. The real exports are `updateCompanySettings` (`lib/actions/settings.ts`) and `createAdminCompany` (`lib/actions/admin-company.ts`).
- **Fix:** Tests written against the real names. Line numbers and buckets in the plan's 15-row table were all correct.
- **Commit:** `25f1f073`

**2. [Rule 1 - Bug] `updateProfile` returns `{ ok: true }`, not `{ success: true }`**
- **Found during:** Task 1 GREEN
- **Issue:** My own RED test asserted the wrong return shape and stayed red after a correct implementation.
- **Fix:** Corrected the test expectation. Not a production change.
- **Commit:** `11659ce9`

**3. [Rule 2 - Missing Critical] The onboarding-logo docstring became a trap**
- **Found during:** Final review
- **Issue:** `uploadOnboardingLogoAction`'s docstring warned that the old code "stored the bare storage PATH ... instead of a usable URL". After this plan the function returns a relative path, so that warning reads as an instruction to revert the change.
- **Fix:** Rewrote it to name the distinction — the old bug persisted a bare KEY (`{userId}/logo.webp`); this persists a routed path (`/storage/logos/...`). "A relative value is only correct when it is a path the app actually routes."
- **Files modified:** `lib/actions/company.ts`
- **Commit:** `f3a1bb05`

### Process deviation (not a code change)

**4. A concurrent sibling's file was swallowed by commit `11659ce9`.**
`tests/unit/storage/storage-migration-runbook.test.ts` (owned by 191-03) was already `git add`-ed to the shared index by the sibling executor when I ran `git commit` with an explicit file list — `git commit` commits the whole index, so it came along.
**Not corrected by rewriting history:** three executors were committing to `main` concurrently, and a `reset --soft` + recommit would have raced them for a cosmetic gain. No content was lost or altered; the file is intact and 191-03 completed normally (`093ff992`).
**Corrected forward:** every subsequent commit used `git commit -m ... -- <paths>`, which commits working-tree content for those paths only and ignores the rest of the index. No further contamination occurred.

---

**Total deviations:** 3 auto-fixed + 1 process note. No scope creep; nothing outside the plan's 8 production files was modified by this plan.

## Verification (actual, honest results)

### 1. `grep -rn "\.getPublicUrl(" app lib components` — EXACTLY two lines

```
app/admin/landing/actions.ts:202:      newBgVideoUrl = storage.getPublicUrl('platform-brand', result.path)
lib/storage/supabase-provider.ts:76:      const { data } = client.storage.from(bucket).getPublicUrl(path)
```

### 2. Full CI suite — `npx vitest run tests/unit tests/eval`, redirected to a file, `$?` on the following line (never through a pipe)

```
VITEST_EXIT=1
Test Files  5 failed | 622 passed | 1 skipped (628)
     Tests  6 failed | 5502 passed | 20 todo (5528)
```

Failing files, verbatim, with honest verdicts:

| File | Verdict |
| --- | --- |
| `tests/unit/sign-estimate-atomic-migration.test.ts` | KNOWN Windows/CRLF — passes in CI |
| `tests/unit/signature-evidence-retention-migration.test.ts` | KNOWN Windows/CRLF — passes in CI |
| `tests/unit/mcp-route-contract.test.ts` | KNOWN fork-pool flake |
| `tests/unit/actions/team-invite.test.ts` | Timeout under fork-pool contention |
| `tests/unit/billing/seat-billing-wiring.test.ts` | Mock call-count under fork-pool contention |

The last three re-run **isolated: 3 files, 29 tests, EXIT=0**.

**Only the two known CRLF files genuinely fail. Zero regressions attributable to this plan.**

**Contention caveat, stated plainly.** Two sibling executors (190-03, 191-03) were running concurrently on this machine. Earlier full-suite attempts, taken while ~62 node processes were live, reported **18 failed files / 27–29 failed tests**, of which **23 were `Error: Test timed out`** and the mock-count numbers were non-deterministic between runs (`got 2` vs `got 3` for the same assertion) — the signature of contention, not regression. The run recorded above was taken once the machine had quieted to ~15 processes. Attribution was settled independently of the noise, three ways:

- No failing file references any module this plan changed (grep over all 18).
- A reverse-dependency scan found the complete set of test files that import a changed module; **none** of the 18 is in it.
- That complete importer set was executed: **31 files, 247 tests, EXIT=0**.
- A blast-radius run over `tests/unit/storage`, `tests/unit/schemas`, `tests/unit/demo` and all six action suites: **51 files, 840 tests, EXIT=0**.

### 3. `npx tsc -p tsconfig.ci.json --noEmit` → **TSC_EXIT=0**

### 4. `npx next build` → **BUILD_EXIT=0** (`✓ Compiled successfully in 22.5s`; `/storage/[bucket]/[...key]` present in the route table)

### 5. No route handler added — `tests/unit/demo/mutation-boundary-sweep.test.ts` green inside both the blast-radius run and the full run. No manifest edit needed.

### 6. `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, `lib/storage/asset-source.ts` — **not touched by any 190-02 commit** (`git log --name-only` over this plan's range matches none of them). `lib/storage/index.ts` does show changes in the wider phase range; those belong to the concurrent 189/190-03 executors.

### 7. Reversibility — no backfill exists

```
lib/actions/admin-company.ts:96   .update({ logo_url: logoUrl })
lib/actions/client.ts:98          .update({ logo_url: null })
lib/actions/client.ts:142         .update({ logo_url: url })
lib/actions/price-book.ts:265     .update({ image_url: imageUrl, ... })
lib/actions/price-book.ts:344     .update({ image_url: imageUrl, ... })
```

All five are the pre-existing write paths for a freshly uploaded file. Nothing reads or rewrites an existing row. Row migration is Phase 192.

### 8. No `S3_*` written to `.env.local` (grep count 0) and no Coolify change.

## The static gate: proven RED before, GREEN after

**Pre-edit run, against the unmodified tree (verbatim from the failure output):**

```
AssertionError: These sites mint a storage-backend URL and would bake a hostname
into a DB row. Use storageProxyPath(bucket, key) from @/lib/storage/asset-url instead.:
expected [ …(10) ] to deeply equal []

+ [
+   "app/admin/branding/actions.ts:60  logoUrl = storage.getPublicUrl('platform-brand', uploadedPath)",
+   "app/admin/branding/actions.ts:83  faviconUrl = storage.getPublicUrl('platform-brand', uploadedPath)",
+   "app/admin/seo/actions.ts:77  newOgUrl = storage.getPublicUrl('platform-brand', uploadedPath)",
+   "lib/actions/admin-company.ts:92  const logoUrl = storage.getPublicUrl('logos', storagePath)",
+   "lib/actions/client.ts:135  url = storage.getPublicUrl('logos', path)",
+   "lib/actions/company.ts:101  return { data: { url: storage.getPublicUrl('logos', path) } }",
+   "lib/actions/price-book.ts:254  const imageUrl = storage.getPublicUrl('photos', key)",
+   "lib/actions/price-book.ts:327  const imageUrl = storage.getPublicUrl('photos', key)",
+   "lib/actions/settings.ts:94  logoUrl = storage.getPublicUrl('logos', storagePath)",
+   "lib/actions/settings.ts:471  updateData.avatar_url = storage.getPublicUrl('logos', storagePath)",
+ ]

AssertionError: app/admin/landing/actions.ts is allowlisted for the hero-background-VIDEO
only. Exactly one .getPublicUrl( call may live here.:
expected [ …(5) ] to have a length of 1 but got 5

 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

**10 offenders + 4 surplus in the landing file = exactly the 14 to-be-repointed sites.** Properties 2 and 3 were green pre-edit (vacuously — hence the mutation testing below). Post-edit: **4 passed (4), EXIT=0**.

## Every automated gate proven capable of failing

| # | Mutation | Result |
| --- | --- | --- |
| A | Pass a *variable* bucket to `storageProxyPath` | 1 gate test fails |
| B | Make `PROXY_PREFIX` a hard-coded `https://x.supabase.co/storage/v1/object/public` | 1 gate test fails |
| C | Add a SECOND `.getPublicUrl(` to the landing action | 1 gate test fails (B1 narrowness) |
| D | Rebind the one allowed call away from `newBgVideoUrl` | 1 gate test fails (B1 binding) |
| E | Remove the provider-internal `getPublicUrl` call | 1 gate test fails (stale-allowlist detector) |
| F | **Repoint the hero background video** — the trap this plan must refuse | **2 tripwire tests fail** |
| G | Task 1 suite before implementation | 7 tests fail, one per site |
| H | Task 2 suite before implementation | 7 tests fail |

Mutations A–F were applied to the real tree, run, and reverted with `git checkout --`; the tree was confirmed clean afterwards. Properties 2 and 3 of the gate were vacuously green pre-edit, so A and B are the only evidence they can fail at all — that is why they were run.

## Issues Encountered

- **Fork-pool contention made the full suite unreadable for ~50 minutes.** Three GSD executors sharing one Windows box drove unit tests to 68-second durations. Resolved by waiting for the machine to quiet and by settling attribution with targeted runs rather than trusting the noisy aggregate. Worth remembering: under contention, `Error: Test timed out` dominates and mock call-counts go non-deterministic.
- **The plan's `<interfaces>` census was accurate** — all 15 line numbers and buckets matched the tree exactly. The only addition since it was written is `lib/storage/browser-upload.ts:247` (189-03), a declaration the call-shape scan correctly ignores.

## Known Stubs

None. Every changed line is fully implemented and covered. The one intentionally *unchanged* line (the hero background video) is documented at the code site, narrowly allowlisted in the gate, and asserted positively by two tests — it is a documented exemption, not a stub.

## User Setup Required

None. No env var, no `S3_*` value, no Coolify change, no migration to apply.

## Next Phase Readiness

- **Plan 03** (origin-less renderers) can rely on every newly written asset URL being a `/storage/` path, with one exception it must not absolutize twice: `heroBackgroundVideoUrl` is already absolute, and `absoluteAssetUrl()` passes absolute input through byte-identically, so it is safe to run everything through the same resolver.
- **Plan 04** must state honestly that **video is the one asset class still on Supabase egress** and therefore off the Cloudflare same-origin path.
- **Whoever revisits the video:** the named prerequisite is Range/206 + `Accept-Ranges` on `app/storage/[bucket]/[...key]/route.ts`. Until then, `tests/unit/admin/save-landing-asset-urls.test.ts` will (correctly) go red on any attempt.
- **Phase 192** owns rewriting the pre-existing absolute rows. This plan wrote none.

## State-Update Notes (honest record)

1. **URL-01 marked complete.** Plan 01 deliberately left it unchecked because it repointed zero writers; this plan is what closes it. `requirements mark-complete URL-01` ticked the checkbox but left the **Traceability** table row reading `Pending` — a project-wide tooling gap (`MIG-01..04` are stale the same way despite Phase 191 shipping). Hand-corrected only the `URL-01` row; the rest logged to `deferred-items.md`.

2. **`state advance-plan` was NOT run.** Three executors were running concurrently against a Current Position block that does not model parallel tracks; advancing the counter would have written a false position.

3. **The known GSD milestone-revert bug fired, and was observed reverting a manual fix in real time.** `state update-progress` rewrote `milestone` back to the stale `v3.1.1 / MVP Launch Prep + Future-Proofing / verifying` immediately after I corrected it. The three identity fields were re-asserted last, after all state commands: `v4.24 / Same-Origin Storage on R2 / in_progress`.

4. **The `progress` block is left in the tool's own corrupted state, deliberately.** It reads `total_plans: 369` / `completed_plans: 374` / `percent: 100` — more plans complete than exist, and 100% on a milestone whose Phase 192 has not started. I did not invent replacement numbers to make it look tidy; the counters need a maintainer pass and are logged in `deferred-items.md`. The authoritative per-phase truth is the ROADMAP progress table, which `roadmap update-plan-progress 190` did update correctly.

## Self-Check: PASSED

All 3 created files and all 10 modified files exist on disk. All 6 claimed commit hashes resolve
(`25f1f073`, `11659ce9`, `d2c65b38`, `50bc49c0`, `4d8fac52`, `f3a1bb05`).
`.getPublicUrl(` call-site count on disk: 2. `storageProxyPath(` call-site count: 14.

---
*Phase: 190-portable-same-origin-asset-urls*
*Completed: 2026-08-06*
