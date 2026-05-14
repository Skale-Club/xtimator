# Requirements: v3.0 - Monetization

## v3.0 Requirements (SEED-013)

### Tier & Schema (TIER)

- [x] **TIER-01**: `companies` table gains columns: `tier` (TEXT NOT NULL DEFAULT 'free'), `tier_trial_ends_at` (TIMESTAMPTZ), `stripe_customer_id` (TEXT), `stripe_subscription_id` (TEXT), `tier_renews_at` (TIMESTAMPTZ), `tier_cancelled_at` (TIMESTAMPTZ)
- [x] **TIER-02**: `usage_events` table created: `(id UUID PK, company_id UUID FK, event_type TEXT, units NUMERIC, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW())` with index on `(company_id, created_at DESC)`
- [x] **TIER-03**: `lib/entitlements.ts` exports tier definitions (free / trial / pro / business) with per-tier limits: `maxEstimatesPerMonth`, `maxEstimatesPerDay`, `maxPhotosPerEstimate`, `maxAudioMinutesPerEstimate`, `whatsappEnabled`, `pdfEnabled`, `priceBookEnabled`
- [x] **TIER-04**: New companies start with `tier='free'` and `tier_trial_ends_at = now() + interval '14 days'`

### Usage Enforcement (QUOTA)

- [x] **QUOTA-01**: `checkQuota(companyId, quotaType)` returns `{ allowed: boolean, remaining: number }` — called BEFORE any AI operation; returns `allowed: false` when monthly or daily limit exceeded
- [x] **QUOTA-02**: `recordUsage(companyId, eventType, units, idempotencyKey)` persists to `usage_events` after successful AI call; deduplicates by idempotency key to handle retries
- [x] **QUOTA-03**: `generate-estimate` route enforces estimate quota (checkQuota before → recordUsage after success)
- [x] **QUOTA-04**: `analyze-photos` route enforces photo quota
- [x] **QUOTA-05**: WhatsApp inbound handler checks `whatsappEnabled` entitlement BEFORE first audio/image download from Meta
- [x] **QUOTA-06**: Quota-exceeded responses return HTTP 402 with `{ error: 'plan_limit_reached', upgradeUrl: '/settings/billing' }`

### Stripe Integration (STRIPE)

- [x] **STRIPE-01**: `POST /api/billing/create-checkout-session` creates a Stripe Checkout session for the selected plan and returns redirect URL
- [x] **STRIPE-02**: `POST /api/webhooks/stripe` handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` — updates `companies` tier columns accordingly
- [x] **STRIPE-03**: `POST /api/billing/create-portal-session` creates a Stripe Customer Portal session for subscription management
- [x] **STRIPE-04**: Stripe webhook handler is idempotent — duplicate events do not double-update tier state

### Billing UI (BILLING)

- [x] **BILLING-01**: `/settings/billing` page shows current plan card (tier name, renewal date or trial end), usage meters (estimates used/limit, photos used/limit), and upgrade CTA
- [x] **BILLING-02**: Upgrade button initiates Stripe Checkout flow for Pro or Business plan
- [x] **BILLING-03**: Active paid subscriber sees "Manage Subscription" button that opens Stripe Customer Portal
- [x] **BILLING-04**: Persistent banner shown when trial has < 3 days remaining, linking to `/settings/billing`
- [x] **BILLING-05**: In-app toast/modal with Upgrade CTA when a 402 response is returned from any AI route

### Trial Automation (TRIAL)

- [x] **TRIAL-01**: Cron job (pg_cron or Vercel cron) downgrades companies with `tier='free'` and expired `tier_trial_ends_at` — sets `tier='free'`, clears trial columns
- [x] **TRIAL-02**: Warning email sent at trial T-3 days and T-0 (day of expiry) via Resend

### Admin Tooling (ADMIN-BILLING)

- [ ] **ADMIN-BILLING-01**: Admin can force a company's tier from the admin panel (override to any tier, optionally set expiry)
- [ ] **ADMIN-BILLING-02**: Admin can grant bonus quota credits (extra estimates or extra trial days) to a specific company
- [ ] **ADMIN-BILLING-03**: Admin panel shows basic MRR metric (count of active Pro + Business subscribers × plan price)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TIER-01 | Phase 55 | Complete |
| TIER-02 | Phase 55 | Complete |
| TIER-03 | Phase 55 | Complete |
| TIER-04 | Phase 55 | Complete |
| QUOTA-01 | Phase 56 | Complete |
| QUOTA-02 | Phase 56 | Complete |
| QUOTA-03 | Phase 57 | Complete |
| QUOTA-04 | Phase 57 | Complete |
| QUOTA-05 | Phase 57 | Complete |
| QUOTA-06 | Phase 57 | Complete |
| STRIPE-01 | Phase 58 | Complete |
| STRIPE-02 | Phase 58 | Complete |
| STRIPE-03 | Phase 58 | Complete |
| STRIPE-04 | Phase 58 | Complete |
| BILLING-01 | Phase 59 | Complete |
| BILLING-02 | Phase 59 | Complete |
| BILLING-03 | Phase 59 | Complete |
| BILLING-04 | Phase 59 | Complete |
| BILLING-05 | Phase 59 | Complete |
| TRIAL-01 | Phase 60 | Complete |
| TRIAL-02 | Phase 60 | Complete |
| ADMIN-BILLING-01 | Phase 60 | Pending |
| ADMIN-BILLING-02 | Phase 60 | Pending |
| ADMIN-BILLING-03 | Phase 60 | Pending |

## Key Decisions (locked)

- **Pricing model:** per-company flat (not per-seat) — matches current 1:1 user→company model
- **Quota pattern:** `checkQuota()` before AI call → `recordUsage()` after success only (never charge for failed calls)
- **Idempotency:** `recordUsage()` deduplicates by idempotency key (WhatsApp: `message_id`; web: `request_id`)
- **WhatsApp gate position:** Check `whatsappEnabled` entitlement BEFORE first Meta download (not after Whisper)
- **Grace window:** 3-7 days before downgrade on payment failure (Stripe handles this via dunning)
- **Trial:** 14 days with Pro-equivalent features; auto-downgrades to free on expiry
- **Existing estimates after downgrade:** Read-only forever (good UX — never break sent estimate links)
- **Stripe vs alternatives:** Stripe (US-first SaaS, most flexible)
- **Admin granularity:** Both coarse (force tier) and fine (bonus credits)
- **Redis (SEED-012):** Already available from Phase 47 — use for hourly rate limiting; tier limits handled via `usage_events`

## Future Requirements (deferred)

- BRL pricing / multi-currency — deferred until LatAm expansion
- Stripe Tax (SaaS sales tax) — deferred until MRR justifies activation
- WhatsApp entitlement gate per-feature (custom domain, white-label) — v3.1
- Per-seat billing — out of scope (requires company_members table)

## Out of Scope (v3.0)

- Client portal login
- Dashboard analytics/charts beyond billing usage meters
- Offline PWA mode
- QuickBooks integration
