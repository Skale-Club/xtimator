---
phase: 11
slug: marketing-landing-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.4 + jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run tests/unit/middleware.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/unit/middleware.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | LAND-01 | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ extend | ⬜ pending |
| 11-01-02 | 01 | 0 | LAND-01 | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ extend | ⬜ pending |
| 11-01-03 | 01 | 0 | LAND-02 | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ extend | ⬜ pending |
| 11-02-01 | 02 | 1 | LAND-01 | manual | Verify `/` renders landing page (not redirect) | N/A | ⬜ pending |
| 11-02-02 | 02 | 1 | LAND-03 | manual | Features grid has 4 cards on localhost:9633 | N/A | ⬜ pending |
| 11-02-03 | 02 | 1 | LAND-04 | manual | Touch targets ≥ 44px via DevTools mobile emulation | N/A | ⬜ pending |
| 11-02-04 | 02 | 1 | LAND-05 | unit | `npm test -- --run tests/unit/globals-brand-tokens.test.ts` | ✅ Phase 10 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/middleware.test.ts` — add 2 new test cases: (a) `/ is a public route (unauthenticated)`, (b) `/ redirects authenticated users to /dashboard`. File exists; cases are new additions.

*All other test infrastructure is in place. No new test files or framework setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Features grid has 4 cards | LAND-03 | Visual layout — no DOM test infra for rendering sections | Run `npm run dev`, visit `localhost:9633/`, count feature cards |
| Touch targets ≥ 44px | LAND-04 | Requires browser DevTools measurement | Open DevTools → mobile emulation → inspect CTA button height ≥ 44px |
| Renders on iOS Safari / Android Chrome | LAND-04 | Device-specific browser quirks | Manual device test or BrowserStack |
| Dark mode visual quality | LAND-05 | Subjective visual standard | Compare to UI-SPEC.md screenshots |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
