---
phase: 13
slug: visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 13 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run tests/unit/app-icons.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/unit/app-icons.test.ts`
- **After every plan wave:** Run `npm test -- --run tests/unit/app-icons.test.ts && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | D-08, D-09 | unit | `npm test -- --run tests/unit/app-icons.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | D-01, D-02, D-03, D-06, D-08 | build + unit | `npm test -- --run tests/unit/app-icons.test.ts && npm run build` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | D-08, D-09 | build + unit | `npm test -- --run tests/unit/app-icons.test.ts && npm run build` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | D-08, D-09 | checkpoint | `npm test -- --run tests/unit/app-icons.test.ts && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/app-icons.test.ts` - regression suite for asset presence, manifest content, public-route safety, and duplicate sweep

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Desktop browser tab shows the new monogram favicon | D-08, D-09 | Requires real browser chrome rendering | Start `npm run dev`, open `/`, verify the tab icon matches the new blue/monogram mark |
| iOS Add to Home Screen preview uses the new icon | D-08, D-09 | Requires Safari install UI | Open `/` in iOS Safari, share, inspect Add to Home Screen preview |
| Android install prompt / home-screen preview uses the new icon | D-08, D-09 | Requires Chrome install UI | Open `/` in Android Chrome, inspect install/home-screen icon preview |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
