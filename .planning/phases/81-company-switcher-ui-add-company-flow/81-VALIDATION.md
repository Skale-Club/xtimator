---
phase: 81
slug: company-switcher-ui-add-company-flow
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-26
---

# Phase 81 — Validation Strategy

> Per-phase validation contract derived from `81-CONTEXT.md` SWITCH-16/17/18 and `81-RESEARCH.md` recommendations.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (existing — no Wave 0 install) |
| **Quick run command** | `npx vitest run tests/unit/active-company-helpers.test.ts tests/unit/switch-active-company.test.ts tests/unit/company-selector-contract.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3 s (quick), ~30 s (full) |

---

## Sampling Rate

- **After every task commit:** Run quick (the three Phase 81 suites)
- **After every plan wave:** Run quick + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

(Pending detailed task IDs from the planner. The planner is expected to slot test files into this table when generating PLAN.md files.)

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 81-01-01 | 01 | 1 | SWITCH-04 | unit | `vitest active-company-helpers` | ✅ extend | ⬜ pending |
| 81-02-01 | 02 | 2 | SWITCH-06 | unit | `vitest switch-active-company` | ❌ W0 | ⬜ pending |
| 81-03-01 | 03 | 3 | SWITCH-13, SWITCH-14, SWITCH-17 | static-contract | `vitest company-selector-contract` | ❌ W0 | ⬜ pending |
| 81-03-02 | 03 | 3 | SWITCH-11 | unit | `vitest onboarding-mode-add` | ❌ W0 | ⬜ pending |
| 81-04-01 | 04 | 4 | SWITCH-13 (integration) | static-contract | `vitest layout-membership-companies` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/switch-active-company.test.ts` — failing stubs for SWITCH-06 branches (auth, forbidden, success)
- [ ] `tests/unit/company-selector-contract.test.ts` — failing static-contract assertions for the wired CompanySelector (imports useTransition, references ACTIVE_COMPANY_COOKIE via Phase 79 exports only, no hardcoded `'active_company_id'`)
- [ ] `tests/unit/onboarding-mode-add.test.ts` — failing assertions that the onboarding page reads `searchParams.mode` and the survey threads `mode: 'add'` to `createOrUpdateCompany`
- [ ] `tests/unit/layout-membership-companies.test.ts` — failing static-contract that `app/(app)/layout.tsx` calls `getMembershipCompanies()` and passes the list to the sidebar
- (Extensions to existing files do not need Wave 0 stubs — vitest will fail naturally on missing exports.)

---

## Validation Dimensions (Nyquist 8)

| # | Dimension | Coverage |
|---|---|---|
| 1 | Behavior under valid inputs | unit tests on `getMembershipCompanies` (returns the right shape, ordered correctly) and `switchActiveCompany` (success branch sets cookie + revalidates) |
| 2 | Behavior under invalid inputs | `switchActiveCompany` forbidden branch (user has no membership row), unauthenticated branch |
| 3 | Edge cases | Single-company user (dropdown still renders, only Add available); user logged out mid-switch (`getClaims` returns null); company deleted between dropdown render and switch click (membership row missing → forbidden) |
| 4 | Integration points | Static-contract on `CompanySelector` import graph (SWITCH-17); static-contract on `app/(app)/layout.tsx` calling `getMembershipCompanies` and passing to `<Sidebar>` |
| 5 | Non-functional (perf, a11y, security) | RLS confirmed via Phase 79 migration (request-scoped client); no service-role exposure; cookie write goes through Phase 79's `ACTIVE_COMPANY_COOKIE_OPTIONS` (httpOnly, sameSite=lax, 30d) |
| 6 | Regression coverage | Existing `active-company-helpers.test.ts` (Phase 79) must still pass after `getMembershipCompanies` is added to the same file |
| 7 | Composition / E2E | Deferred to HUMAN-UAT (per SWITCH-18) — the cookie-write-then-revalidate-then-render composition requires a real Next dev server and a real Supabase session cookie; no vitest mock can stand in |
| 8 | Failure recovery | `switchActiveCompany` returns discriminated union `{ ok: true } \| { error: 'forbidden' \| 'unauthenticated' }`; CompanySelector handles `error` by `toast.error` + `router.refresh()` per SWITCH-08 |

---

## HUMAN-UAT Items (deferred to verifier)

The verifier will surface these in `81-HUMAN-UAT.md`:

1. **Switch flow desktop:** Sign in as a user with ≥2 company memberships, open the sidebar dropdown, click a non-active company. Confirm: spinner appears on the clicked item briefly, dropdown closes, sidebar re-renders with new active company, `active_company_id` cookie in DevTools updates, no console errors, no page flash.
2. **Add company flow:** Click "+ Add new company" → routed to `/onboarding?mode=add` → fills industry/name → submits → lands on `/dashboard` with the new company as active. Cookie updated. Old companies still selectable from the dropdown.
3. **Single-company UX:** Sign in as a user with exactly one company. Confirm dropdown renders, opens, shows only "+ Add new company" (no "Switch" items), and "+ Add new company" navigates correctly.
4. **Forbidden recovery:** Open the dropdown, in another tab revoke the user's `company_members` row (via Supabase Studio), come back, click the now-orphaned company. Confirm: toast.error appears, dropdown refetches and the orphaned company is gone from the list.
5. **Collapsed sidebar:** Collapse the sidebar (icon-only mode). Confirm the avatar still opens the same dropdown with the same content.

---

## Plan-Checker Acceptance Gates

The plan-checker (gsd-plan-checker) will be instructed to BLOCK if:

- Any plan references `'active_company_id'` as a string literal (must use `ACTIVE_COMPANY_COOKIE` from Phase 79).
- Any plan calls `createOrUpdateCompany` directly from the switcher (must route via `/onboarding?mode=add` per SWITCH-10).
- Any plan uses `requireServiceClient` in `getMembershipCompanies` (Phase 79's RLS makes service-role wrong here — use request-scoped client per SWITCH-04).
- Any plan modifies tenant-scoped RLS or server actions outside of the switcher/onboarding/layout files (out-of-scope per CONTEXT).
- Any plan ships mobile-header changes (deferred per SWITCH-15).
