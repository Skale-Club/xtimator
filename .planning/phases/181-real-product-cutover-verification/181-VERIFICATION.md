---
phase: 181-real-product-cutover-verification
verified: 2026-07-27T12:55:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: null
human_verification:
  - test: "OPERATOR (blocking, do BEFORE pushing/deploying): create the demo host — DNS CNAME/A for demo.xtimator.com -> the Coolify origin serving xtimator.com; add demo.xtimator.com as an additional domain on Coolify app cf1cqh0bq8jyw91e78tcw8c6; set DEMO_APP_ORIGIN=https://demo.xtimator.com and DEMO_APEX_ORIGIN=https://xtimator.com (plus DEMO_USER_EMAIL / DEMO_USER_PASSWORD / DEMO_COMPANY_ID) as Coolify runtime env; add https://demo.xtimator.com to the Supabase Auth redirect allow-list."
    expected: "curl -sI https://xtimator.com/demo/entry returns 303 to https://demo.xtimator.com/demo/entry (today it returns 503); https://demo.xtimator.com resolves and serves the app."
    why_human: "DNS, Coolify dashboard, and provider env/allow-list are outside the repository. VERIFIED EMPIRICALLY DURING THIS REVIEW: https://xtimator.com/demo/entry -> HTTP 503; https://demo.xtimator.com -> connection failure (host does not resolve). The 3 landing CTAs now point at that 503 route and the old standalone /demo fallback has been deleted."
  - test: "Re-run tests/e2e/demo-session-isolation.spec.ts against the real production hosts once the demo host exists (PLAYWRIGHT_APEX_ORIGIN=https://xtimator.com DEMO_APP_ORIGIN=https://demo.xtimator.com)."
    expected: "All steps green on chromium / mobile-safari / mobile-chrome, same as the local run."
    why_human: "The passing run was against http://localhost:9633 + http://demo.localhost:9633. The two bugs Phase 180 found (Host-header origin detection, CAPTCHA-blocked password grant) were both production-only — a local green does not prove the production proxy/TLS/cookie path."
  - test: "Visual review of the demo settings shell on a real phone and desktop: /settings/company, /settings/team, /settings/notifications on the demo host."
    expected: "Real settings rail with exactly Company/Team/Notifications; all fields greyed/disabled; the read-only footer note visible; DemoBanner pinned; nothing looks broken or half-rendered."
    why_human: "Visual quality/appearance cannot be verified by grep or a headless assertion."
  - test: "Confirm the demo company's production data is still rich after the migration-drift work (clients/projects/estimates/price-book non-zero)."
    expected: "clients=4, projects=4, estimates=4, price_book_items=30 for company 0000de00-0000-0000-0000-000000000001."
    why_human: "Requires a production DB query; counts here are from 181-04's record, not independently re-queried in this verification."
---

# Phase 181: Real-Product Cutover & Verification — Verification Report

**Phase Goal:** Demo visitors can explore the real Xtimator product safely, and the verified product-native flow becomes the only public demo experience.
**Verified:** 2026-07-27
**Status:** human_needed — all code-level must-haves verified; one operator action stands between this phase and a working public demo
**Re-verification:** No — initial verification

## Headline

Every code claim in the five SUMMARYs was independently checked against the actual files and **all of them hold**. The unit suite for this phase's surfaces is green (22 files / 315 tests), `tsc -p tsconfig.ci.json` exits 0, zero anti-patterns in the phase's 39-file change set, and no orphaned imports were left behind by the deletion.

**The one thing that is not true yet is not in the code.** Verified live during this review:

| Probe | Result |
| ----- | ------ |
| `https://xtimator.com/demo/entry` | **HTTP 503** ("Service unavailable" — `getDemoAppOrigin()` returns null) |
| `https://demo.xtimator.com/` | **connection failure** — host does not resolve |
| `https://xtimator.com/` landing HTML | still serves **3× `href="/demo"`** (old CTAs) |
| `https://xtimator.com/api/health` commit | `68e11970` = `origin/main` |
| local `HEAD` | `4a2636e4` — **28 commits ahead of origin/main** |

So production is currently safe: it still runs the old standalone demo, because this phase (and Phase 180's tail) has **not been pushed**. The moment it is pushed, the three landing "See Demo" buttons become `/demo/entry`, which returns a bare 503, and the standalone `/demo/*` fallback no longer exists. **Do the DNS/Coolify/Supabase setup before the deploy, not after.**

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | A demo visitor sees the same authenticated layout, navigation, components, styling, and responsive behavior as a real tenant. | ✓ VERIFIED | `app/(app)/settings/layout.tsx` (23 lines) has zero demo branch — it renders `<SettingsLayoutClient isDemo={isDemo}>` unconditionally; `CompanyInfoForm` import and the bespoke collapsed view are gone. The standalone mini-app (own layout + own nav) is deleted; demo now runs the real `app/(app)/layout.tsx` shell. Local e2e green on chromium + mobile-safari + mobile-chrome + a 768px tablet step. |
| 2 | The visitor can navigate exposed surfaces on demo-tenant data, with a visible demo/read-only state that removes or disables mutation and paid/external controls. | ✓ VERIFIED | `settings-nav.tsx` filters `ITEMS` via `!(isDemo && item.demoHidden)`; exactly 6 `demoHidden: true`, and company/team/notifications carry none. 15 non-exposed pages each hold an `isDemoCompany(...)` → `redirect('/settings/company')` guard (enumerated below). `DemoBanner` renders when `isDemoCompany(activeCompanyId)`. Read-only: `readOnly={isDemoCompany(company.id)}`, `canManage = !isDemoCompany(companyId) && …`, `readOnly={isDemoCompany(companyId)}`. |
| 3 | After the gate passes, every landing demo entry uses the product-native flow and the standalone `/demo/*` UI is removed without broken internal links. | ✓ VERIFIED | All 3 CTAs are `href="/demo/entry"` (hero:258, final-cta:51, footer:62). **Zero** bare `href="/demo"` anywhere in code (matches exist only inside `.planning/`). `app/demo/` = `entry/route.ts` only; `components/demo/` = `demo-banner.tsx` only. No import in the tree resolves to a deleted file; the only `@/components/demo/*` import is `DemoBanner` in `app/(app)/layout.tsx:17`, which exists. `lib/seo/route-policy.ts` still noindexes the `/demo` prefix (correct — covers `/demo/entry`). |
| 4 | An operator can configure local and production demo hosts from repo documentation (env, Supabase allow-list, DNS, Coolify) without treating Vercel as production. | ✓ VERIFIED | `DEMO-WORKSPACE.md` (280 lines) covers all four: env table incl. `DEMO_APP_ORIGIN`/`DEMO_APEX_ORIGIN`, the accepted-values rules, a dedicated Supabase Auth redirect allow-list section, and a "Deployment: DNS + Coolify domain setup (operator action)" section that states production is GitHub Actions → Docker/GHCR → Coolify and explicitly calls `.vercel/project.json` a stale artifact. **No secrets** — scanned for `whsec_`/`sk_(test\|live)_`/`rk_`/`sb_secret_`/`sk-ant-`/`sk-proj-`/`re_`/JWT/32-hex: zero hits. Credentials appear only as `<demo-user-email>` / `<demo-user-password>` placeholders. |
| 5 | Browser verification at desktop and responsive widths proves the real product renders on the demo host and the apex session survives the visit. | ✓ VERIFIED (local host) | `tests/e2e/demo-session-isolation.spec.ts` = 359 lines, 13 `test.step()`s: Phase 180's 8 original steps **intact** plus 4 new PARITY/CUTOVER steps and the tablet check. Git diff across the phase is **+103 / −1** (the −1 raised `setTimeout`) — extended, not replaced. Proven against a genuine second host (`demo.localhost:9633`) with host-only cookies, so the cross-host isolation claim is real. ⚠ Not yet run against production hosts (see human verification). |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/(app)/settings/layout.tsx` | Unconditional real shell, `isDemo` threaded | ✓ VERIFIED | 23 lines; single `isDemoSession()` call; no `CompanyInfoForm`; `SettingsLayoutClient isDemo={isDemo}` |
| `components/settings/settings-layout-client.tsx` | Accepts + forwards `isDemo` | ✓ VERIFIED | `isDemo?: boolean` (L10); `<SettingsNav collapsed={collapsed} isDemo={isDemo} />` (L57) |
| `components/settings/settings-nav.tsx` | `demoHidden` filter, 3 tabs for demo | ✓ VERIFIED | 6 × `demoHidden: true`; company/team/notifications unflagged; `ITEMS.filter((item) => !(isDemo && item.demoHidden))` |
| `components/app-shell/sidebar.tsx` | Settings un-gated, Trash still gated | ✓ VERIFIED | `href="/settings"` at L113 outside any gate; exactly **1** `{!isDemo && (` remaining, wrapping Trash (L119) |
| `components/app-shell/mobile-account-menu.tsx` | Same | ✓ VERIFIED | `href="/settings"` L84; exactly **1** `{!isDemo && (` (L88, Trash) |
| `components/settings/notifications-form.tsx` | New `readOnly` → disabled fieldset + footer | ✓ VERIFIED | `readOnly?: boolean` (L86), `readOnly = false` (L113), `<fieldset disabled={readOnly}>` L223→L379 enclosing both `save-prefs` (L339) and the push button (L370), footer note L380-382 |
| 15 non-exposed settings pages | `isDemoCompany(...)` redirect guard each | ✓ VERIFIED | All 15 confirmed individually — see table below |
| `tests/e2e/demo-session-isolation.spec.ts` | Extended, Phase 180 steps intact | ✓ VERIFIED | 359 lines, 13 steps, +103/−1 diff |
| `DEMO-WORKSPACE.md` | Host-isolated architecture, no secrets | ✓ VERIFIED | 280 lines; 3-hop table, env table, allow-list, DNS/Coolify, local dev, seeding, status; zero secret patterns |
| `app/demo/entry/route.ts` | Still present (Phase 180 handoff) | ✓ VERIFIED | Present; `classifyDemoEntryRequest` + `establishDemoSession`; terminal 503 on reject |
| `components/demo/demo-banner.tsx` | Still present | ✓ VERIFIED | Present; imported by `app/(app)/layout.tsx:17`, rendered at L245 under `isDemo` |
| `tests/unit/{settings/demo-*,demo/demo-cutover}.test.ts` | 4 new static-guard specs | ✓ VERIFIED | All 4 exist and pass |

**The 15 URL-guarded settings pages** (each `import { isDemoCompany }` + a demo redirect):

`(tabs)/account` · `(tabs)/appearance` · `(tabs)/defaults` · `(tabs)/delivery` · `(tabs)/estimates` · `billing` · `custom-domain` · `estimate-templates` · `integrations` · `integrations/mcp` · `integrations/stripe` · `knowledge` · `knowledge/[id]` · `knowledge/new` · `payments`

The three remaining settings pages with no `isDemoCompany` reference were each inspected and are safe: `settings/page.tsx` → `/settings/company` (exposed), `(tabs)/staff` → `/settings/team` (exposed), `(tabs)/general` → `/settings/account` (which then re-redirects a demo session to `/settings/company` — two hops, correct outcome).

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `settings/layout.tsx` | `settings-layout-client.tsx` | `isDemo` prop | ✓ WIRED | `SettingsLayoutClient isDemo={isDemo}` |
| `settings-layout-client.tsx` | `settings-nav.tsx` | `isDemo` prop | ✓ WIRED | `SettingsNav collapsed={collapsed} isDemo={isDemo}` |
| `sidebar.tsx` / `mobile-account-menu.tsx` | `/settings` | un-gated `<Link>` | ✓ WIRED | Both render unconditionally; Trash still gated |
| `(tabs)/company/page.tsx` | `company-info-form.tsx` | `readOnly={isDemoCompany(company.id)}` | ✓ WIRED | L41; form has `<fieldset disabled={readOnly}>` L178→L596 + read-only branch L598 |
| `(tabs)/team/page.tsx` | `team-section.tsx` | `canManage` forced false | ✓ WIRED | L28 `!isDemoCompany(companyId) && (role === 'owner' \|\| 'admin')`; `canManage` gates Invite (L132) and per-member manage (L250, L344) |
| `(tabs)/notifications/page.tsx` | `notifications-form.tsx` | `readOnly={isDemoCompany(companyId)}` | ✓ WIRED | L50 |
| 15 hidden pages | `lib/demo/config.ts` | `isDemoCompany(...)` → `redirect('/settings/company')` | ✓ WIRED | All 15 confirmed |
| `hero/final-cta/footer` | `app/demo/entry/route.ts` | `href="/demo/entry"` | ✓ WIRED (repo) / ⚠ 503 in prod | Route exists; returns 503 until `DEMO_APP_ORIGIN` is set |
| e2e spec | `{demoOrigin}/settings/billing` | soft-redirect → `/settings/company` | ✓ WIRED | `waitForURL` used (correct for the RSC `NEXT_REDIRECT` soft redirect) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `settings-nav.tsx` | `items` | `ITEMS.filter(...)` on a real 9-entry array | Yes | ✓ FLOWING |
| Demo dashboard/clients/projects/price-book | page data | Real product queries scoped by `active_company_id` cookie pinned to `DEMO_COMPANY_ID` | Yes (`Maple Street Residence`, `Carpet cleaning — per room`, `Whole-Home Carpet Cleaning` asserted visible in the live e2e run) | ✓ FLOWING |
| `notifications-form.tsx` | `initial` | `getUserPreferences(userId)` + `resolveOwnerPhone` | Yes | ✓ FLOWING |
| `team-section.tsx` | `members` / `invites` | `listCompanyRoster(companyId)` | Yes | ✓ FLOWING |
| Landing CTA → demo product | the whole demo session | `establishDemoSession()` gated on `getDemoAppOrigin()` | **No, in production** — `DEMO_APP_ORIGIN` unset ⇒ `classifyDemoEntryRequest` returns `reject` ⇒ terminal 503 | ⚠ DISCONNECTED (operator/env, not code) |

The last row is the phase's only broken flow, and it is broken outside the repository. `lib/demo/session.ts` fails **closed** by design (terminal 503, no failure redirect, no loop), so the failure mode is a dead-end page rather than anything unsafe.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-181 unit specs pass | `npx vitest run tests/unit/settings/demo-*.test.ts tests/unit/demo/` | 22 files / 315 tests passed, 21.5s | ✓ PASS |
| CI typecheck clean | `npx tsc --noEmit -p tsconfig.ci.json` | exit 0, no output | ✓ PASS |
| Only `entry/route.ts` under `app/demo` | `find app/demo -type f` | `app/demo/entry/route.ts` | ✓ PASS |
| Only `demo-banner.tsx` under `components/demo` | `find components/demo -type f` | `components/demo/demo-banner.tsx` | ✓ PASS |
| No bare `/demo` links in code | Grep `href="/demo"` repo-wide | 0 hits outside `.planning/` | ✓ PASS |
| No secrets in `DEMO-WORKSPACE.md` | secret-pattern grep | NO SECRET PATTERNS FOUND | ✓ PASS |
| Prod apex handoff live | `curl https://xtimator.com/demo/entry` | **503** | ✗ FAIL (operator env) |
| Prod demo host live | `curl https://demo.xtimator.com/` | **connection failure** | ✗ FAIL (operator DNS) |
| Full e2e spec on production hosts | not run | requires demo host to exist | ? SKIP → human |

### Requirements Coverage

Every requirement ID declared across the five PLAN frontmatters was collected and cross-referenced against `.planning/REQUIREMENTS.md`. Declared: 01 → PARITY-01, PARITY-02; 02 → PARITY-02, PARITY-03; 03 → PARITY-02; 04 → PARITY-02, PARITY-03, CUTOVER-03; 05 → CUTOVER-01, CUTOVER-02. **Union = {PARITY-01, PARITY-02, PARITY-03, CUTOVER-01, CUTOVER-02, CUTOVER-03} = exactly the 6 IDs ROADMAP assigns to Phase 181. No orphaned requirements.**

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| PARITY-01 — same authenticated layout/nav/responsive/components/styling as a real tenant | 01 | ✓ SATISFIED | Bespoke demo settings view deleted; standalone mini-app + `demo-nav.tsx` deleted; demo runs the real `app/(app)/layout.tsx` + `SettingsLayoutClient`; live-proven at 3 viewport projects + 768px |
| PARITY-02 — navigate core read surfaces + intentionally-exposed settings on demo data | 01, 02, 03, 04 | ✓ SATISFIED | Nav filtered to Company/Team/Notifications; 15 hidden pages URL-guarded; e2e asserts nav contents, `Plans`/`Integrations`/`Knowledge` absent, and `/settings/billing` → `/settings/company` |
| PARITY-03 — visible demo/read-only state; mutation and paid/external controls removed or disabled | 02, 04 | ✓ SATISFIED | `DemoBanner` under `isDemo`; `CompanyInfoForm readOnly`; `TeamSection canManage=false` (Invite + per-member controls gone); `NotificationsForm` disabled `<fieldset>` + footer note; e2e asserts `Invite` count 0, `master-email-digest` and `save-prefs` disabled, footer text visible (all three test IDs confirmed to exist in the component) |
| CUTOVER-01 — landing entries use the product-native flow; standalone `/demo/*` removed without broken internal links | 05 | ✓ SATISFIED (code) / ⚠ blocked in prod | 3/3 CTAs at `/demo/entry`; 11 files deleted; 0 dangling imports; `route-policy`/`seo-smoke` references repaired. **Caveat:** the new target 503s in production until the operator action below |
| CUTOVER-02 — env/deploy docs specify demo host, Supabase allow-list, DNS/Coolify, local setup, not Vercel | 05 | ✓ SATISFIED | `DEMO-WORKSPACE.md` verified section-by-section; explicitly names Coolify app UUID and disclaims `.vercel/project.json`; placeholders only |
| CUTOVER-03 — browser proof: apex session intact before/after; real product at desktop + responsive widths | 04 | ✓ SATISFIED (local) | 13-step single-cookie-jar spec, Phase 180's steps intact, 3 projects + tablet; **not yet exercised against the production hosts** |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | TODO / FIXME / placeholder / stub-return / console-only scan across all 39 phase-touched `.ts`/`.tsx` files | — | **Zero hits.** No stubs, no placeholders, no dead returns. |
| `components/app-shell/nav-items.ts` | 26 | `{ label: 'Settings', …, demoHidden: true, userMenu: true }` | ℹ️ Info | Stale/dead flag. Both consumers (`sidebar.tsx:228`, `bottom-nav.tsx:44`) filter `&& !item.userMenu`, so this entry is never rendered and the flag is inert — but it now contradicts the phase's intent (Settings IS exposed to demo) and will mislead the next reader. Cosmetic cleanup. |
| `DEMO-WORKSPACE.md` | ~"What a demo visitor sees" | Attributes Trash-hiding to `demoHidden` in `nav-items.ts` filtered by `sidebar.tsx`/`bottom-nav.tsx` | ℹ️ Info | The actual account-menu Trash gate is the explicit `{!isDemo && (` wrapper in `sidebar.tsx:119` / `mobile-account-menu.tsx:88`. Outcome documented is correct; the mechanism named is not the one in force. |
| `app/(app)/settings/(tabs)/general/page.tsx` | 4 | No `isDemoCompany` guard | ℹ️ Info | Not a hole: it redirects to `/settings/account`, which is guarded and bounces demo to `/settings/company`. Two hops, correct destination. |

### Notes Factored In (not counted as gaps)

- **Full-suite unit flakiness** — reproduced the documented pattern: 2–4 `Test timed out in 15000ms` failures per full run (`mcp-route-contract`, `actions/team-invite`, sometimes `billing/seat-billing-wiring`), never an assertion failure, varying set run-to-run, all green in isolation. Confirmed unrelated to this phase (none of those files import anything it touched) and captured in `deferred-items.md`. Not a phase gap — but it *is* the documented silent-red-lock class that can block deploys, so it matters operationally right when this phase most needs a green deploy.
- **Two real production bugs** — the Phase 180 `Host`-header/CAPTCHA fixes (`1bf005e9`) and this phase's `image_position` migration (Price Book was returning Postgres `42703` for **every tenant**, not just demo). Both are legitimate record, both resolved, the migration verified applied via `information_schema.columns`.
- **Uncommitted working tree** — `app/globals.css` (hero-image CSS tweak) and `.planning/config.json` are modified and unrelated to Phase 181; they predate this verification session.
- **Wave-1 git contention** — the `181-03` commit messages only enumerate 10 of the 15 guarded pages, an artifact of the in-place parallel executors sharing one index. All 15 guards were confirmed present **and committed** (working tree carries no settings changes), so nothing was lost.

## Gaps Summary

**There are no code gaps.** Every artifact exists, is substantive, is wired, and carries real data. All 6 requirements are satisfied at the repository level, and the phase's own test gates (unit + typecheck + Playwright) pass.

**There is one deployment gap, and it is the whole ballgame.**

This phase deleted the working public demo and repointed the landing page's primary conversion CTA at a route that, in production **today**, returns `503 Service unavailable` — because `demo.xtimator.com` does not exist in DNS, is not registered as a Coolify domain, and `DEMO_APP_ORIGIN` is not set as a runtime env var. That was always the correct scope decision (the phase could not do DNS), and production is unharmed right now only because the 28 commits carrying this work have not been pushed.

The ordering constraint is therefore hard and easy to get wrong:

1. **First:** DNS record → Coolify domain → Coolify env (`DEMO_APP_ORIGIN`, `DEMO_APEX_ORIGIN`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `DEMO_COMPANY_ID`) → Supabase Auth redirect allow-list entry.
2. **Then:** push `main` (remember `Build and Deploy` is gated on a green `Test` run — see the flakiness note).
3. **Then:** re-run the e2e spec against the production origins, since both bugs this feature has produced so far were production-only.

Push before step 1 and the public "See Demo" button is a dead 503 with no fallback.

---

_Verified: 2026-07-27_
_Verifier: Claude (gsd-verifier)_
