---
id: SEED-054
status: partially-harvested
planted: 2026-08-05
planted_during: post-v4.23
trigger_when: User requested feature — foundation executed immediately
scope: Large (foundation shipped; onboarding routes + payout runner + UI remain)
---

# SEED-054: Affiliate Program — Stripe Connect Express + Transfers

## Why This Matters

Xtimator's growth loop today is entirely paid/organic. An affiliate program lets
creators, agencies, and existing owners earn a recurring share of the
subscription revenue they bring in — the cheapest CAC channel a self-serve SaaS
has. The blocker has always been payouts: sending money to hundreds of
individuals means KYC, tax forms, and bank details, none of which we want to
custody.

Stripe Connect **Express** removes that entirely: Stripe collects identity and
bank details, handles KYC/1099s, and we simply issue a `Transfer` from the
platform balance to the affiliate's connected account when a commission becomes
payable.

## Critical Constraint: this is a DIFFERENT Connect usage from Phase 70

Phase 70 ([[SEED-020-stripe-connect-customer-payments]]) already made Xtimator a
Connect platform, using **Standard OAuth** so a *tenant company* can receive its
own customers' estimate payments. That state lives on
`companies.stripe_account_id` / `companies.stripe_connect_status`.

The affiliate program is a **second, independent** Connect surface:

| | Phase 70 (tenant payments) | SEED-054 (affiliates) |
|---|---|---|
| Account type | Standard (OAuth) | **Express** (account links) |
| Who owns the account | the tenant company | the affiliate person |
| Money direction | customer → tenant (we take 1% app fee) | platform → affiliate (Transfer) |
| State column | `companies.stripe_account_id` | `affiliates.stripe_account_id` |

**They must never share a column or a status enum.** A company can be a tenant
with Standard Connect *and* its owner can separately be an affiliate with an
Express account; conflating the two would corrupt both.

Both live under the same platform account, so the existing Connect webhook
endpoint (`STRIPE_CONNECT_WEBHOOK_SECRET`) will receive `account.updated` for
Express accounts too — the resolver must route by which table owns the
`acct_xxx`, not assume `companies`.

## Architecture

### Money flow

```
Company signs up via https://xtimator.com/?ref=CODE
  → proxy stores httpOnly `xt_ref` cookie (90d)
  → first-company signup reads the cookie → affiliate_referrals row
     (one company ⇒ at most ONE affiliate, first attribution wins)
     commission_window_ends_at = now + billing_config.affiliate.commissionDurationMonths

Company pays a subscription invoice
  → Stripe `invoice.paid` webhook (existing handler)
  → accrueCommissionForInvoice()
     - referral active AND now <= commission_window_ends_at ?
     - commission = round(invoice.amount_paid × pct)
     - affiliate_commissions row, status 'pending',
       payable_at = now + holdDays  (refund/chargeback safety)
     - idempotency_key = `commission:{invoice.id}` (UNIQUE)

Payout runner (NOT in this foundation)
  → commissions where status='pending' AND payable_at <= now → 'payable'
  → sum per affiliate ≥ minPayoutCents AND affiliate payouts_enabled
  → stripe.transfers.create({ destination: acct_xxx }) with an idempotency key
  → affiliate_payouts row; commissions → 'paid', payout_id set
```

### Why accrue-then-hold rather than transfer-on-invoice

A subscription invoice can be refunded or disputed days later. Transferring
immediately means clawing money back from an individual's bank account, which
Stripe makes possible but which is operationally miserable. Accruing to a ledger
with a `payable_at` hold window keeps every reversal a pure DB state change
(`status='reversed'`) until the money actually leaves.

### Runtime config (no hardcoded numbers — BILLCFG-03)

Everything tunable lives under `billing_config.affiliate`, editable in the
super-admin panel with no deploy:

- `enabled` — master switch, **default false** (mirrors `autoTopupEnabled`)
- `commissionPct` — 0.20 = 20%
- `commissionDurationMonths` — 12; the recurring window per referred company
- `attributionWindowDays` — 90; ref-cookie lifetime
- `holdDays` — 30; accrual → payable
- `minPayoutCents` — 5000; transfer threshold

Per-affiliate `commission_pct_override` supports negotiated rates without
touching the global default.

## What SHIPPED in this foundation

- `supabase/migrations/20260805000001_affiliate_foundation.sql` — 4 tables
  (`affiliates`, `affiliate_referrals`, `affiliate_commissions`,
  `affiliate_payouts`) with RLS: affiliates read their OWN rows only; every
  write is service-role.
- `lib/affiliates/code.ts` — referral-code generation/normalization (pure).
- `lib/affiliates/commission.ts` — commission math, window and hold arithmetic (pure).
- `lib/affiliates/attribution.ts` — ref cookie contract (pure).
- `lib/affiliates/attribution-server.ts` — idempotent referral attribution.
- `lib/affiliates/accrual.ts` — never-throw accrual from `invoice.paid`.
- `billing_config.affiliate` block + zod schema.
- `proxy.ts` captures `?ref=` into the cookie.
- `lib/actions/company.ts` attributes on FIRST-company signup only (anti-farming,
  same rule as the signup credit grant).
- `app/api/webhooks/stripe/route.ts` accrues on `invoice.paid`.

## What REMAINS (next slices)

1. **Affiliate Express onboarding** — `POST /api/affiliates/onboard` creating an
   Express account + account link, return/refresh routes, and an `account.updated`
   Connect-webhook arm that syncs `payouts_enabled`/`details_submitted` and
   routes by table (see the resolver caveat above).
2. **Payout runner** — cron promoting `pending`→`payable`, batching per affiliate,
   `stripe.transfers.create` with idempotency, `affiliate_payouts` rows.
3. **Reversal handling** — `charge.refunded` / `charge.dispute.created` →
   `status='reversed'` for unpaid commissions, negative-balance carry for paid ones.
4. **UI** — `/affiliate` dashboard (link, clicks, referrals, balance, payout
   history) + `/admin/affiliates` (approve, override rate, force payout).
5. **Admin panel fields** for the `billing_config.affiliate` block.
6. **Tax/compliance review** — Stripe Express handles 1099-K/NEC for US payees;
   confirm the platform's obligations before enabling in production.
