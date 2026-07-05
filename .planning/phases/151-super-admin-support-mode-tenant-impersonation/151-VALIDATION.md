---
phase: 151
slug: super-admin-support-mode-tenant-impersonation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 151 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (unit/integration), Playwright (e2e) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run tests/unit/support-mode.test.ts --reporter=dot` |
| **Full suite command** | `npm run test` (vitest run, all `tests/unit/**` + `tests/integration/**`) |
| **Estimated runtime** | ~5-10 seconds for the phase's own suite; e2e spec is env-gated (skips without `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/support-mode.test.ts`
- **After every plan wave:** Run `npm run test` (full unit/integration suite)
- **Before `/gsd:verify-work`:** Full suite must be green; e2e support-mode spec runs if env-configured, otherwise skips gracefully (mirrors `tests/e2e/admin-gate.spec.ts`)
- **Max feedback latency:** ~10 seconds for unit tests

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 151-01-01 | 01 | 0 | SUPPORT-04 | unit | `npx vitest run tests/unit/support-mode.test.ts -t "tamper\|expir\|revoked"` | ❌ W0 | ⬜ pending |
| 151-01-02 | 01 | 0 | SUPPORT-01, SUPPORT-03 | unit | `npx vitest run tests/unit/support-mode.test.ts -t "requireAdmin\|audit"` | ❌ W0 | ⬜ pending |
| 151-01-03 | 01 | 0 | SUPPORT-01, SUPPORT-02 | e2e (env-gated) | `npx playwright test tests/e2e/support-mode.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/support-mode.test.ts` — covers SUPPORT-01, SUPPORT-03, SUPPORT-04: signature tamper rejection, expiry rejection, mid-session admin-revocation rejection, `requireAdmin()` gate on `startSupportSession`, `logAdminAction` calls for both start (`company.support_mode_start`) and end (`company.support_mode_end` with `durationSeconds`). Mock `next/headers`/`@/lib/supabase/service`/`@/lib/admin/audit-log` following the existing `tests/unit/active-company-helpers.test.ts` mocking shape.
- [ ] `tests/e2e/support-mode.spec.ts` — covers SUPPORT-02: banner visible with correct admin/company identity while impersonating, company switcher suppressed, exit flow works. Env-gated exactly like `tests/e2e/admin-gate.spec.ts` (`test.skip(!adminEmail || !adminPassword, ...)`).
- No framework install needed — Vitest 4.1.4 and Playwright already configured and used by sibling admin features.

---

## Manual-Only Verifications

*None — SUPPORT-02's visual/identity correctness is covered by the env-gated e2e spec above; when the env vars are absent in a given run, this becomes the one item worth a human glance during UAT, but it is not exclusively manual by design.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
