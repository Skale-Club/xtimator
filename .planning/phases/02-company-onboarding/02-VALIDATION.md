---
phase: 2
slug: company-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 + jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | ONBOARD-02 | unit | `bun test tests/unit/industries.test.ts` | Wave 0 | ⬜ pending |
| 02-02-01 | 02 | 1 | ONBOARD-01 | unit | `bun test tests/unit/onboarding-schema.test.ts -t "step 1"` | Wave 0 | ⬜ pending |
| 02-02-02 | 02 | 1 | ONBOARD-02, ONBOARD-03 | unit | `bun test tests/unit/onboarding-schema.test.ts -t "step 2"` | Wave 0 | ⬜ pending |
| 02-02-03 | 02 | 1 | ONBOARD-05, ONBOARD-06 | unit | `bun test tests/unit/onboarding-schema.test.ts -t "step 3"` | Wave 0 | ⬜ pending |
| 02-02-04 | 02 | 1 | ONBOARD-08 | unit | `bun test tests/unit/onboarding-schema.test.ts -t "skip"` | Wave 0 | ⬜ pending |
| 02-03-01 | 03 | 2 | ONBOARD-04 | manual-only | N/A (requires Supabase connection) | N/A | ⬜ pending |
| 02-03-02 | 03 | 2 | ONBOARD-07 | manual-only | N/A (requires server action + redirect) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/industries.test.ts` — stubs for ONBOARD-02 (INDUSTRIES config structure, project types per industry)
- [ ] `tests/unit/onboarding-schema.test.ts` — stubs for ONBOARD-01, 03, 05, 06, 08 (zod schema validation for all 3 steps + skip flow)

*Existing infrastructure covers test framework — vitest already configured from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Logo upload to Supabase Storage | ONBOARD-04 | Requires live Supabase connection and Storage bucket | 1. Start dev server 2. Sign up/login 3. In Step 2, upload a PNG logo 4. Verify preview appears 5. Check Supabase Storage dashboard for file in `logos/` bucket |
| Redirect to dashboard after completion | ONBOARD-07 | Requires server action execution + Next.js redirect | 1. Complete all 3 wizard steps 2. Click "Complete Setup" 3. Verify redirect to `/dashboard` 4. Verify company name visible in page |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
