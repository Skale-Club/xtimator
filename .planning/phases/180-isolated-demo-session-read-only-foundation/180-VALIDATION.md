---
phase: 180
slug: isolated-demo-session-read-only-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-26
---

# Phase 180 — Validation Strategy

> Per-phase validation contract for host isolation and defense-in-depth read-only enforcement.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 + Playwright 1.59.1 |
| **Config files** | `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/test.yml` |
| **Quick run command** | `npx vitest run tests/unit/demo tests/unit/middleware.test.ts` |
| **Full suite command** | `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` |
| **Browser command** | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` |
| **Live RLS command** | `npx vitest run tests/integration/demo-readonly-rls.test.ts` |
| **Estimated quick runtime** | Under 60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/demo tests/unit/middleware.test.ts`.
- **After every mutation-boundary task:** Run the new focused test plus the closest existing route/action tests.
- **After the RLS task:** Run the static migration contract and the env-gated live RLS suite.
- **After every plan wave:** Run `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval`.
- **Before phase verification:** Full CI-equivalent, live RLS integration when configured, and Chromium cross-host isolation must be green.
- **Max feedback latency:** 60 seconds for quick sampling.

---

## Per-Requirement Verification Map

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| ENTRY-01 | T-01, T-02 | Fixed demo-origin handoff; apex cookies unchanged | unit + e2e | `npx vitest run tests/unit/demo/host-routing.test.ts && npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` | ❌ W0 | ⬜ pending |
| ENTRY-02 | T-01, T-03 | Exact demo host creates only host-scoped demo session/company cookies | unit + e2e | `npx vitest run tests/unit/demo/session-route.test.ts` | ❌ W0 | ⬜ pending |
| ENTRY-03 | T-04, T-05 | Wrong/partial state repairs once; terminal failures never loop | unit + e2e | `npx vitest run tests/unit/demo/session-route.test.ts` | ❌ W0 | ⬜ pending |
| ENTRY-04 | T-01, T-02 | Local host/port supported without relaxing production cookie policy | unit | `npx vitest run tests/unit/demo/config.test.ts tests/unit/demo/host-routing.test.ts` | ❌ W0 | ⬜ pending |
| SAFE-01 | T-07, T-09 | Demo user OR demo company denies every classified mutation boundary | unit + static | `npx vitest run tests/unit/demo/guard.test.ts tests/unit/demo/mutation-boundary-sweep.test.ts` | ❌ W0 | ⬜ pending |
| SAFE-02 | T-08, T-10, T-11 | Providers, uploads, billing, jobs, sends, and service writes are never called | unit | `npx vitest run tests/unit/demo/side-effect-boundaries.test.ts` | ❌ W0 | ⬜ pending |
| SAFE-03 | T-06 | Direct table/storage writes fail while reads and normal-tenant writes remain valid | static + integration | `npx vitest run tests/unit/demo/rls-migration-contract.test.ts tests/integration/demo-readonly-rls.test.ts` | ❌ W0 | ⬜ pending |
| SAFE-04 | T-01..T-12 | Complete phase suite proves isolation, denial, and bounded redirects | phase gate | Full suite + browser + live RLS commands above | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/demo/config.test.ts` — validated origin/protocol/host/port and server-only secret contract.
- [ ] `tests/unit/demo/host-routing.test.ts` — apex versus demo exact-host routing and open-redirect rejection.
- [ ] `tests/unit/demo/session-route.test.ts` — session reuse, stale-cookie repair, local sign-out, terminal failures, and loop bounds.
- [ ] `tests/unit/demo/guard.test.ts` — demo-user OR demo-company truth table with no role exemption.
- [ ] `tests/unit/demo/mutation-boundary-sweep.test.ts` — classified inventory of server actions, APIs, service writes, and company jobs.
- [ ] `tests/unit/demo/side-effect-boundaries.test.ts` — provider and dispatcher calls remain untouched after denial.
- [ ] `tests/unit/demo/rls-migration-contract.test.ts` — static SQL policy and coverage assertions.
- [ ] `tests/integration/demo-readonly-rls.test.ts` — authenticated direct database/storage denial with allowed reads and normal-tenant regression proof.
- [ ] `tests/e2e/demo-session-isolation.spec.ts` — apex-before/after cookie/session isolation, real dashboard entry, representative denial, and no loops.
- [ ] Playwright setup for distinct apex and `demo.localhost:9633` origins.

No new test framework installation is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Coolify forwards a trustworthy host and serves `demo.xtimator.com` with the expected TLS/cookie behavior | ENTRY-01, ENTRY-02 | Reverse-proxy and DNS state is outside the repository | After operator configuration, inspect the redirect chain and browser cookie domains on production. |
| Supabase production redirect allow-list accepts only the intended demo entry/callback URLs | ENTRY-02 | Supabase dashboard configuration is external | Verify the configured URLs exactly match the documented production origins before cutover. |

---

## Validation Sign-Off

- [x] Every phase requirement has an automated verification path.
- [x] Sampling continuity prevents three consecutive unverified tasks.
- [x] Wave 0 names every missing test artifact.
- [x] Commands contain no watch-mode flags.
- [x] Quick feedback latency target is under 60 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.
- [ ] Wave 0 test artifacts implemented and green.
- [ ] External production-host checks completed before Phase 181 cutover.

**Approval:** strategy approved 2026-07-26; implementation evidence pending
