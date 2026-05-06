---
phase: 19
slug: price-book-db-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-06
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Supabase integration tests |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `bun run test:unit` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds (unit + integration smoke) |

---

## Sampling Rate

- **After every task commit:** Run `bun run test:unit`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | schema | integration | `bun run test:integration` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | RLS | integration | `bun run test:integration` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 2 | build | build | `bun run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/price-book-rls.test.ts` — RLS smoke test: service-role vs anon client, following `tests/integration/platform-brand-rls.test.ts` pattern

*Existing vitest infrastructure covers build verification. Integration test stub is the only Wave 0 requirement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to live Supabase DB | schema prereq | Requires live DATABASE_URL env var | Run `bunx supabase db push --db-url "$DATABASE_URL"` and verify exit code 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
