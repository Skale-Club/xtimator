---
phase: 80
slug: walkthrough-audit-debug-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + Playwright |
| **Config file** | vitest.config.ts / playwright.config.ts |
| **Quick run command** | `npx vitest run tests/unit/tour/` |
| **Full suite command** | `npm run test -- --run && npx playwright test tests/e2e/tour-flow.spec.ts` |
| **Estimated runtime** | ~10s (unit) / ~60s (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/tour/`
- **After every plan wave:** Run full suite including Playwright
- **Before `/gsd:verify-work`:** Full suite green + manual browser QA
- **Max feedback latency:** 10 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 80-01-01 | 01 | 1 | TOUR-QA-01 | manual | WALKTHROUGH-FINDINGS.md created | N/A | ⬜ pending |
| 80-02-01 | 02 | 2 | TOUR-QA-02 | unit | `npx vitest run tests/unit/tour/` | ✅ | ⬜ pending |
| 80-02-02 | 02 | 2 | TOUR-QA-02 | manual | Browser viewport test 390px | N/A | ⬜ pending |
| 80-03-01 | 03 | 3 | TOUR-QA-03 | unit | `npx vitest run tests/unit/tour/` | ✅ | ⬜ pending |
| 80-03-02 | 03 | 3 | TOUR-QA-04 | unit | `npx vitest run tests/unit/tour/` | ✅ | ⬜ pending |
| 80-04-01 | 04 | 4 | TOUR-QA-05 | e2e | `npx playwright test tests/e2e/tour-flow.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Playwright auth fixture — `authenticated-state.json` populated via `globalSetup` so `tour-flow.spec.ts` tests can un-skip (Plan 04)

*Existing vitest infrastructure covers unit test requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagnosis findings document | TOUR-QA-01 | Requires running app + visual inspection | Run tour-uat-runbook.md in EN/PT/ES on desktop + mobile 390px |
| Language-toggle spotlight on mobile | TOUR-QA-02 | Requires real mobile viewport | Chrome DevTools device sim: verify spotlight targets correct element |
| Tour copy matches UI | TOUR-QA-02 | Requires visual inspection | Step through each of 5 tour steps; verify labels/targets exist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or manual-only documented
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers Playwright auth fixture
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s for unit tests
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
