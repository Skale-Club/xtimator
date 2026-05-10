---
phase: 40
slug: webhook-infrastructure
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-10
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Wave 0 approach: tests written RED-first within each task (inline TDD), not as a separate Wave 0 plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/whatsapp/ --reporter=verbose` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/whatsapp/ --reporter=verbose`
- **After every plan wave:** Run full unit suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 40-01-T1 | 01 | 1 | WA-01/03 | migration | `bunx supabase db push --db-url "$DATABASE_URL"` | ⬜ pending |
| 40-01-T2 | 01 | 1 | WA-01/02/03 | unit | `npx vitest run tests/unit/whatsapp/verify.test.ts tests/unit/whatsapp/client.test.ts` | ⬜ pending |
| 40-02-T1 | 02 | 2 | WA-01/02/03 | unit | `npx vitest run tests/unit/whatsapp/webhook-route.test.ts` | ⬜ pending |
| 40-02-T2 | 02 | 2 | WA-04 | unit + tsc | `grep -n "api/webhooks/whatsapp" proxy.ts && npx tsc --noEmit` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Approach

Tests are written RED-first **within each task** (inline TDD), not as a separate Wave 0 plan:
- Plan 01 Task 2: creates `tests/unit/whatsapp/verify.test.ts` + `tests/unit/whatsapp/client.test.ts` RED stubs before implementing the modules
- Plan 02 Task 1: creates `tests/unit/whatsapp/webhook-route.test.ts` RED stubs before implementing the route

This matches the established codebase pattern (STATE.md Phase 18 Wave 0 scaffold pattern).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meta GET webhook challenge responds correctly | WA-02 | Requires Meta portal or ngrok | Use ngrok + Meta test webhook tool in developer portal |
| WABA subscription activated | WA-01 | Meta portal step — must POST /{WABA_ID}/subscribed_apps | Confirm via Graph API Explorer after deploy |
| POST from Meta delivers without auth redirect | WA-04 | Requires live Meta request | Use Meta test message button in developer portal |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or inline TDD approach
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (4 tasks total, all covered)
- [x] Wave 0 strategy documented: inline TDD within tasks (no separate Wave 0 plan needed)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-10
