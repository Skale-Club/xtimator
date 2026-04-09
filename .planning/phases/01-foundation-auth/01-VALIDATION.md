---
phase: 1
slug: foundation-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (E2E auth flows) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` — Wave 0 installs |
| **Quick run command** | `bun run test` |
| **Full suite command** | `bun run test && bun run test:e2e` |
| **Estimated runtime** | ~30 seconds (unit) / ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `bun run test`
- **After every plan wave:** Run `bun run test && bun run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | scaffold | 1 | SEC-03 | unit | `bun run test -- env` | ❌ W0 | ⬜ pending |
| 01-02-01 | supabase-wiring | 1 | AUTH-04 | unit | `bun run test -- supabase` | ❌ W0 | ⬜ pending |
| 01-02-02 | supabase-wiring | 1 | SEC-03 | unit | `bun run test -- middleware` | ❌ W0 | ⬜ pending |
| 01-03-01 | migrations | 1 | SEC-01 | manual | supabase dashboard RLS check | N/A | ⬜ pending |
| 01-04-01 | auth-ui | 2 | AUTH-01 | e2e | `bun run test:e2e -- signup` | ❌ W0 | ⬜ pending |
| 01-04-02 | auth-ui | 2 | AUTH-02 | e2e | `bun run test:e2e -- login` | ❌ W0 | ⬜ pending |
| 01-04-03 | auth-ui | 2 | AUTH-03 | e2e | `bun run test:e2e -- google-oauth` | manual | ⬜ pending |
| 01-04-04 | auth-ui | 2 | AUTH-04 | e2e | `bun run test:e2e -- session` | ❌ W0 | ⬜ pending |
| 01-04-05 | auth-ui | 2 | AUTH-05 | e2e | `bun run test:e2e -- reset-password` | ❌ W0 | ⬜ pending |
| 01-04-06 | auth-ui | 2 | AUTH-06 | e2e | `bun run test:e2e -- onboarding-redirect` | ❌ W0 | ⬜ pending |
| 01-04-07 | auth-ui | 2 | AUTH-07 | e2e | `bun run test:e2e -- signout` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — configure vitest for Next.js App Router
- [ ] `playwright.config.ts` — configure Playwright for local dev server
- [ ] `tests/unit/env.test.ts` — validate env vars load correctly
- [ ] `tests/unit/supabase.test.ts` — validate client instantiation
- [ ] `tests/unit/middleware.test.ts` — validate middleware route protection logic
- [ ] `tests/e2e/auth.spec.ts` — E2E stubs for all auth flows

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RLS blocks cross-company data access | SEC-01 | Requires two live Supabase users; not practical to automate in Wave 0 | Create two accounts, insert row as user A, verify user B cannot read it |
| Google OAuth sign-in flow | AUTH-03 | OAuth redirect requires real Google credentials; no local mock | Configure OAuth app, click Google button, complete flow end-to-end |
| Password reset email delivery | AUTH-05 | Email delivery requires live SMTP/Supabase | Trigger reset, check inbox, follow link, set new password |
| Storage bucket policy blocks cross-company access | SEC-04 | Requires two live companies with files in Storage | Attempt to access other company's file URL — should return 403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
