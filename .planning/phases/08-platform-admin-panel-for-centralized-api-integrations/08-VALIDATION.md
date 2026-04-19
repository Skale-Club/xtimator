---
phase: 8
slug: platform-admin-panel-for-centralized-api-integrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled by the planner during Phase 8 planning. This is a draft scaffold; the
> researcher's `## Validation Architecture` section in `08-RESEARCH.md` contains
> the detailed validation approach per topic (10 items + 16 Wave-0 test files).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already installed in devDependencies) + Playwright 1.59 for E2E |
| **Config file** | `vitest.config.ts` (existing) / `playwright.config.ts` (existing) |
| **Quick run command** | `bun run test:unit` |
| **Full suite command** | `bun run test` (unit + e2e) |
| **Estimated runtime** | ~60s unit, ~3m full |

---

## Sampling Rate

- **After every task commit:** Run `bun run test:unit` (scoped to changed file dir)
- **After every plan wave:** Run full unit suite `bun run test:unit`
- **Before `/gsd:verify-work`:** Full suite must be green (`bun run test`)
- **Max feedback latency:** 60s for unit, 3m for E2E

---

## Per-Task Verification Map

*Populated by planner — see 08-RESEARCH.md §Validation Architecture for the 14 proposed ADMIN-## requirements and their test assignments.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ADMIN-01…14 | unit/e2e | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Researcher flagged 16 test files as Wave 0 gaps. Populated by planner from RESEARCH.md §Validation Architecture, but anchor list:

- [ ] `tests/unit/lib/platform-config.test.ts` — loader cache + invalidation
- [ ] `tests/unit/lib/crypto.test.ts` — AES-256-GCM roundtrip, IV uniqueness, auth-tag tamper detection
- [ ] `tests/unit/middleware/admin-gate.test.ts` — proxy.ts 404 behavior for non-admins
- [ ] `tests/e2e/admin-integrations.spec.ts` — super-admin can set/test Resend key
- [ ] `tests/e2e/admin-branding.spec.ts` — branding edit reflects in auth wordmark
- [ ] `tests/e2e/admin-admins.spec.ts` — add/remove admin; cannot self-remove if last
- [ ] `tests/e2e/auth-dark-visual.spec.ts` — dark layout scoped to /(auth)
- [ ] Plus 9 additional from research §Validation Architecture

*Final count and list derived during planning.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First super-admin bootstrap via SQL | ADMIN-BOOTSTRAP | One-time ops procedure, not feature code | Follow `supabase/ADMIN-BOOTSTRAP.md` on a fresh DB; verify `/admin/*` reachable |
| Key rotation procedure | ADMIN-ROTATE | Destructive + env-var coupled | Follow `docs/APP_ENCRYPTION_KEY-rotation.md`; verify all integrations remain functional |
| Visual polish of dark auth layout | ADMIN-UI | Subjective aesthetics | Open `/login` in light/dark OS preference; verify no flash-of-wrong-theme |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (16+ files from research)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
