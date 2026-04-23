---
phase: 11
slug: marketing-landing-page
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-22
---

# Phase 11 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Unit/Integration | Vitest (`npm test`) |
| E2E | Playwright (`npm run test:e2e`) |
| Base URL | `http://localhost:9633` |
| Primary route under test | `/` |

---

## Sampling Rate

- After each task in plan 11-01: run targeted checks for landing sections.
- After each task in plan 11-02: run targeted mobile e2e checks.
- Before `/gsd:verify-work`: run `npm test` and `npm run test:e2e tests/e2e/landing-page.spec.ts`.

---

## Per-Task Verification Map

| Task ID | Plan | Requirement | Test Type | Automated Command | Status |
|---------|------|-------------|-----------|-------------------|--------|
| 11-01-01 | 01 | LAND-01 | e2e | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "hero"` | pending |
| 11-01-02 | 01 | LAND-02 | e2e | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "how it works"` | pending |
| 11-01-03 | 01 | LAND-03 | e2e | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "features"` | pending |
| 11-01-04 | 01 | LAND-01 | e2e | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "authenticated root redirect"` | pending |
| 11-02-01 | 02 | LAND-04 | e2e-mobile | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "mobile"` | pending |
| 11-02-02 | 02 | LAND-05 | visual + e2e | `npm run test:e2e tests/e2e/landing-page.spec.ts -g "brand palette"` | pending |

---

## Wave 0 Requirements

- [ ] `tests/e2e/landing-page.spec.ts` created with assertions for hero, how-it-works, features, CTA, and auth redirect behavior.
- [ ] Playwright config includes mobile projects for iOS Safari emulation and Android Chrome emulation.

---

## Manual Verification (Required)

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|-------------|
| Visual quality feels production-grade | LAND-05 | Subjective quality bar needs human review | Open `/` on desktop and mobile; confirm hierarchy, spacing, and polish |
| Real iOS Safari rendering | LAND-04 | Emulation is not perfect for Safari quirks | Check hero, CTA tap targets, and no clipping on an actual iPhone browser |
| Real Android Chrome rendering | LAND-04 | Emulation cannot catch every device/browser quirk | Check section spacing, CTA tap behavior, and no horizontal scroll |

---

## Validation Sign-Off Checklist

- [ ] Every requirement LAND-01..LAND-05 mapped to at least one automated test.
- [ ] Mobile checks run in CI-friendly Playwright config.
- [ ] `npm test` remains green (no regression).
- [ ] `nyquist_compliant: true` set before execution starts.
