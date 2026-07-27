---
phase: 181-real-product-cutover-verification
plan: 05
subsystem: demo
tags: [cutover, dead-code-removal, documentation, landing, coolify, host-isolation]

# Dependency graph
requires:
  - phase: 181 (plan 04)
    provides: the 3-project Playwright browser verification that gates this cutover — the user's locked "preserve until tests pass, only then swap and remove" sequencing
  - phase: 180 (plan 14)
    provides: app/demo/entry/route.ts + lib/demo/session.ts, the verified handoff this plan points the landing CTAs at
provides:
  - "the landing page's only public demo entry point is /demo/entry (the verified handoff), not the retired standalone /demo index"
  - "app/demo/ containing only entry/route.ts; components/demo/ containing only demo-banner.tsx"
  - "DEMO-WORKSPACE.md as an accurate operator runbook for the host-isolated demo (env, DNS, Coolify, Supabase allow-list, local dev)"
  - "tests/unit/demo/demo-cutover.test.ts — static-source drift gate for the CTA swap, the deletion, and the doc's structural markers"
affects: [181-goal-verifier, milestone-v4.22-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deletion drift gate: pair every dead-code removal with existsSync assertions for BOTH the deleted paths (must be false) and the deliberately-kept look-alike siblings (must be true), so a future cleanup cannot re-delete the wrong file."

key-files:
  created:
    - tests/unit/demo/demo-cutover.test.ts
  modified:
    - components/landing/hero-section.tsx
    - components/landing/final-cta-section.tsx
    - components/landing/landing-footer.tsx
    - DEMO-WORKSPACE.md
    - lib/queries/dashboard.ts
    - scripts/seo-smoke.mjs
    - tests/unit/seo/route-policy.test.ts
  deleted:
    - app/demo/page.tsx
    - app/demo/layout.tsx
    - app/demo/dashboard/page.tsx
    - app/demo/dashboard/loading.tsx
    - app/demo/clients/page.tsx
    - app/demo/clients/loading.tsx
    - app/demo/projects/page.tsx
    - app/demo/projects/loading.tsx
    - app/demo/price-book/page.tsx
    - app/demo/price-book/loading.tsx
    - components/demo/demo-nav.tsx

key-decisions:
  - "Documented the Supabase Auth redirect allow-list as genuinely required for the demo host's own auth flows (signup exit, /callback) rather than repeating the plan's claim that verifyOtp() itself depends on it — the current handoff redeems its token server-side via token_hash and does not, and writing an unverified claim would recreate the exact stale-doc problem this task exists to fix."
  - "Substituted /offline for /demo in scripts/seo-smoke.mjs's noindex probe instead of deleting the check — /demo/entry is a route handler that returns a redirect and no HTML, so the check had no valid target left, but the underlying invariant (a private anonymously-reachable route must emit noindex) is still worth probing."
  - "Documented DEMO_APEX_ORIGIN, which the previous doc omitted entirely — exitDemoToSignup() throws if it is unset, so an operator following the old runbook would have shipped a demo whose exit CTA 500s."

patterns-established:
  - "When deleting a file with a similarly-named sibling that must survive (demo-nav.tsx vs demo-banner.tsx), assert the survivor's existence in the same test that asserts the deletion."

requirements-completed: [CUTOVER-01, CUTOVER-02]

# Metrics
duration: ~35min
completed: 2026-07-27
---

# Phase 181 Plan 05: Demo Cutover & Documentation Summary

**Swapped the landing page's three "See Demo" CTAs onto the browser-verified `/demo/entry` handoff, deleted the 11-file standalone `/demo/*` mini-app it replaced, and rewrote `DEMO-WORKSPACE.md` from a doc describing a route that never existed into an operator runbook for the host-isolated architecture that actually shipped.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-27
- **Tasks:** 3
- **Files:** 1 created, 7 modified, 11 deleted

## Accomplishments

- **CTA cutover (CUTOVER-01).** `hero-section.tsx`, `final-cta-section.tsx`, and `landing-footer.tsx` now link to `/demo/entry`. Label, button variant, and className are byte-identical to before — the only change is the href. Zero bare `href="/demo"` remain anywhere in the repo.
- **Dead-code removal (CUTOVER-01).** The standalone demo mini-app — its own index, layout, nav, and four page+loading pairs reading via the service-role client — is gone. `app/demo/` now contains exactly `entry/route.ts`; `components/demo/` contains exactly `demo-banner.tsx`. 520 lines deleted.
- **Documentation rewrite (CUTOVER-02).** `DEMO-WORKSPACE.md` replaced end to end. Every file and route path named in it was re-verified to exist at that exact path before finalizing; the rewrite corrects **five** distinct stale claims (see below), not just the one the plan called out.
- **New drift gate.** `tests/unit/demo/demo-cutover.test.ts` — 25 assertions covering the CTA swap (6), the 11 deletions, the 2 deliberate survivors, and 6 structural markers on the doc.
- **`tsc --noEmit -p tsconfig.ci.json` clean.** No orphaned imports; the only importer of `DemoNav` was the deleted `app/demo/layout.tsx`.

### Stale claims corrected in DEMO-WORKSPACE.md

| Old claim | Reality |
| --------- | ------- |
| "`app/demo/route.ts` programmatically signs the visitor in" | That file has never existed. The flow is a 3-hop apex → demo-host handoff through `proxy.ts` → `app/demo/entry/route.ts` → `establishDemoSession()`. |
| "Coolify / Vercel" as deployment targets | Production is **GitHub Actions → Docker/GHCR → Coolify**, self-hosted. Vercel is not a target; `.vercel/project.json` is a stale artifact. |
| `DEMO_APP_ORIGIN` / `DEMO_APEX_ORIGIN` unmentioned | Both are now documented with their strict accepted values. `DEMO_APEX_ORIGIN` is load-bearing — `exitDemoToSignup()` **throws** if it is unset. |
| "redirect Settings/WhatsApp for demo sessions" | Settings is now *exposed* to demo with three read-only tabs; the tenant WhatsApp inbox was retired entirely (`app/(app)/whatsapp/page.tsx` is a `notFound()` tombstone, and there is no `app/(app)/whatsapp/layout.tsx`). |
| Route-handler guard paths `app/api/send-sms`, `app/api/send-whatsapp`, `estimate/[token]/pay` | Those paths do not exist. The real ones are `app/api/estimates/[id]/send-sms`, `.../send-whatsapp`; the `pay` route is gone. The section now also points at `tests/unit/demo/mutation-boundary-sweep.test.ts` as the authoritative census, so the list cannot silently rot again. |

## Task Commits

Each task was committed atomically. All commits went through the `gitleaks` pre-commit hook with no `--no-verify` (important for the doc commit — "no leaks found" on all four).

1. **Task 1 RED:** `c2650922` — `test(181-05)`: failing static-source guard (6/6 red)
2. **Task 1 GREEN:** `7c701f19` — `feat(181-05)`: the 3 CTA hrefs (6/6 green)
3. **Task 2:** `2c890efa` — `chore(181-05)`: the 11 deletions + deletion/survival assertions + 2 orphan repairs
4. **Task 3:** `c7dcdf16` — `docs(181-05)`: the DEMO-WORKSPACE.md rewrite + doc structural assertions

**Plan metadata:** this SUMMARY.md

## Files Created/Modified

- `components/landing/{hero-section,final-cta-section,landing-footer}.tsx` — `href="/demo"` → `href="/demo/entry"`, nothing else
- `tests/unit/demo/demo-cutover.test.ts` — **new**, 25 assertions in 4 describe blocks
- `DEMO-WORKSPACE.md` — full rewrite (+273/−77): 3-hop flow, the two env origins and their validation rules, the Supabase allow-list, DNS + Coolify additional-domain steps, local dev, the demo settings exposure table, read-only defense-in-depth, Phase 180/181 status
- `lib/queries/dashboard.ts` — comment only (see deviations)
- `scripts/seo-smoke.mjs` — noindex probe retargeted (see deviations)
- `tests/unit/seo/route-policy.test.ts` — private-route example `/demo/projects` → `/demo/entry`
- 11 files deleted (listed in frontmatter)

**Verified untouched, as required:** `app/demo/entry/route.ts` and `components/demo/demo-banner.tsx` — both still on disk, both asserted by the new test, `demo-banner.tsx` still imported by `app/(app)/layout.tsx:17` and rendered at line 245.

`lib/seo/route-policy.ts` was **verified only, not edited**, per the plan: `PRIVATE_ROUTE_PREFIXES` includes `/demo`, and `isPrivateRoute()` matches via `pathname === prefix || pathname.startsWith(prefix + '/')`, so `/demo/entry` is still correctly classified private after the deletion.

## Decisions Made

- **Did not repeat the plan's Supabase-allow-list rationale verbatim.** The plan said to state that `establishDemoSession()`'s `verifyOtp()` flow "will fail" without the allow-list. Reading the code, `generateLink()` is called without `redirectTo` and `verifyOtp()` redeems a `token_hash` server-side — no redirect is involved, so that specific claim is not true. The doc still requires both origins in the allow-list, but for the reason that *is* true: the demo host serves the whole app, so the banner's signup exit, `/callback`, and every other auth flow started there resolve against that origin. Writing the unverified version would have reintroduced exactly the class of stale claim this task exists to eliminate.
- **Retargeted rather than removed the SEO smoke check.** `/demo/entry` is a route handler returning a redirect with no HTML, so there was no way to keep probing `/demo` for a `noindex` meta tag. `/offline` is the equivalent surface (private robots metadata, renders anonymously, not behind the auth middleware), so the invariant stays under test.
- **Kept the deleted demo page named in the `getProjects` comment**, as history rather than deleting the sentence. The comment explains why the query is deliberately unbounded; silently dropping one of its two stated reasons would leave a future reader wondering whether the remaining reason is sufficient. It now reads as "one consumer, plus a second that was deleted in Phase 181".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `scripts/seo-smoke.mjs` probed a route this plan deletes**

- **Found during:** Task 2, post-deletion tree-wide grep for orphaned references
- **Issue:** `scripts/seo-smoke.mjs:58` fetched `/demo` and asserted the body contains `noindex, nofollow`. The `PRIVATE_ROBOTS` metadata for that subtree lived in the deleted `app/demo/layout.tsx`, so after this plan `/demo` 404s and the check would fail against production on the next `npm run audit:seo:production`.
- **Fix:** retargeted the probe to `/offline` (`app/offline/page.tsx`, `robots: PRIVATE_ROBOTS`, renders anonymously), with a comment recording why `/demo` is no longer a valid target.
- **Files modified:** `scripts/seo-smoke.mjs`
- **Commit:** `2c890efa`

**2. [Rule 1 - Bug] `lib/queries/dashboard.ts` comment cited a deleted file as load-bearing rationale**

- **Found during:** Task 2, same grep
- **Issue:** The comment justifying `getProjects`'s intentionally unbounded query listed `app/demo/projects/page.tsx` as consumer #2 that would break under a `.limit()`. That consumer no longer exists.
- **Fix:** comment rewritten so the surviving reason (client-side pagination in `components/dashboard/project-list.tsx`) stands on its own, with the deleted consumer noted as history. **Comment-only — verified by `git diff`, zero executable lines changed.**
- **Files modified:** `lib/queries/dashboard.ts`
- **Commit:** `2c890efa`

**3. [Rule 1 - Bug] `tests/unit/seo/route-policy.test.ts` asserted against a deleted route**

- **Found during:** Task 2, verification of the plan's "verify only" step 4
- **Issue:** The private-classification example list used `/demo/projects`. The test still passed (`isPrivateRoute` is pure string logic), but it was asserting policy about a URL that no longer resolves — a silently meaningless assertion.
- **Fix:** example changed to `/demo/entry`, which both exists and is the route whose private classification actually matters now.
- **Files modified:** `tests/unit/seo/route-policy.test.ts`
- **Commit:** `2c890efa`

**4. [Scope expansion within Task 3] The doc had four more stale claims than the plan enumerated**

- **Found during:** Task 3's mandatory "re-verify every path" pass
- **Issue:** Beyond the `app/demo/route.ts` claim the plan named, path verification turned up `app/(app)/whatsapp/layout.tsx`, `app/api/send-sms/route.ts`, `app/api/send-whatsapp/route.ts`, and `estimate/[token]/pay` — none of which exist. The plan's step 8 said to "keep the existing content" of the read-only enforcement section after re-verifying its paths; re-verification failed for three of them.
- **Fix:** corrected to the real paths (`app/api/estimates/[id]/send-sms`, `.../send-whatsapp`), removed the retired surfaces, and pointed the section at `tests/unit/demo/mutation-boundary-sweep.test.ts` as the authoritative, self-maintaining census so a hand-written list cannot rot again.
- **Files modified:** `DEMO-WORKSPACE.md`
- **Commit:** `c7dcdf16`

**5. [Rule 3 - Blocking] CUTOVER-03 was never checked off in REQUIREMENTS.md**

- **Found during:** state updates, after `roadmap update-plan-progress 181` marked the phase Complete
- **Issue:** Plan 04's SUMMARY declares `requirements-completed: [PARITY-01, PARITY-02, PARITY-03, CUTOVER-03]`, and its three PARITY siblings are checked off — but CUTOVER-03 was still `[ ]` / `Pending`. Its state update missed it. Closing the phase with the roadmap saying "Complete" and REQUIREMENTS.md saying one of its requirements is Pending would have left the two artifacts contradicting each other for the goal-verifier.
- **Fix:** verified the evidence actually exists first (`tests/e2e/demo-session-isolation.spec.ts` on disk; `playwright.config.ts` defines exactly the `chromium` / `mobile-safari` / `mobile-chrome` projects plan 04 reports green; plan 04's SUMMARY documents the apex-before → demo → apex-after cookie narrative and the tablet-viewport check that CUTOVER-03 asks for), then ran `requirements mark-complete CUTOVER-03`.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Note:** this is bookkeeping only — no work was missing, just the checkbox.

**6. [Environment] GSD state tools reverted the STATE.md milestone twice**

- **Found during:** state updates
- **Issue:** `state advance-plan`, `state update-progress`, and `state record-session` each rewrote the frontmatter `milestone` to the stale `v3.1.1 MVP Launch Prep + Future-Proofing` and recomputed `progress` against that old milestone's scope (18 phases / 51 plans → a false "100%"), hiding v4.22 entirely. This is the known `project_gsd_state_milestone_revert` behavior recorded in project memory.
- **Fix:** re-asserted `milestone: v4.22` / `milestone_name: Product-Native Demo` and the real progress counters (125 phases / 323 plans, 107 phases and 333 plans complete) **after** every state command had run, then re-verified the frontmatter was still correct at the end. `status: verifying` was left as the tools set it — that value is correct now that the phase is closed.

---

**Total deviations:** 6 (4 code/doc auto-fixes — 3 orphaned references directly caused by the deletion, 1 doc-accuracy expansion required by Task 3's own "re-verify every path" instruction; 1 requirements-bookkeeping correction; 1 known tooling defect worked around). No Rule 4 architectural decisions. No scope creep outside the deletion's blast radius.

## Issues Encountered

**Full-suite unit tests are load-flaky on this machine — pre-existing, not caused by this plan.** `npx vitest run tests/unit tests/eval` reported 2-4 failures per run, always `Error: Test timed out in 15000ms`, never an assertion failure, and **never the same set twice** across three runs of identical code (`mcp-route-contract` + `actions/team-invite`, then those plus `billing/seat-billing-wiring` ×2, then back to the first pair). All of them pass in isolation: 3 files / 29 tests green in 10s. None of the flaky files import anything this plan touched, and `tsc --noEmit -p tsconfig.ci.json` is clean. The full run reports ~1900s cumulative import time and ~3000s environment time across workers against a 15s per-test timeout, so slow workers trip it nondeterministically; deleting 11 files also shifts worker file distribution, which is enough to change which tests lose the race.

Per the scope boundary this was **not** fixed here — it is logged in `deferred-items.md` with the reproduction table and a recommended follow-up (raise `testTimeout` for the dynamic-`import()`-heavy files and/or cap worker concurrency). Flagging its priority: CI runs this exact gate and `Build and Deploy` is gated on `Test` passing, so this is the documented silent-red-lock class that can block every deploy with nothing actually broken.

## User Setup Required

Nothing new is required by this plan's code. The **pre-existing** operator actions for the demo host, now documented in `DEMO-WORKSPACE.md`, remain outstanding for production and are the last thing between this cutover and a working public demo:

1. **DNS** — `CNAME`/`A` for `demo.xtimator.com` at the same Coolify-managed origin as `xtimator.com`.
2. **Coolify** — add `demo.xtimator.com` as an additional domain on app UUID `cf1cqh0bq8jyw91e78tcw8c6` so both hostnames hit the same container and both get TLS.
3. **Coolify env** — `DEMO_APP_ORIGIN=https://demo.xtimator.com`, `DEMO_APEX_ORIGIN=https://xtimator.com`, plus `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` / `DEMO_COMPANY_ID`.
4. **Supabase** — add `https://demo.xtimator.com` to the Auth redirect allow-list.

Until 1-3 are done the flow fails **closed**, which is why shipping this cutover ahead of them is safe: `getDemoAppOrigin()` returns `null`, `classifyDemoEntryRequest()` returns `reject`, and `/demo/entry` returns `503`. It never redirects anywhere unsafe — but the landing CTAs will dead-end at that 503 until the domain exists, so items 1-3 should land with or before this deploy.

## Next Phase Readiness

CUTOVER-01 and CUTOVER-02 are complete, closing plan 05 and phase 181. Combined with plans 01-04 the phase's six requirements (PARITY-01..03, CUTOVER-01..03) are all satisfied, and with Phase 180's eight (ENTRY-01..04, SAFE-01..04) milestone v4.22 has full requirement coverage. Remaining before the demo is publicly live: the four operator setup items above.

---
*Phase: 181-real-product-cutover-verification*
*Completed: 2026-07-27*

## Self-Check: PASSED

- All 8 created/modified files exist on disk, plus the 2 deliberate survivors (`app/demo/entry/route.ts`, `components/demo/demo-banner.tsx`).
- All 11 deleted files confirmed absent.
- All 4 task commits (`c2650922`, `7c701f19`, `2c890efa`, `c7dcdf16`) confirmed present in `git log --oneline --all`.
- `npx vitest run tests/unit/demo/demo-cutover.test.ts` → 25/25 passing; `npx tsc --noEmit -p tsconfig.ci.json` → clean.
- No stubs: this plan created no placeholder values, mock data, or unwired components — its net effect is 3 string changes, 11 deletions, and documentation.
