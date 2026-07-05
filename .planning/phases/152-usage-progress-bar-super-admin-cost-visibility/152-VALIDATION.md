---
phase: 152
slug: usage-progress-bar-super-admin-cost-visibility
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 152 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`tests/unit/` convention throughout the codebase) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/billing/` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | Fast (~10s) for scoped domain; full suite several minutes — required per wave since this phase touches shared components (`credit-balance-card.tsx`, `credit-chip.tsx`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/billing/`
- **After every plan wave:** Run `npm test` (full suite — required, this phase touches shared/imported components)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds for scoped tests

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 152-01-01 | 01 | 0 | CREDITUI-03 | unit | `npx vitest run tests/unit/billing/usage-percent.test.ts` | ❌ W0 | ⬜ pending |
| 152-01-02 | 01 | 0 | CREDITUI-03/04 | unit | `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` | ✅ rewrite | ⬜ pending |
| 152-01-03 | 01 | 0 | CREDITUI-03/04 | unit | `npx vitest run tests/unit/app-shell/credit-chip.test.tsx` | ❌ W0 | ⬜ pending |
| 152-01-04 | 01 | 0 | CREDITUI-04 | unit (static) | `npx vitest run tests/unit/billing/tenant-cost-neutrality.test.ts` | ❌ W0 | ⬜ pending |
| 152-01-05 | 01 | 0 | CREDITUI-05 | unit | `npx vitest run tests/unit/billing/admin-company-cost.test.ts` | ❌ W0 | ⬜ pending |
| 152-01-06 | 01 | 0 | CREDITUI-05 | unit | `npx vitest run tests/unit/admin/company-cost-card.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/usage-percent.test.ts` — pure formula: clamp 0-100, divide-by-zero guard, tier resolution (paid vs. free/signup grant)
- [ ] `tests/unit/billing/credit-balance-card.test.tsx` — REWRITE existing file (old props `balance`/`lowBalanceThresholds` are gone) — asserts bar renders, "{N}% used" text, color bands at 70/90, NO raw credit count or $ anywhere in render output
- [ ] `tests/unit/app-shell/credit-chip.test.tsx` — NEW (no existing chip test found) — same no-raw-number assertions for the topbar surface
- [ ] `tests/unit/billing/tenant-cost-neutrality.test.ts` — static grep test asserting `real_cost_usd`/`markup`/`balance_after` never appear in `lib/queries/credits.ts` or any file under `components/billing/**` — MUST strip/scope past doc-comment false positives (research flagged `credit-balance-card.tsx`'s own doc comment contains the word "markup" in prose; match on actual code tokens, not naive substring)
- [ ] `tests/unit/billing/admin-company-cost.test.ts` — the new per-company admin query (mocked service client), asserts scoping to one `company_id` and exclusion of other companies' rows
- [ ] `tests/unit/admin/company-cost-card.test.tsx` — the new admin card component; also assert (via static import-boundary check) it is never imported from any tenant-facing route
- No framework install needed — Vitest already configured.

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (formula unit tests + component render assertions + static grep enforcement for the tenant/admin data boundary).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
