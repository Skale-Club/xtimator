---
id: SEED-037
status: harvested
harvested_in: v4.12 (phases 135-140)
planted: 2026-06-25
planted_during: v4.11 close-out (post advanced-pricing; org/billing/seats review session)
trigger_when: User activated 2026-06-25 — multi-user inside one organization with configurable per-seat pricing.
scope: Large
---

# SEED-037: Team Seats & Member Invites — Per-Seat Price Configurable in Super-Admin

Today a Xtimator organization (`company`) is effectively **single-user**: one owner, no way to add a teammate. The data foundation for multi-user already exists (`company_members`, Phase 79) and **all current RLS already authorizes through it** — but there is no invite flow, no role beyond `owner`, no member-management UI, and no seat billing. This seed turns that dormant foundation into a real **team-seats** feature: invite teammates into the same organization, assign roles, and bill **per seat at a price that is fully configurable in the super-admin panel — nothing hardcoded**.

## Why This Matters

Service businesses are rarely one person. An owner wants an office admin who sends estimates, or a field estimator who records walkthroughs — all inside the **same** company, sharing the same clients, price book, estimates, credits, and Stripe Connect payout. Without seats, each teammate would need a separate account (a separate company, separate data, separate subscription) — which defeats the point. Seats are also a clean, expected **revenue lever** for a B2B SaaS: organizations grow, and per-seat pricing scales revenue with the customer's own growth — exactly like the 1% transactional fee ([[SEED-036-estimate-payment-platform-fee]]) aligns revenue to the value transacted.

## Foundation that already exists (reuse, do NOT rebuild)

- **`company_members(user_id, company_id, role)`** join table — composite PK, already supports N users ↔ N companies (`20260525000001_phase79_company_members.sql`). The `role` CHECK is currently `IN ('owner')` only; the migration comment explicitly says "future tiers will widen the CHECK".
- **All new RLS already resolves access via `company_members`** (credits, chat, KB, invoices, estimates) — a second member added to the table reads the org's data immediately. The hard multi-tenancy work is already done.
- **`switchActiveCompany()`** ([lib/actions/active-company.ts](lib/actions/active-company.ts)) already verifies membership through `company_members` and sets the `active_company_id` cookie.
- **`billing_config`** super-admin store ([lib/billing/billing-config.ts](lib/billing/billing-config.ts)) — the typed, null-safe, 30s-TTL `getBillingConfig()` reader over the `platform_integrations.billing_config` metadata row, with a `tiers` map and `DEFAULT_BILLING_CONFIG`. **This is the exact mechanism the seat price plugs into** — same pattern as `estimateFeePct` / `monthlyCreditGrant` / `markup`.
- **Resend email** ([lib/email/](lib/email/)) — already configured; invites add one template.

## Locked principles (non-negotiable)

### 1. The org unit is `company`; seats live in `company_members`
No new "organization" entity. A seat = one row in `company_members`. Everything the org owns (clients, price book, estimates, credits, Connect payout) is already company-scoped and shared by all members for free via the existing RLS.

### 2. Roles widen to a small, explicit matrix
Widen the `company_members.role` CHECK from `('owner')` to **`('owner','admin','member')`** (idempotent migration: DROP/ADD the named CHECK). Locked role matrix:

| Capability | owner | admin | member |
|---|---|---|---|
| Use the product (estimates, capture, clients, price book, chat) | ✅ | ✅ | ✅ |
| Invite / remove members, change roles | ✅ | ✅ | ❌ |
| Manage subscription, credits, seat billing, Stripe Connect | ✅ | ❌ | ❌ |
| Delete the company / transfer ownership | ✅ | ❌ | ❌ |

- Exactly **one `owner`** per company (the billing-responsible principal). `admin` is the delegated team manager. `member` is a worker seat. `viewer` (read-only) is explicitly **deferred to v2** — keep the matrix small.
- Role checks are server-side authority (server actions + RLS), never trusted from the client.

### 3. Per-seat price is configurable in the super-admin — ZERO hardcoded billing numbers
Extend `BillingConfig` ([lib/billing/billing-config.ts](lib/billing/billing-config.ts)) — mirroring how `estimateFeePct` and the `tiers` map already work:
- `seatPriceCents: number` — monthly price of one billable seat (global default; the super-admin sets it). Default in `DEFAULT_BILLING_CONFIG` is a **null-safe placeholder, CALIBRATE BEFORE CHARGING** (same discipline as the existing `markup` / `estimateFeePct` placeholders).
- `tiers[tier].includedSeats: number` — seats bundled in the tier before per-seat billing kicks in (e.g. the owner seat is included). Per-tier, in the same `tiers` map the panel already edits.
- **Billable seats = `max(0, activeMembers − tiers[tier].includedSeats)`**. The monthly seat charge = `billableSeats × billing_config.seatPriceCents`.
- The number `1%`, the markup `4.5`, and now the seat price all live in **one** place (`billing_config`), read at runtime, changeable in the panel **without a deploy** (the 30s TTL flush already exists). No seat price, no included-seat count, and no Stripe Price ID may be hardcoded in application code.
- Consistent with the standing platform principle: **the super-admin panel controls every billing knob and is ONLY for Xtimator operators** — tenants never see it (see [[SEED-035-credit-based-subscription-billing]]).

### 4. Seat billing rides the existing Stripe subscription — driven by `billing_config`
- Seats are billed on the org's **existing platform subscription** (`companies.stripe_subscription_id`), as a **quantity-based subscription item** whose `unit_amount` comes from `billing_config.seatPriceCents` and whose `quantity` = billable seats. No second invoice, no separate checkout.
- The subscription seat quantity **re-syncs whenever membership changes** (member accepted, member removed, role change that flips billable status) — a single `syncSeatBilling(companyId)` server function reads the live member count + `billing_config` and updates the Stripe subscription item (Stripe handles proration by default).
- Gated by the master `billing_config.enforcementEnabled` switch (CREDIT-05 discipline): until calibration flips it on, seat changes **record** the quantity but do not yet charge — calibrate before charging. Existing single-owner orgs are inside `includedSeats` → **zero charge, zero behavior change** (retrocompat).

### 5. Invite flow with email + safe onboarding
- New `company_invites` table: `id`, `company_id`, `email`, `role`, `token` (single-use, expiring), `status` (`pending`/`accepted`/`revoked`/`expired`), `invited_by`, `expires_at`, `created_at`. RLS: owner/admin of the company manage its invites; the accept path is token-based (service role).
- Invite email via Resend with a single-use accept link.
- **Accept onboarding**: if the invited email already has an auth user → add the `company_members` row and switch active company. If not → a signup-then-join flow that **skips company creation** (the invited user joins the existing company instead of creating their own — the current onboarding always creates a company; this path must branch).
- A pending invite does **not** consume a billable seat; the seat is counted on **acceptance** (principle 3's `activeMembers`).

### 6. Member-management UI (owner/admin only)
A `Settings → Team` surface: list members (name/email/role), pending invites, an "Invite" action (email + role), remove member, change role. Mobile-safe (the app runs on phones). The org's **current seat count + the configured per-seat price + projected monthly seat cost** are shown to the owner (read from `billing_config`, never hardcoded), so the billing is transparent — same transparency principle as the 1%-fee disclosure ([[SEED-036-estimate-payment-platform-fee]]).

## Decisions to lock before planning

1. **Role set** — `owner/admin/member` now, `viewer` deferred? (Recommended: yes, keep it to three.)
2. **Seat billing mechanism** — quantity-based Stripe subscription item driven by `billing_config.seatPriceCents` (recommended), vs. a separate seat invoice. Lock the Stripe shape (a dynamically-priced subscription item vs. a pre-created Price): recommend `unit_amount` driven from `billing_config` so the price stays panel-configurable with no hardcoded Price ID.
3. **Included seats per tier** — values in `billing_config.tiers[tier].includedSeats` (panel-set). Lock the defaults' intent (e.g. owner seat always included) but the numbers are calibration placeholders, not constants.
4. **Billable-on-invite vs billable-on-accept** — recommend on **accept** (a pending invite is free).
5. **Mid-cycle proration** — rely on Stripe default proration when the seat quantity changes? (Recommended: yes.)
6. **Remove-member semantics** — revoke access immediately + decrement seat quantity on the next sync; the removed user keeps their auth account but loses the membership row. Confirm.
7. **Ownership transfer** — in scope for v1, or deferred? (Recommended: a minimal "transfer ownership" owner-only action; full audit deferred.)

## Architecture sketch

1. **Migration** (idempotent, authored-only — CI→GHCR→Coolify): widen `company_members.role` CHECK to `('owner','admin','member')`; create `company_invites` + its RLS. No change to the existing `companies` billing columns.
2. **`BillingConfig` extension**: add `seatPriceCents` + `tiers[tier].includedSeats` to the type + `DEFAULT_BILLING_CONFIG` (calibration placeholders) — the deep-merge reader already tolerates rows written before the field existed (Pitfall 6 in `getBillingConfig`).
3. **Seat-billing service** `lib/billing/seat-billing.ts`: pure `computeBillableSeats(activeMembers, includedSeats)` + `computeSeatChargeCents(billableSeats, seatPriceCents)` (unit-testable, no I/O) + a server `syncSeatBilling(companyId)` that reads members + `billing_config` and updates the Stripe subscription item (gated by `enforcementEnabled`).
4. **Invites**: server actions `inviteMember`, `acceptInvite`, `revokeInvite`, `removeMember`, `changeMemberRole`; Resend template; the accept-onboarding branch.
5. **Authorization**: a single `requireCompanyRole(companyId, roles)` server helper used by every team/billing action — the role gate in one place, never client-trusted.
6. **Super-admin panel**: add the seat price + per-tier included-seats fields to the `billing_config` editor (the panel that already edits markup / estimateFeePct / tiers).
7. **UI**: `Settings → Team` (members list, invite, roles, remove) + the seat-cost summary read from `billing_config`.

## Scope fence

- **In:** roles (`owner/admin/member`), invite + accept + revoke + remove + change-role, invited-user onboarding branch, member-management UI, configurable per-seat price + included-seats in `billing_config`/super-admin, Stripe subscription seat-quantity sync (gated), retrocompat for existing single-owner orgs.
- **Out (v2):** `viewer`/granular per-resource permissions, SSO/SCIM, per-action audit trail beyond the existing admin audit log, multi-org billing consolidation, seat usage analytics dashboards.

## Breadcrumbs

- [supabase/migrations/20260525000001_phase79_company_members.sql](supabase/migrations/20260525000001_phase79_company_members.sql) — the `company_members` table + the `role` CHECK to widen + the RLS pattern to mirror for `company_invites`
- [lib/actions/active-company.ts](lib/actions/active-company.ts) — `switchActiveCompany()` membership check (reuse for accept-invite + member context)
- [lib/actions/company.ts](lib/actions/company.ts) — `createOrUpdateCompany` (mode='add'); the onboarding that always creates a company — the accept-invite path must branch to JOIN instead of CREATE
- [lib/billing/billing-config.ts](lib/billing/billing-config.ts) — `BillingConfig` type + `DEFAULT_BILLING_CONFIG` + `getBillingConfig()`; add `seatPriceCents` + `tiers[tier].includedSeats` here
- [lib/billing/estimate-fee.ts](lib/billing/estimate-fee.ts) — the pure-fee-math precedent (pass config in; keep arithmetic in one place); mirror for seat-charge math
- [lib/entitlements.ts](lib/entitlements.ts) — tier definitions; the static mirror pattern (`monthlyCreditGrant`) for any seat-related static field
- `app/(app)/settings/` — where `Settings → Team` lives; mobile-safe form idiom
- [lib/email/](lib/email/) — Resend templates; add the invite email
- `platform_integrations` `billing_config` row + the super-admin billing panel — where the seat price + included-seats fields are added
- `companies.stripe_subscription_id` — the subscription the seat item attaches to

## Related Seeds

- **[[SEED-013-subscription-tiers-entitlements]]** — the tier model seats bill against
- **[[SEED-035-credit-based-subscription-billing]]** — the `billing_config` / super-admin mechanism + "calibrate before charging" + "super-admin is operators-only" discipline this seed reuses verbatim
- **[[SEED-036-estimate-payment-platform-fee]]** — the sibling revenue lever (1% transactional); transparency-of-billing principle reused for the seat-cost disclosure
- **[[SEED-020-stripe-connect-customer-payments]]** — Connect payout is company-scoped, so all seats share it

## Notes

**Why seats are cheap to build now:** the costly part of multi-user — making every query authorize through a membership table instead of a single `owner_id` — was already paid down in Phase 79+ (all RLS uses `company_members`). What remains is the *product* surface (invite, roles, UI) plus *billing* (a configurable per-seat price synced to the Stripe subscription). Nothing in the data model needs to be rebuilt.

**Why nothing is hardcoded:** the seat price, the included-seat counts, and the enforcement switch all live in `billing_config`, read at runtime through `getBillingConfig()`, editable in the super-admin panel, applied without a deploy (30s TTL flush). This matches the standing platform rule that **every billing knob is operator-configured, and the panel is Xtimator-operators-only** — tenants never touch it.
