# Phase 58: Stripe Integration - Research

**Researched:** 2026-05-13
**Domain:** Stripe Billing API, Next.js App Router webhook handlers, idempotent DB updates
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRIPE-01 | `POST /api/billing/create-checkout-session` — creates Stripe Checkout session, returns redirect URL | Checkout Session creation pattern documented; price ID storage strategy decided |
| STRIPE-02 | `POST /api/webhooks/stripe` — handles checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted | Webhook signature verification + raw body pattern documented; event→DB update map defined |
| STRIPE-03 | `POST /api/billing/create-portal-session` — creates Stripe Customer Portal session | Portal session creation pattern documented |
| STRIPE-04 | Webhook handler is idempotent — duplicate events do not double-update tier state | Lightweight idempotency strategy using Stripe event ID documented |
</phase_requirements>

---

## Summary

Phase 58 adds the Stripe billing backbone: three API route handlers (checkout session, webhook, portal session) and the DB update logic that promotes companies from free/trial to paid tiers. No UI is built here — the billing page (BILLING-01..05) ships in Phase 59.

The project already has the tier columns on `companies` (`stripe_customer_id`, `stripe_subscription_id`, `tier`, `tier_renews_at`, `tier_cancelled_at` — added in Phase 55). The enforcement layer that reads those columns is already live (Phase 57). Phase 58 is the write path that populates them via Stripe events.

The `stripe` npm package is NOT in `package.json` and must be installed. `proxy.ts` already covers `/api/webhooks/stripe` via the generic `/api/webhooks/` early-return — no proxy change needed. Stripe keys will follow the existing `getIntegrationKey()` pattern, requiring `'stripe'` to be added to `IntegrationProvider`.

**Primary recommendation:** Install `stripe@22.x` (latest stable), add `'stripe'` to `IntegrationProvider` + `integrationKeySchema`, implement three route handlers following the WhatsApp webhook pattern for raw body handling, use Stripe event ID in a `processed_stripe_events` table for idempotency.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | 22.1.1 (latest) | Official Stripe Node.js SDK — checkout sessions, webhooks, portal | Only official SDK; server-side only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| server-only | 0.0.1 (already installed) | Marks Stripe client module as server-only | Prevents key leakage to browser bundle |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| stripe SDK | Raw fetch to Stripe API | SDK handles webhook signature, retry logic, TypeScript types — raw fetch is not worth it |

**Installation:**
```bash
npm install stripe
```

**Version verification:** `npm view stripe version` returns `22.1.1` (verified 2026-05-13). The package is NOT currently in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure
```
app/api/billing/
├── create-checkout-session/
│   └── route.ts          # STRIPE-01
└── create-portal-session/
    └── route.ts          # STRIPE-03

app/api/webhooks/
└── stripe/
    └── route.ts          # STRIPE-02, STRIPE-04

lib/billing/
└── stripe-client.ts      # Stripe SDK singleton (server-only)

supabase/migrations/
└── YYYYMMDD_stripe_processed_events.sql  # idempotency table (STRIPE-04)
```

### Pattern 1: Stripe SDK Initialization (per-request, not module-level)

**What:** The project's established pattern (STATE.md D-05 for Phase 08) is: "All provider SDK clients initialized per-request using `getIntegrationKey()`; no module-level SDK instances that read env at import time."

**When to use:** Always — applies to Stripe the same way it applies to Anthropic, Resend, OpenAI.

```typescript
// lib/billing/stripe-client.ts
import 'server-only'
import Stripe from 'stripe'
import { getIntegrationKey } from '@/lib/platform-config'

export async function getStripeClient(): Promise<Stripe> {
  const key = await getIntegrationKey('stripe')
  if (!key) throw new Error('Stripe secret key not configured')
  return new Stripe(key, { apiVersion: '2025-04-30.basil' })
}
```

This requires adding `'stripe'` to `IntegrationProvider` in `lib/platform-config.ts` and to `integrationKeySchema` in `lib/schemas/admin.ts`.

### Pattern 2: Checkout Session Creation (STRIPE-01)

**What:** Authenticated route handler that creates a Stripe Checkout session and returns the session URL. The caller (billing UI in Phase 59) redirects to that URL.

**When to use:** User clicks "Upgrade to Pro" or "Upgrade to Business" in the billing page.

```typescript
// app/api/billing/create-checkout-session/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { getClaims } from '@/lib/auth'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const claims = await getClaims()
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await request.json() as { plan: 'pro' | 'business' }

  // Fetch company for existing stripe_customer_id
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id, stripe_customer_id')
    .eq('user_id', claims.sub)
    .single()

  const stripe = await getStripeClient()
  const priceId = plan === 'pro'
    ? process.env.STRIPE_PRICE_PRO!
    : process.env.STRIPE_PRICE_BUSINESS!

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer: company?.stripe_customer_id ?? undefined,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?cancelled=1`,
    metadata: { companyId: company?.id ?? '' },
    subscription_data: {
      metadata: { companyId: company?.id ?? '' },
    },
  })

  return NextResponse.json({ url: session.url })
}
```

### Pattern 3: Webhook Signature Verification — Raw Body FIRST (STRIPE-02)

**What:** `stripe.webhooks.constructEvent()` requires the raw request body as a string or Buffer. The existing WhatsApp webhook uses `request.text()` before any parsing — the exact same pattern applies here.

**Critical pitfall:** If you call `request.json()` first, the body stream is consumed and `constructEvent()` will throw. The WhatsApp webhook route documents this explicitly: "request.text() FIRST — get raw body BEFORE any parsing."

```typescript
// app/api/webhooks/stripe/route.ts
import { type NextRequest } from 'next/server'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { requireServiceClient } from '@/lib/supabase/service'

export async function POST(request: NextRequest) {
  // Step 1: raw body MUST come before any parsing (same as WA webhook)
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  const stripe = await getStripeClient()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    return new Response(`Webhook error: ${err}`, { status: 400 })
  }

  // Step 2: idempotency check (STRIPE-04)
  const svc = requireServiceClient()
  const { error: dedupError } = await svc
    .from('processed_stripe_events')
    .insert({ event_id: event.id })

  if (dedupError?.code === '23505') {
    // Already processed — 200 to stop Stripe retrying
    return new Response('Already processed', { status: 200 })
  }

  // Step 3: handle event
  await handleStripeEvent(event, svc)

  return new Response('OK', { status: 200 })
}
```

### Pattern 4: Webhook Event Handlers — DB Update Map (STRIPE-02)

Each Stripe event maps to specific DB column updates on `companies`:

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Set `stripe_customer_id`, `stripe_subscription_id`, `tier` (from metadata), `tier_renews_at`, clear `tier_trial_ends_at` |
| `invoice.paid` | Update `tier_renews_at` to `current_period_end` |
| `invoice.payment_failed` | Do NOT downgrade — Stripe's dunning handles retries; optionally set a flag for the UI |
| `customer.subscription.deleted` | Set `tier='free'`, clear `stripe_subscription_id`, `tier_renews_at`, set `tier_cancelled_at` |

For `checkout.session.completed`, the `companyId` comes from `session.metadata.companyId` (set at checkout creation). For `invoice.*` and `subscription.*` events, the `companyId` must be resolved via `stripe_subscription_id` or `stripe_customer_id` lookup against the `companies` table.

```typescript
async function handleStripeEvent(event: Stripe.Event, svc: SupabaseClient) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const companyId = session.metadata?.companyId
      if (!companyId || session.mode !== 'subscription') break
      const tier = resolveTierFromPriceId(session)
      await svc.from('companies').update({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        tier,
        tier_trial_ends_at: null,
        tier_renews_at: null, // set on first invoice.paid
      }).eq('id', companyId)
      break
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const sub = invoice.subscription
      if (!sub) break
      const stripeInstance = await getStripeClient()
      const subscription = await stripeInstance.subscriptions.retrieve(sub as string)
      await svc.from('companies').update({
        tier_renews_at: new Date(subscription.current_period_end * 1000).toISOString(),
      }).eq('stripe_subscription_id', sub)
      break
    }
    case 'invoice.payment_failed': {
      // Do NOT downgrade — Stripe dunning handles retries
      // Log for observability only
      console.warn('[Stripe] Payment failed:', (event.data.object as Stripe.Invoice).id)
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await svc.from('companies').update({
        tier: 'free',
        stripe_subscription_id: null,
        tier_renews_at: null,
        tier_cancelled_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', subscription.id)
      break
    }
  }
}
```

### Pattern 5: Customer Portal Session (STRIPE-03)

**What:** Requires `stripe_customer_id` to exist. If the company has no Stripe customer ID, return 400 — the portal is only for active/past paid subscribers.

```typescript
// app/api/billing/create-portal-session/route.ts
const session = await stripe.billingPortal.sessions.create({
  customer: company.stripe_customer_id,
  return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
})
return NextResponse.json({ url: session.url })
```

### Pattern 6: Price ID Storage

**Recommendation:** Store price IDs as environment variables (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`). They are infrastructure config, not application logic. This matches the pattern used for `META_WHATSAPP_APP_SECRET`, `STRIPE_WEBHOOK_SECRET`, etc. Do NOT hardcode in source or store in DB — they change between Stripe test mode and live mode.

### Anti-Patterns to Avoid

- **Module-level Stripe init:** `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)` at module top — violates the established per-request pattern (D-05, Phase 08). The key must be fetched via `getIntegrationKey('stripe')`.
- **`request.json()` before `constructEvent`:** Consumes the body stream; `constructEvent` throws with "No signatures found". Always use `request.text()` first.
- **Trusting metadata blindly:** `session.metadata.companyId` could be absent if the session was created without it (e.g., direct Stripe dashboard test). Always check for null before updating DB.
- **Downgrading on `invoice.payment_failed`:** Stripe's dunning (configured in the Stripe dashboard) will retry and eventually emit `customer.subscription.deleted` if all retries fail. Downgrading on first failure creates bad UX for users with temporarily failed cards.
- **Skipping idempotency:** Stripe delivers webhooks at-least-once. Without deduplication, `checkout.session.completed` can set `tier='pro'` twice (harmless) but `customer.subscription.deleted` can clear an already-cleared subscription, causing confusing log noise and potentially covering a re-subscription.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC comparison | `stripe.webhooks.constructEvent()` | Handles timing-safe compare, tolerance window, multiple signatures |
| Subscription state machine | Custom tier lifecycle logic | Stripe subscription webhooks | Stripe handles dunning, retries, grace periods, proration |
| Price/product catalog | DB table for plans | Stripe Products + Prices + env var IDs | Stripe dashboard is source of truth; prices change per environment |
| Idempotency key tracking | Redis TTL-based dedup | Postgres `processed_stripe_events` table with UNIQUE constraint | Same pattern as `whatsapp_processed_messages`; durable, no TTL expiry risk |

**Key insight:** Stripe's subscription lifecycle is complex (dunning, retries, prorations, grace periods). Trust Stripe to emit the right events at the right time; only update `companies` columns in response to those events.

---

## Webhook Proxy Bypass — Already Covered

The existing `proxy.ts` has this at line 25:

```typescript
if (pathname.startsWith('/api/webhooks/')) {
  return NextResponse.next()
}
```

`/api/webhooks/stripe` starts with `/api/webhooks/` — it is already bypassed. **No proxy.ts change is needed.** This is confirmed by reading the file directly.

---

## IntegrationProvider Extension — Required Changes

Three files must be updated to add `'stripe'` as a provider:

1. `lib/platform-config.ts` — `IntegrationProvider` union type
2. `lib/schemas/admin.ts` — `integrationKeySchema` enum and `integrationKeySchema`
3. `app/admin/integrations/actions.ts` — `testIntegrationKey` needs a `'stripe'` case

The `testIntegrationKey` stripe case can verify the key by calling `stripe.accounts.retrieve()` (returns the connected account) or simply `stripe.paymentMethods.list({ limit: 1 })`. The simplest is to instantiate the client and call `stripe.balance.retrieve()` — returns immediately with no cost.

The `integrationKeySchema` in `lib/schemas/admin.ts` currently lists: `['resend', 'anthropic', 'openai', 'gemini', 'meta_whatsapp']`. Add `'stripe'`.

---

## Idempotency Strategy (STRIPE-04)

**Approach:** Dedicated `processed_stripe_events` table with `event_id TEXT PRIMARY KEY`. This is the exact same pattern as `whatsapp_processed_messages` using `message_id TEXT PRIMARY KEY`.

```sql
-- supabase/migrations/YYYYMMDD_stripe_processed_events.sql
CREATE TABLE processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deny all RLS (service-role writes only, same as usage_events)
ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
```

**Why not Redis TTL?** Stripe retries for up to 72 hours. Redis keys with short TTL could expire before the last retry arrives. A Postgres row is permanent and matches the `whatsapp_processed_messages` pattern already established.

**Why not check existing DB state (e.g., `stripe_subscription_id` already set)?** That would work for `checkout.session.completed` but fails for `invoice.paid` (which can legitimately fire multiple times, each updating `tier_renews_at`). The event ID approach handles all event types uniformly.

---

## Price Mapping

The phase scope does not define final Stripe price IDs (those are created in the Stripe dashboard). What the code needs:

- `STRIPE_PRICE_PRO` env var — the Stripe price ID for the Pro plan ($29/mo)
- `STRIPE_PRICE_BUSINESS` env var — the Stripe price ID for the Business plan ($99/mo)
- `STRIPE_WEBHOOK_SECRET` env var — the webhook signing secret from Stripe dashboard
- The Stripe secret key itself — stored in `platform_integrations` via `getIntegrationKey('stripe')`

The tier promoted on `checkout.session.completed` is determined by matching the purchased price ID against the known price IDs from env vars:

```typescript
function resolveTierFromPriceId(session: Stripe.Checkout.Session): string {
  const lineItem = session.line_items?.data?.[0]
  const priceId = lineItem?.price?.id ?? ''
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business'
  return 'pro' // safe fallback — checkout was initiated from our UI
}
```

Note: Stripe does NOT include `line_items` in the webhook event by default — must be fetched via `stripe.checkout.sessions.retrieve(session.id, { expand: ['line_items'] })`. Alternatively, store the plan in `session.metadata` at checkout creation time (simpler and avoids an extra API call):

```typescript
// At checkout creation (STRIPE-01):
metadata: { companyId: company.id, plan }
// At webhook (STRIPE-02):
const tier = session.metadata?.plan === 'business' ? 'business' : 'pro'
```

**Recommendation:** Store `plan` in session metadata — avoids the `line_items` expand call and the env var comparison.

---

## Common Pitfalls

### Pitfall 1: Raw Body Consumed Before Signature Verification
**What goes wrong:** `request.json()` is called anywhere before `stripe.webhooks.constructEvent()`. The body stream is consumed; `constructEvent` throws "No signatures found matching the expected signature for payload".
**Why it happens:** Route handler convenience — `request.json()` is the default pattern for all other routes.
**How to avoid:** Always `const rawBody = await request.text()` as the first line of the webhook POST handler. This is documented in the WhatsApp webhook route with the same warning.
**Warning signs:** `WebhookSignatureVerificationError: No signatures found` in logs.

### Pitfall 2: Module-Level Stripe Client Initialization
**What goes wrong:** `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)` at module top reads env at import time — undefined during Vercel build, breaks the per-request key pattern.
**Why it happens:** Stripe docs show module-level init by default.
**How to avoid:** Use `getStripeClient()` async factory, same as `getAIProvider()` pattern from Phase 22.
**Warning signs:** `Error: No API key provided` during build or in routes that haven't loaded the DB key yet.

### Pitfall 3: Missing `line_items` in `checkout.session.completed`
**What goes wrong:** `session.line_items` is `null` in the webhook event — Stripe does not expand nested objects by default in webhook payloads.
**Why it happens:** Webhook payloads are minimal; `line_items` requires explicit expansion or a separate API call.
**How to avoid:** Store `plan` in `session.metadata` at checkout creation time. Never rely on `line_items` from the webhook object directly.
**Warning signs:** `session.line_items` is null or undefined in the webhook handler.

### Pitfall 4: Downgrading on `invoice.payment_failed`
**What goes wrong:** User with a temporarily declined card gets immediately downgraded, rage-quits.
**Why it happens:** `invoice.payment_failed` looks like a "payment didn't work" signal.
**How to avoid:** Ignore `invoice.payment_failed` for tier changes. Only `customer.subscription.deleted` (emitted by Stripe after all dunning retries exhausted) triggers a downgrade.
**Warning signs:** Users reporting sudden tier loss despite intending to stay subscribed.

### Pitfall 5: Webhook Secret Confusion (Test vs Live)
**What goes wrong:** `STRIPE_WEBHOOK_SECRET` from the Stripe CLI local listener (starts with `whsec_`) differs from the secret for the Stripe dashboard webhook endpoint. Using the wrong one causes all signature verifications to fail.
**Why it happens:** Stripe has separate signing secrets for: CLI listener, test endpoint, live endpoint.
**How to avoid:** Use `stripe listen --forward-to localhost:9633/api/webhooks/stripe` for local dev; set `STRIPE_WEBHOOK_SECRET` to the CLI-provided secret. Production uses the dashboard webhook secret.

### Pitfall 6: `companyId` Missing from Metadata
**What goes wrong:** `session.metadata.companyId` is empty string or missing — `companies` update affects zero rows silently.
**Why it happens:** Company query failed at checkout creation, `company` was null, `companyId` was set to `''`.
**How to avoid:** Return 400 from `create-checkout-session` if company lookup fails. Never create a session without a valid `companyId`.

---

## Code Examples

### Stripe Client Factory
```typescript
// lib/billing/stripe-client.ts
import 'server-only'
import Stripe from 'stripe'
import { getIntegrationKey } from '@/lib/platform-config'

export async function getStripeClient(): Promise<Stripe> {
  const key = await getIntegrationKey('stripe')
  if (!key) throw new Error('[Stripe] Secret key not configured. Add via /admin/integrations.')
  return new Stripe(key, { apiVersion: '2025-04-30.basil' })
}
```

### Webhook Idempotency Table Migration
```sql
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies: deny-all (service role writes only)
```

### testIntegrationKey Stripe Case
```typescript
if (input.provider === 'stripe') {
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' })
  const balance = await stripe.balance.retrieve()
  const available = balance.available[0]
  return {
    ok: true,
    message: `Verified. Available balance: ${available?.currency?.toUpperCase() ?? 'USD'}.`,
  }
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| stripe npm package | All STRIPE-* | Not installed | — | Must install |
| STRIPE_PRICE_PRO env var | STRIPE-01 | Not set | — | Route returns 500; must be configured before use |
| STRIPE_PRICE_BUSINESS env var | STRIPE-01 | Not set | — | Same |
| STRIPE_WEBHOOK_SECRET env var | STRIPE-02 | Not set | — | All webhooks rejected with 400 |
| STRIPE_SECRET_KEY env var | Fallback if no DB key | Not verified | — | Falls back to env via getIntegrationKey pattern |
| /api/webhooks/ proxy bypass | STRIPE-02 | Already active | — | None needed |

**Missing dependencies with no fallback:**
- `stripe` npm package — must be installed before any route works
- `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` — must be created in Stripe dashboard and added to env
- `STRIPE_WEBHOOK_SECRET` — must be configured per environment (CLI secret for dev, dashboard secret for prod)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (include: tests/unit/**) |
| Quick run command | `npx vitest run tests/unit/api/stripe-webhook.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRIPE-01 | POST /api/billing/create-checkout-session returns { url } | unit | `npx vitest run tests/unit/api/create-checkout-session.test.ts` | Wave 0 |
| STRIPE-02 | POST /api/webhooks/stripe verifies signature, rejects bad sig | unit | `npx vitest run tests/unit/api/stripe-webhook.test.ts` | Wave 0 |
| STRIPE-02 | checkout.session.completed updates companies tier columns | unit | same file | Wave 0 |
| STRIPE-02 | invoice.paid updates tier_renews_at | unit | same file | Wave 0 |
| STRIPE-02 | customer.subscription.deleted resets to free | unit | same file | Wave 0 |
| STRIPE-03 | POST /api/billing/create-portal-session returns { url } | unit | `npx vitest run tests/unit/api/create-portal-session.test.ts` | Wave 0 |
| STRIPE-04 | Duplicate event_id returns 200 without re-processing | unit | `npx vitest run tests/unit/api/stripe-webhook.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/api/stripe-webhook.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/api/stripe-webhook.test.ts` — covers STRIPE-02, STRIPE-04
- [ ] `tests/unit/api/create-checkout-session.test.ts` — covers STRIPE-01
- [ ] `tests/unit/api/create-portal-session.test.ts` — covers STRIPE-03

*(Vitest framework is already installed; no new test infrastructure needed)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual price ID lookup via `line_items` expand | Store `plan` in `session.metadata` | Stripe API evolution | Avoids extra API call in webhook |
| Stripe API v1 typed events | `stripe.webhooks.constructEvent()` returns `Stripe.Event` with typed `data.object` | Stripe SDK v8+ | Full TypeScript inference on event types |

---

## Open Questions

1. **Stripe API version pin**
   - What we know: `stripe@22.x` uses `apiVersion: '2025-04-30.basil'` (the `basil` naming scheme for new releases)
   - What's unclear: Whether to pin the exact version in `getStripeClient()` or use the SDK default
   - Recommendation: Pin explicitly (`apiVersion: '2025-04-30.basil'`) — prevents silent breaking changes if the Stripe SDK default bumps

2. **`invoice.payment_failed` grace period UI**
   - What we know: REQUIREMENTS.md says "Grace window: 3-7 days before downgrade on payment failure (Stripe handles this via dunning)"
   - What's unclear: Phase 58 scope says do NOT downgrade on payment failure. Does Phase 58 need to write any column on this event (e.g., a `payment_failed_at` flag for Phase 59 UI)?
   - Recommendation: Skip DB write entirely for `invoice.payment_failed` in Phase 58. Phase 59 UI will show payment status via Stripe Customer Portal instead.

3. **`stripe_customer_id` creation on first checkout**
   - What we know: `stripe.checkout.sessions.create({ customer: existingStripeCustomerId ?? undefined })` — if no customer ID, Stripe creates one automatically
   - What's unclear: How to get the auto-created customer ID back — it's in `session.customer` on the `checkout.session.completed` webhook
   - Recommendation: Do NOT create a Stripe customer manually at checkout. Let Stripe create it; capture from the webhook. This is the simpler path and avoids a double-customer risk.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `proxy.ts`, `lib/platform-config.ts`, `lib/schemas/admin.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/entitlements.ts`, `lib/queries/company.ts`, `package.json`
- `npm view stripe version` — confirmed 22.1.1 is current (2026-05-13)
- `STATE.md` Decisions section — per-request SDK init pattern (D-05), WhatsApp webhook raw body pattern, idempotency via `whatsapp_processed_messages`
- `REQUIREMENTS.md` STRIPE-01..04 — locked requirements

### Secondary (MEDIUM confidence)
- SEED-013 Stripe integration flow diagram — confirmed aligns with requirements
- Stripe documentation patterns (training knowledge, verified against SDK version confirmed above)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `stripe@22.1.1` confirmed via npm registry; not in package.json (must install)
- Architecture: HIGH — all patterns derived from existing codebase conventions (proxy bypass, per-request SDK init, raw body, idempotency table)
- Pitfalls: HIGH — raw body pitfall confirmed from WhatsApp webhook source; others from Stripe webhook integration experience

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (Stripe SDK and API versions are stable; 30-day horizon)
