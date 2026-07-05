# Requirements: Xtimator — Milestone v4.15 Credit UX Polish & Admin Support Tooling

**Defined:** 2026-07-05
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Replace the raw numeric credit counter with a Claude-Console-style usage progress bar (tenants see only a % consumed, never $/credit math), move exact $ cost visibility to a super-admin-only surface, rework the top-up purchase flow to dollar packs with auto-top-up, and give the super admin an audited way to enter a tenant's live app view for support plus a properly paginated/searchable/filterable Companies admin screen. Source: [SEED-039](seeds/SEED-039-usage-progress-bar-dollar-topup.md) + [SEED-040](seeds/SEED-040-super-admin-tenant-impersonation-companies-overhaul.md).

> **Locked decisions (non-negotiable):**
> - **No new credit ledger.** The credit_ledger, markup math, and low-balance-threshold logic shipped by SEED-035/CREDITUI-01/02 (Phase 115) stay exactly as they are. This milestone is the UI + purchase-flow layer on top — it must not duplicate or re-derive ledger logic.
> - **Tenants never see raw numbers.** No credit count and no $ figure may render on any tenant-facing surface (Plans page, topbar chip, notifications) — only a % bar and qualitative low/critical states.
> - **$ cost visibility is super-admin-only**, extending the existing `measured-cost-card.tsx` admin pattern — never exposed to a tenant, even indirectly (e.g. via network payload a tenant page fetches).
> - **Top-up packs and thresholds are configurable in `billing_config`**, never hardcoded — consistent with the SEED-035 "everything configurable" principle already established for markup/grants/prices.
> - **Support Mode is NOT a real identity switch.** Impersonation uses a signed, time-boxed "acting-as-company" session claim layered on the admin's own session — RLS-safe, revocable, never persisted beyond the browser session, and distinct from a Supabase auth sign-in as the tenant.
> - **Support Mode ≠ HandoffButton.** The existing `HandoffButton` (Phase 149, `app/admin/companies/handoff-button.tsx`) sends a real owner-invite email to transfer a DEMO account to a prospect — a sales flow. Support Mode is a live, audited, admin-eyes-only viewing capability. The two must not be conflated or merged.
> - **Every Support Mode session is audit-logged** via the existing `lib/admin/audit-log.ts` — who, which company, when, how long.
> - **Phase numbering** continues the global ROADMAP.md counter from Phase 149 (v4.14 Admin Sales Mode) — Phase 1001 (SEO) shipped out-of-band via quick-tasks and is not part of the roadmap phase counter. v4.15 starts at **Phase 150**.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Usage Progress Bar

- [ ] **CREDITUI-03**: Tenant sees a single usage progress bar (percentage consumed this cycle, color-escalating as it depletes) on Settings > Plans and in the app-shell topbar credit chip, replacing today's raw numeric "N credits" display.
- [ ] **CREDITUI-04**: No tenant-facing surface (Plans page, topbar chip, low-balance notification copy) displays a raw credit count or a dollar cost figure — only the percentage bar and qualitative low/critical states.

### Super-Admin-Only Cost Visibility

- [x] **CREDITUI-05**: Super admin can view, per company, the exact credit balance, real USD cost incurred, and applied markup — surfaced in the admin panel (extending the existing `measured-cost-card.tsx` pattern); this data is never sent to or renderable by a tenant session.

### Dollar-Denominated Top-Up

- [ ] **CREDITUI-06**: Tenant purchases additional credits by choosing a dollar amount ($20 / $50 / $100, sizes configurable in `billing_config`) rather than a credit quantity; the chosen amount is charged via a Stripe one-time checkout and converted to credits using the existing markup/denomination.
- [ ] **CREDITUI-07**: Tenant can enable auto-top-up — when the balance drops below a configurable dollar threshold, the configured dollar pack is purchased automatically against their saved default payment method, mirroring Anthropic Console's Auto Top-Up settings (threshold, purchase amount, primary payment method).

### Super-Admin Tenant Impersonation (Support Mode)

- [x] **SUPPORT-01**: Super admin can enter a normal tenant-scoped app view ("Support Mode") for any company directly from the admin Companies screen, without needing the tenant's credentials.
- [ ] **SUPPORT-02**: While in Support Mode, every page displays a persistent banner identifying the acting super admin and the company being viewed, matching the existing "Super Admin Mode" banner already shown across `/admin`.
- [x] **SUPPORT-03**: Every Support Mode session (entry, company, admin identity, duration, exit) is recorded in the existing admin audit log.
- [x] **SUPPORT-04**: Support Mode access is scoped by a signed, time-boxed session claim (not a full identity switch), respects existing RLS, is automatically revoked when the session ends or expires, and never persists beyond the browser session.

### Companies Admin Screen Overhaul

- [x] **ADMINCO-01**: Super admin can search the Companies admin list by name or associated email and see live-filtered results.
- [x] **ADMINCO-02**: Super admin can filter the Companies list by tier, whether an AI model override is set, and demo vs. real account.
- [x] **ADMINCO-03**: The Companies list is server-side paginated (does not load every tenant row at once), with page navigation and a visible total count.
- [x] **ADMINCO-04**: The existing "Demo Accounts" grouping, `HandoffButton`, and "Configure →" per-row actions continue to work unchanged within the new paginated/filterable list.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **CREDITUIX-01**: Multiple/custom top-up amounts beyond the three configured packs (a free-entry $ field).
- **CREDITUIX-02**: Per-tier usage-bar reset cadence customization (today all tiers reset on the UTC calendar month, per existing behavior).
- **SUPPORTX-01**: Support Mode write actions (today scoped to read/navigate only — whether the super admin can perform mutating actions while impersonating is an open question deferred past v1).
- **ADMINCOX-01**: Bulk actions on the Companies list (bulk tier change, bulk export).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rebuilding the credit ledger / markup engine | SEED-035/CREDITUI-01/02 already shipped this; this milestone is UI + purchase-flow only |
| Tenant-visible $ cost anywhere | Locked decision — $ visibility is super-admin-only |
| Real Supabase-auth identity switch for impersonation | Locked decision — Support Mode uses a signed session claim, not a real sign-in-as |
| Merging Support Mode with `HandoffButton` | Different features (audited internal support view vs. demo-to-prospect owner invite) |
| Free-entry custom top-up amount | v1 ships exactly 3 configurable packs; deferred to CREDITUIX-01 |
| Bulk actions on Companies list | Deferred to ADMINCOX-01 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADMINCO-01 | Phase 150 | Complete |
| ADMINCO-02 | Phase 150 | Complete |
| ADMINCO-03 | Phase 150 | Complete |
| ADMINCO-04 | Phase 150 | Complete |
| SUPPORT-01 | Phase 151 | Complete |
| SUPPORT-02 | Phase 151 | Pending |
| SUPPORT-03 | Phase 151 | Complete |
| SUPPORT-04 | Phase 151 | Complete |
| CREDITUI-03 | Phase 152 | Pending |
| CREDITUI-04 | Phase 152 | Pending |
| CREDITUI-05 | Phase 152 | Complete |
| CREDITUI-06 | Phase 153 | Pending |
| CREDITUI-07 | Phase 153 | Pending |

Coverage: 13/13 v1 requirements mapped. 0 orphans.

---
*Requirements defined: 2026-07-05 — milestone v4.15 Credit UX Polish & Admin Support Tooling (sources: SEED-039, SEED-040; phase numbering continues the global counter — v4.14 ended at Phase 149 in ROADMAP.md, so this milestone starts at Phase 150).*
