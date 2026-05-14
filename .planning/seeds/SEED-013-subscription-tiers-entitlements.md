---
id: SEED-013
status: harvested
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (post-milestone analysis)
harvested: 2026-05-14
harvested_in: v3.0 Monetization (Phases 55-60)
trigger_when: When introducing paid plans, billing integration (Stripe), trial flows, or any milestone focused on monetization
scope: Large
---

# SEED-013: Subscription Tiers and Entitlements

## Why This Matters

Xtimator is ready for use, but **everyone has unlimited access**. There's no notion of plan, trial, or limit. To become a sustainable SaaS, it needs:

1. **Free tier** — to attract new users, limited enough to push real users to upgrade
2. **Paid tier(s)** — monthly recurring revenue that covers Anthropic/OpenAI/Whisper costs
3. **Trial** — first 14 days with paid plan features, then downgrades to free
4. **Real enforcement** — declaring limits isn't enough, you have to block when reached

Today each generated estimate costs:
- Whisper transcription: ~$0.006/min of audio
- Claude Vision (photo): ~$0.01-0.03/photo
- Claude Sonnet (estimate): ~$0.05-0.20/estimate

Without limits, a casual user costs $5/month — a power user costs $50/month. With no paid plan, that turns into pizza money lost.

## The Structure: Inspired by Chatbot

The legacy project (`/lib/ai/entitlements.ts`) has a clean pattern:

```typescript
type Entitlements = {
  maxEstimatesPerMonth: number
  maxEstimatesPerDay: number
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  customDomainEnabled: boolean
  priceBookEnabled: boolean
  pdfEnabled: boolean
  whitelabelEnabled: boolean
  prioritySupport: boolean
}

export const tiers: Record<TierName, Entitlements> = {
  trial: {
    maxEstimatesPerMonth: Infinity,
    maxEstimatesPerDay: 20,
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    customDomainEnabled: false,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  free: {
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: false,         // gate the premium channel
    customDomainEnabled: false,
    priceBookEnabled: false,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    customDomainEnabled: false,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: false,
    prioritySupport: false,
  },
  business: {
    maxEstimatesPerMonth: Infinity,
    maxEstimatesPerDay: 100,
    maxPhotosPerEstimate: 50,
    maxAudioMinutesPerEstimate: 30,
    whatsappEnabled: true,
    customDomainEnabled: true,
    priceBookEnabled: true,
    pdfEnabled: true,
    whitelabelEnabled: true,
    prioritySupport: true,
  },
}
```

**Tentative pricing:** Free $0, Pro $29/mo, Business $99/mo. Refine based on market research.

## Database Schema

```sql
-- Company plan
ALTER TABLE companies ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE companies ADD COLUMN tier_trial_ends_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN tier_renews_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN tier_cancelled_at TIMESTAMPTZ;

-- Usage tracking (rolling, not overwriting)
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'
  units NUMERIC,             -- e.g., audio minutes, photo count
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX usage_events_company_created ON usage_events(company_id, created_at DESC);
```

`usage_events` enables analytics (usage chart in /settings/billing) without heavy computation — can be aggregated on-demand or in a materialized view.

## Enforcement API

```typescript
// lib/entitlements.ts
import { rateLimit } from '@/lib/ratelimit'

export async function checkEntitlement(
  companyId: string,
  feature: keyof Entitlements
): Promise<{ allowed: boolean; reason?: string; upgradeUrl?: string }>

export async function consumeQuota(
  companyId: string,
  quotaType: 'estimate' | 'photo_batch' | 'audio_minutes',
  units = 1
): Promise<{ allowed: boolean; remaining: number }>
```

Typical usage:
```typescript
// In generate-estimate/route.ts
const { allowed, remaining } = await consumeQuota(companyId, 'estimate')
if (!allowed) {
  return NextResponse.json({
    error: 'plan_limit_reached',
    upgradeUrl: '/settings/billing'
  }, { status: 402 })  // 402 Payment Required
}
```

## Stripe Integration

```
checkout flow:
  /settings/billing → /api/billing/create-checkout-session → Stripe Checkout
                                                          ↓
  Stripe webhook  ← /api/webhooks/stripe ← checkout.session.completed
                                       ← invoice.paid
                                       ← invoice.payment_failed
                                       ← customer.subscription.deleted
```

Webhook handler updates `companies.tier`, `stripe_subscription_id`, `tier_renews_at`.

## UI Surface

```
/settings/billing
├── Current plan card (Free / Pro / Business)
├── Usage this month (graph from usage_events)
│   ├── Estimates: 7 / 10
│   ├── Photos: 24 / 30
│   └── Audio: 4.2min / 6min
├── [Upgrade Plan] button → Stripe Checkout
└── [Manage Subscription] button → Stripe Customer Portal
```

In-app gating:
- Persistent banner when trial < 3 days remaining
- "You've reached your monthly limit" modal with Upgrade CTA
- Blocked features (whatsapp, custom domain) show "Pro" badge + tooltip

## Scope Estimate

**Large** — own milestone (v3.0 Monetization), 5-7 phases:

1. **Schema + tier definitions** — migrations, `lib/entitlements.ts`, `tiers` config, RLS updates
2. **Usage tracking** — `usage_events` table, hooks in all AI-consuming endpoints, `recordUsage()` + `getUsage()` helpers
3. **Enforcement layer** — `checkEntitlement()`, `consumeQuota()`, apply to all endpoints that need it
4. **Stripe integration** — checkout sessions, customer portal, webhook handler with idempotency
5. **Settings UI** — `/settings/billing` page, usage graphs, upgrade flow
6. **Trial automation** — cron job for automatic trial → free downgrade on expiry; warning emails
7. **Admin tooling** — admin can force a tier, grant extra credits, view MRR

**Dependencies:**
- SEED-012 (Rate limiting infrastructure) — prerequisite, hour/day enforcement uses the same Redis
- SEED-014 (Error handling) — desirable, returns typed errors like `tier_limit_reached`

## Breadcrumbs

- `lib/queries/company.ts` — add `getCompanyTier()`, `updateCompanyTier()`
- `app/api/generate-estimate/route.ts` — most expensive endpoint; first to get `consumeQuota('estimate')`
- `app/api/analyze-photos/route.ts` — `consumeQuota('photo_batch', photoCount)`
- `lib/whatsapp/handler.ts` — block processing if `whatsappEnabled === false`
- `lib/actions/custom-domain.ts` — block if `customDomainEnabled === false`
- `components/settings/` — card/form pattern already established; `billing-card.tsx` follows the same
- `supabase/migrations/` — new migration for columns + `usage_events`
- Reference impl: `C:\Users\Vanildo\Dev\chatbot\lib\ai\entitlements.ts`
- Stripe docs: https://docs.stripe.com/billing/subscriptions/overview

## Open Questions

Decisions that need to be made during `/gsd:discuss-milestone` when this seed is activated. The seed proposes a direction, but these choices affect schema, UX, and architecture — they should not be made implicitly during execute-phase.

### Critical — decide before `plan-milestone`

1. **Pricing model: per-company flat, per-seat, or hybrid?**
   The seed assumes per-company (consistent with `companies.user_id` 1:1 today). But if Xtimator wants to grow into agencies/franchises, **per-seat** is the B2B standard — requires a `company_members` table that **doesn't exist today**. This decision affects schema, Stripe products, and billing UI.

2. **Quota consumption: check→execute→record (not consume→execute)**
   The seed's example (`consumeQuota()` before execution) charges the user even if Whisper/Vision fails. The correct pattern is `checkQuota()` first (throws if denied) + `recordUsage()` after (only on success). The API should reflect this pattern.

3. **Idempotency of `recordUsage()`**
   WhatsApp webhook is retried by Meta. Without an idempotency key, the same message counts 2-3x against the quota. Use `message_id` (already in `whatsapp_processed_messages`) as natural dedup. For the web app, generate a `request_id` per estimate.

4. **Lifecycle of old estimates after downgrade**
   Pro user generates 100 estimates → cancels → becomes free (10/month). Do the 100 old `/estimate/{token}` links still work? Options:
   - **Keep always active** (good UX, forgives abuse)
   - **Break after N days** (forces retention, terrible UX)
   - **Read-only without editing** (compromise)

5. **WhatsApp gating: where in the pipeline?**
   `lib/whatsapp/handler.ts` downloads audio (Meta) + Whisper + Vision **before** any tier check. On free plan with `whatsappEnabled=false`, that means spending $$ to reject at the end. The check has to be **before** the first download — possibly in the webhook route handler, not in the handler.

### Important — decide during `plan-milestone`

6. **Storage costs in tier limits**
   Photos go to Supabase Storage and stay there indefinitely. "50 photos/estimate × 100 estimates/month × 12 months" = 60k retained photos. Add `maxStorageGB` or a retention policy (free: 30 days, pro: 1 year, business: forever).

7. **Stripe Tax for US compliance**
   Several US states require SaaS sales tax collection. Stripe Tax solves it but requires activation and nexus configuration. Decide: activate from day one or only when MRR justifies?

8. **Multi-currency: USD-only or USD + BRL?**
   Xtimator supports PT-BR (SEED-001) — implies intent to serve the Brazilian market. Stripe handles multi-currency, but you need to decide BRL pricing (R$ 79/mo = ~$15? Or R$ 149/mo = ~$29?).

9. **Admin tooling: force tier vs. grant credits**
   Support will need to handle cases like "trial expired, legitimate customer, extend 7 more days". Granularity:
   - **Coarse**: admin forces tier (`tier='pro'` for X days)
   - **Fine**: extra credits (`bonus_estimates: 20`)
   - **Hybrid**: both

10. **Grandfathering policy**
    "Free Pro legacy for everyone" is expensive if there are power users. Alternatives:
    - **Free + 30 days Pro trial** (forces conscious conversion)
    - **Pro 50% off forever** (rewards loyalty without losing margin)
    - **Pro free up to X estimates/month, then mandatory upgrade**

### Minor — resolve during execute-phase

11. **Status code: 402 vs 403 + code body**
    402 Payment Required is "correct" but rare. Many clients (including SDKs) handle 403 better. Low-level decision, but affects API DX.

12. **JSON serialization of "unlimited"**
    `Infinity` doesn't serialize to JSON. Use `null` (semantic: "no limit") or a large number (`999999`)? Affects TypeScript type and frontend checks.

## Notes

- **When to trigger:** when the product has >50 active users OR when someone asks to pay. Before that, unlimited free is better for growth.
- **14-day trial** is the industry standard — long enough for users to see value, short enough not to forget.
- **Stripe vs Lemon Squeezy vs Paddle**: Stripe is more flexible, Lemon/Paddle are MoR (handle tax). For US-first SaaS, Stripe is the obvious choice.
- **Anti-abuse**: even on the free plan, per-IP/hour rate limiting (SEED-012) protects against abuse — tier limits are "fair use", rate limit is "abuse prevention".
- **Don't couple tier check with auth check** — separation of concerns: auth says "who you are", tier says "what you can do".
- **GraceWindow**: when subscription payment fails, give 3-7 days before downgrade — avoids rage-quitting users with temporarily blocked cards.
