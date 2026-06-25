# Requirements: Xtimator — Milestone v4.12 Team Seats & Member Invites

**Defined:** 2026-06-25
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Turn the dormant multi-user foundation (`company_members`, Phase 79) into a real team-seats feature — invite teammates into the SAME organization (`company`), assign roles, and bill per seat at a price that is fully configurable in the super-admin panel. Source: [SEED-037](seeds/SEED-037-team-seats-member-invites.md).

> **Locked decisions (non-negotiable):**
> - **The org unit is `company`; a seat = one `company_members` row.** No new "organization" entity. All org-owned data (clients, price book, estimates, credits, Connect payout) is already company-scoped and shared by every member via the EXISTING RLS that authorizes through `company_members` — reuse it, do NOT rebuild multi-tenancy.
> - **Roles widen to a small explicit matrix: `owner` / `admin` / `member`** (`viewer` deferred to v2). Exactly one `owner` per company (billing-responsible). Role checks are SERVER-SIDE authority (RLS + a single `requireCompanyRole` helper) — never trusted from the client.
> - **ZERO hardcoded billing numbers.** The per-seat price (`seatPriceCents`) and the per-tier included-seat counts (`tiers[tier].includedSeats`) live in the super-admin `billing_config` store (`lib/billing/billing-config.ts`), read at runtime via `getBillingConfig()`, editable in the panel, applied without a deploy (30s TTL flush) — exactly like `estimateFeePct` / `markup` / `monthlyCreditGrant`. No seat price, included-seat count, or Stripe Price ID may be a constant in application code.
> - **The super-admin panel controls every billing knob and is ONLY for Xtimator operators.** Tenants never see it (reuses the [[SEED-035]] discipline).
> - **Billable seats = `max(0, activeMembers − tiers[tier].includedSeats)`**; monthly seat charge = `billableSeats × seatPriceCents`. Seats are billed on the EXISTING platform subscription (`companies.stripe_subscription_id`) as a quantity-based subscription item whose `unit_amount` comes from `billing_config` and whose `quantity` re-syncs on membership change.
> - **Calibrate before charging.** Seat billing is gated by the master `billing_config.enforcementEnabled` switch (default false): seat changes RECORD the quantity but do not charge until calibration flips it on.
> - **Retrocompat is mandatory.** Existing single-owner orgs sit inside `includedSeats` → zero seat charge, zero behavior change. The invite/role/billing additions must not alter any single-user flow.
> - **A pending invite does NOT consume a billable seat** — the seat is counted on ACCEPTANCE.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Schema & Authorization

- [ ] **SEAT-01**: Idempotent authored-only migration — widen `company_members.role` CHECK from `('owner')` to `('owner','admin','member')` (DROP/ADD named CHECK); create `company_invites` table (`id`, `company_id`, `email`, `role`, `token`, `status`, `invited_by`, `expires_at`, `created_at`) + RLS (owner/admin manage their company's invites; token-based accept via service role). Retrocompat: existing `owner` rows untouched; no change to `companies` billing columns.
- [ ] **SEAT-02**: A single server-side `requireCompanyRole(companyId, roles)` authorization helper enforcing the locked role matrix (owner/admin manage members; owner-only for billing/seat/ownership). Every team + billing server action gates through it; the role gate lives in ONE place and is never client-trusted.

### Invites & Membership

- [ ] **SEAT-03**: Invite lifecycle — `inviteMember(companyId, email, role)` + `revokeInvite` server actions (owner/admin only) creating a single-use, expiring `company_invites` row and sending a Resend invite email with the accept link. A pending invite does not consume a billable seat.
- [ ] **SEAT-04**: Accept onboarding — `acceptInvite(token)`: a token that is valid/unexpired/pending adds the `company_members` row and switches the active company. If the invited email already has an auth user → join directly; if not → a signup-then-join branch that SKIPS company creation (the existing onboarding always creates a company — this path must branch to JOIN the existing one).
- [ ] **SEAT-05**: Member management — `removeMember` + `changeMemberRole` server actions (gated) + a `Settings → Team` UI: list members (name/email/role), list pending invites, an Invite action (email + role), remove member, change role. Mobile-safe (iOS Safari / Android Chrome). Removing a member revokes access immediately and decrements the seat quantity on the next sync.

### Configurable Seat Billing

- [ ] **SEAT-06**: Extend `BillingConfig` + `DEFAULT_BILLING_CONFIG` (`lib/billing/billing-config.ts`) with `seatPriceCents` (global) and `tiers[tier].includedSeats` (per-tier) as null-safe calibration placeholders, and surface both as editable fields in the super-admin billing panel. Nothing hardcoded; the deep-merge reader tolerates rows written before the fields existed.
- [ ] **SEAT-07**: Seat-billing math + sync — pure, unit-tested `computeBillableSeats(activeMembers, includedSeats)` + `computeSeatChargeCents(billableSeats, seatPriceCents)` (no I/O, arithmetic in one place) + a server `syncSeatBilling(companyId)` that reads the live member count + `billing_config` and updates the Stripe subscription seat-quantity item, gated by `billing_config.enforcementEnabled`. Retrocompat: single-owner orgs within `includedSeats` produce zero billable seats and no Stripe write.
- [ ] **SEAT-08**: Seat-cost transparency UI — the `Settings → Team` surface shows the org's current active seat count, the configured per-seat price, and the projected monthly seat cost, all read from `billing_config` at runtime (never hardcoded) — same billing-transparency principle as the 1%-fee disclosure.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **SEATX-01**: `viewer` (read-only) role + granular per-resource permissions.
- **SEATX-02**: SSO / SCIM provisioning for larger teams.
- **SEATX-03**: Per-action audit trail beyond the existing admin audit log; seat-usage analytics.
- **SEATX-04**: Ownership-transfer with full audit + multi-owner support.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rebuilding multi-tenancy / RLS | The `company_members`-based RLS already authorizes all data; reuse it |
| Hardcoded seat price or included-seat counts | Every billing knob is super-admin-configurable via `billing_config` |
| Charging seats before calibration | Gated by `enforcementEnabled`; record-only until calibrated |
| `viewer` / granular permissions / SSO | Deferred to v2 — keep the role matrix to owner/admin/member |
| A second invoice / separate seat checkout | Seats ride the existing platform subscription as a quantity item |
| Changing any single-owner-org behavior | Retrocompat — existing orgs sit within included seats, zero change |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEAT-01 | Phase 135 | Pending |
| SEAT-02 | Phase 135 | Pending |
| SEAT-03 | Phase 136 | Pending |
| SEAT-04 | Phase 137 | Pending |
| SEAT-05 | Phase 138 | Pending |
| SEAT-06 | Phase 139 | Pending |
| SEAT-07 | Phase 139 | Pending |
| SEAT-08 | Phase 140 | Pending |

**Coverage:**
- v1 requirements: 8 total
- Mapped to phases: 8/8 (Phases 135-140) — **0 orphans**
- Unmapped: 0

---
*Requirements defined: 2026-06-25 — milestone v4.12 Team Seats & Member Invites (source SEED-037; phase numbering continues the global counter — v4.11 ended at Phase 134, so this milestone starts at Phase 135).*
