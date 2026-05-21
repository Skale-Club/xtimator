---
phase: 80
slug: walkthrough-audit-debug-polish
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| 80-01-01 | 01 | 1 | TOUR-QA-01 | manual | `test -f .planning/phases/80-walkthrough-audit-debug-polish/WALKTHROUGH-FINDINGS.md` | N/A | ⬜ pending |
| 80-02-01 | 02 | 2 | TOUR-QA-02 | unit | `npx vitest run tests/unit/tour/` | ✅ | ⬜ pending |
| 80-02-02 | 02 | 2 | TOUR-QA-02 | manual | Browser viewport test 390px | N/A | ⬜ pending |
| 80-03-01 | 03 | 3 | TOUR-QA-03 | unit | `npx vitest run tests/unit/tour/` | ✅ | ⬜ pending |
| 80-03-02 | 03 | 3 | TOUR-QA-04 | unit + grep | `npx vitest run tests/unit/tour/ && grep -r "requestAnimationFrame" components/tour/tour-spotlight.tsx 2>&1; test $? -ne 0` | ✅ | ⬜ pending |
| 80-04-01 | 04 | 4 | TOUR-QA-05 | unit + e2e | `npx vitest run tests/unit/tour/ && grep globalSetup playwright.config.ts && npx playwright test tests/e2e/tour-flow.spec.ts` | ✅ (Plan 04 creates) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Playwright auth fixture — `authenticated-state.json` populated via `globalSetup` so `tour-flow.spec.ts` tests can un-skip (Plan 04, Task 3 creates globalSetup.ts)

*Existing vitest infrastructure covers unit test requirements. Plan 04 Task 3 creates the Wave 0 Playwright fixture.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagnosis findings document | TOUR-QA-01 | Requires running app + visual inspection | Run tour-uat-runbook.md in EN/PT/ES on desktop + mobile 390px |
| Language-toggle spotlight on mobile | TOUR-QA-02 | Requires real mobile viewport | Chrome DevTools device sim: verify spotlight targets correct element |
| Tour copy matches UI | TOUR-QA-02 | Requires visual inspection | Step through each of 5 tour steps; verify labels/targets exist |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual-only documented
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers Playwright auth fixture (created by Plan 04 Task 3)
- [x] No watch-mode flags
- [x] Feedback latency < 10s for unit tests
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
