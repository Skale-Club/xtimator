---
phase: 38
slug: custom-domain-db-settings-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/ --reporter=verbose` |
| **Full suite command** | `npx vitest run tests/unit/ && npx playwright test` |
| **Estimated runtime** | ~30 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/ --reporter=verbose`
- **After every plan wave:** Run full unit suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | DOMAIN-01 | unit | `npx vitest run tests/unit/custom-domain.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | DOMAIN-01 | integration | DB migration applied | manual | ⬜ pending |
| 38-01-03 | 01 | 2 | DOMAIN-01 | unit | `npx vitest run tests/unit/custom-domain.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 2 | DOMAIN-02 | manual | DNS instructions visible after domain save | manual | ⬜ pending |
| 38-01-05 | 01 | 3 | DOMAIN-05 | manual | Existing share links unchanged | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/custom-domain.test.ts` — stubs for saveCustomDomain action (DOMAIN-01), domain format validation (DOMAIN-01)

*Existing vitest infrastructure covers the phase; only the new test file needs Wave 0 scaffolding.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DNS/CNAME instructions visible and correct after domain save | DOMAIN-02 | UI rendering + static text review | Save a domain, verify instruction card appears with CNAME target and record type |
| Company without custom_domain: share link unchanged | DOMAIN-05 | Regression check | Create estimate, share — verify URL is xtimator.com/estimate/{token} |
| Custom_domain scoped per company (no cross-company leak) | DOMAIN-01 | RLS enforcement | Two companies — verify domain saved by A is not visible to B |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
