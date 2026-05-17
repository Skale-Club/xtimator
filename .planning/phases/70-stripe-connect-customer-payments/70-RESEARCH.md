# Phase 70: Stripe Connect — Optional Customer Payments - Research

**Researched:** 2026-05-17
**Domain:** Stripe Connect Standard OAuth + Direct Charges via Checkout + Connect webhooks
**Confidence:** HIGH

## Summary

Phase 70 layers Stripe Connect Standard onto Xtimator's existing Stripe subscription plumbing. The codebase already has a clean per-request `getStripeClient()` factory (`lib/billing/stripe-client.ts`), a webhook handler with HMAC verification + idempotency (`app/api/webhooks/stripe/route.ts`), and an admin-managed encrypted-key pattern (`lib/platform-config.ts`). All four hooks needed for Connect are extensions of patterns that already exist — no new infrastructure required.

The Stripe SDK is at the **current** version (`stripe@22.1.1`) using API version `2026-04-22.dahlia`. The OAuth flow is plain HTTPS endpoints (not in stripe-node), and Direct Charges work by passing `{ stripeAccount: 'acct_xxx' }` as the second argument to any `stripe.checkout.sessions.create()` / `stripe.paymentIntents.*` call. Connect events are distinguished from platform events by the presence of `event.account` (acct_id string) on the Event object.

**Primary recommendation:** Build OAuth as raw `fetch()` calls to `connect.stripe.com` (no SDK helpers exist), extend the webhook handler with an `event.account ? handleConnectEvent(...) : handlePlatformEvent(...)` branch, and pass `stripeAccount` per-request through the existing `getStripeClient()` (do NOT add a `stripeAccount` option to the factory — keep one platform client and pass the override at call sites).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stripe Connect Architecture**
- Connect type: **Standard** — business uses their own Stripe Dashboard for refunds/disputes/payouts (Xtimator never builds payout UI)
- OAuth flow: business clicks Connect → redirect to `connect.stripe.com/oauth/authorize` → callback exchanges code for `stripe_user_id` (acct_xxx)
- Charge mode: **Direct charges** on the connected account (using `stripeAccount` header option in API calls); funds settle directly to the business's Stripe balance, not the platform's
- Application fee: **0%** — provider keeps 100% of payment; Xtimator monetizes via SaaS plans only
- Per-company isolation: each company's `stripe_account_id` is independent; one company connecting/disconnecting never affects others

**Data Model**
- New columns on `companies`: `stripe_account_id`, `stripe_connect_status` ('pending'|'active'|'disconnected'), `stripe_connected_at`, `stripe_account_email`, `stripe_account_display_name`
- New columns on `estimates`: `payment_status` ('unpaid'|'paid'|'refunded'), `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`
- **No new tables** — extend existing companies + estimates
- RLS unchanged — company-scoped policies already cover the new columns
- No backfill needed — `payment_status` defaults to `'unpaid'` for existing rows

**Platform Configuration**
- New integration key: `stripe_connect_client_id` (`ca_...` value) — managed via `/admin/integrations` using existing AES-GCM `platform_config` pattern
- Graceful degrade when `stripe_connect_client_id` is unset platform-wide
- Existing `STRIPE_SECRET_KEY` reused — same key authenticates Connect API calls

**Settings UI** (`/settings/payments`)
- New dedicated sub-page; three states (not connected / connected / platform not configured)
- shadcn/ui Card + Button; brand color `#406EF1` primary CTA; success-green for connected state badge

**Public Share Page** (`/estimate/[token]`)
- Pay Now button only when `company.stripe_account_id` present AND `estimate.payment_status != 'paid'`
- Button label: "Pay $X" with USD-formatted amount
- Success banner on `?stripe=success`; neutral message on `?stripe=canceled`

**Webhook Handling**
- Reuse existing endpoint; extend to branch on `event.account` field
- Idempotency reuses existing `stripe_processed_events` table
- Events handled: `checkout.session.completed`, `account.updated`, `account.application.deauthorized`

**Post-Payment Actions (all 4)**: DB update, business email, customer email, success banner

**Disconnect Flow**: Soft disconnect (clear `stripe_account_id`, keep email for audit); paid estimates retain status; optional Stripe-side `POST /oauth/deauthorize`

### Claude's Discretion
- Exact OAuth state CSRF mechanism (signed JWT vs DB nonce vs encrypted cookie) — pick simplest secure option
- Email template visual design (use existing branded email pattern)
- "Powered by Stripe" badge near Pay Now (standard Stripe branding — likely yes)
- Loading states / spinner UX during OAuth round-trip and payment redirect
- Exact copy for empty states, error toasts, success banner
- Test fixture structure for unit tests
- "Pago" badge polish on dashboard estimate list

### Deferred Ideas (OUT OF SCOPE)
- Refund management UI inside Xtimator (use Stripe Dashboard)
- Partial payments / deposits / custom amounts
- Recurring/subscription billing for retainer projects
- Multi-currency (USD only for v1)
- ACH / bank transfer
- Apple Pay / Google Pay explicit buttons (Checkout auto-enables)
- In-app payment analytics / Stripe Tax integration
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ App Router (project is on Next 16.2.3), TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod
- **Database**: Supabase PostgreSQL with **RLS on all tables**
- **Security**: Service role key never exposed to browser; all AI/Stripe calls server-side via API routes
- **Workflow enforcement**: All edits must go through a GSD command — Phase 70 plans drive all changes

## Standard Stack

### Core (already installed, verified current)

| Library | Installed | Latest | Purpose | Why Standard |
|---------|-----------|--------|---------|--------------|
| `stripe` | `^22.1.1` | `22.1.1` | Server SDK for Stripe API | Official SDK; supports Connect via per-request `stripeAccount` option |
| `@supabase/supabase-js` | `^2.103.0` | — | DB writes (estimates, companies) | Existing pattern |
| `resend` | `^6.10.0` | — | Send payment-received / receipt emails | Existing pattern via `lib/email/` |
| `zod` | `^4.3.6` | — | Validate webhook payloads + OAuth callback params | Existing pattern |

**Verified versions (2026-05-17):** `npm view stripe version` → `22.1.1` (matches installed). No upgrade needed.

**Stripe API version pin:** `2026-04-22.dahlia` (already pinned in `lib/billing/stripe-client.ts:15`). All Connect endpoints exist on this version; no API version bump required.

### No New Dependencies Required

OAuth flow uses native `fetch()` to `connect.stripe.com/oauth/{authorize,token,deauthorize}` — the stripe-node SDK does **not** wrap these endpoints (OAuth is a separate subsystem from the Stripe REST API).

### Alternatives Considered

| Instead of | Could Use | Why Standard wins |
|------------|-----------|-------------------|
| Standard Connect | Express / Custom Connect | Standard puts refunds/disputes/payouts in Stripe Dashboard (zero UI for us); Express/Custom force us to build dashboard surfaces |
| Direct charges | Destination charges / Separate charges + transfers | Direct charges with `application_fee_amount=0` is the simplest model when platform takes 0 cut; funds bypass platform balance entirely |
| Checkout Sessions | Stripe Elements + PaymentIntent | Checkout is hosted by Stripe (PCI-free, mobile-optimized, Apple/Google Pay auto-enabled, branded with connected account's logo) |

## Architecture Patterns

### File Layout (per SEED-020, confirmed safe to ship as-is)

```
app/api/stripe/connect/
  initiate/route.ts      # GET — builds OAuth URL with state cookie, 302 redirect
  callback/route.ts      # GET — verifies state, exchanges code, persists acct_id
  disconnect/route.ts    # POST — soft disconnect, best-effort deauthorize
app/api/estimate/[token]/pay/route.ts   # POST — creates Checkout Session on acct

app/(app)/settings/payments/page.tsx    # Server component, fetches company row
components/settings/stripe-connect-card.tsx
components/estimate/pay-now-button.tsx
components/estimate/payment-success-banner.tsx

lib/billing/connect-oauth.ts            # buildAuthorizeUrl, exchangeCode, deauthorize, state helpers
lib/email/templates/payment-received.tsx
lib/email/templates/payment-receipt.tsx
```

### Pattern 1: Per-Request `stripeAccount` (Direct Charges)

**Do NOT** modify `getStripeClient()` to accept `stripeAccount`. Keep one platform-scoped client; pass the override per call:

```typescript
// Source: https://github.com/stripe/stripe-node (request options second arg)
const stripe = await getStripeClient()
const session = await stripe.checkout.sessions.create(
  {
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: estimate.title ?? 'Service estimate' },
        unit_amount: estimate.total_amount_cents,  // integer cents
      },
      quantity: 1,
    }],
    success_url: `${origin}/estimate/${token}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/estimate/${token}?stripe=canceled`,
    metadata: {
      estimate_id: estimate.id,
      company_id:  company.id,
    },
    payment_intent_data: {
      metadata: { estimate_id: estimate.id, company_id: company.id },
      // application_fee_amount: 0,  // OMIT entirely — do not send 0
    },
  },
  {
    stripeAccount: company.stripe_account_id,  // acct_xxx
    idempotencyKey: `pay_${estimate.id}_${Date.now()}`,
  }
)
return Response.redirect(session.url!, 303)
```

### Pattern 2: OAuth Initiate

```typescript
// Source: https://docs.stripe.com/connect/oauth-reference
import { randomBytes } from 'node:crypto'

export async function GET() {
  const ctx = await requireCompanyContext()  // existing helper
  const clientId = await getIntegrationKey('stripe_connect_client_id')
  if (!clientId) return NextResponse.redirect('/settings/payments?error=platform_not_configured')

  const state = randomBytes(32).toString('base64url')
  // Sign state with HMAC of companyId+nonce, store in httpOnly cookie (10 min TTL)
  cookies().set('stripe_oauth_state', `${state}.${ctx.companyId}`, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })

  const url = new URL('https://connect.stripe.com/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', 'read_write')
  url.searchParams.set('redirect_uri', `${origin}/api/stripe/connect/callback`)
  url.searchParams.set('state', state)
  // Optional pre-fill: url.searchParams.set('stripe_user[email]', ctx.userEmail)
  return NextResponse.redirect(url.toString())
}
```

### Pattern 3: OAuth Callback (Code Exchange)

```typescript
// Source: https://docs.stripe.com/connect/oauth-reference
// POST https://connect.stripe.com/oauth/token
//   Auth: HTTP Basic with platform secret key (username=key, password empty)
//   Body: grant_type=authorization_code, code=ac_xxx
const secretKey = await getIntegrationKey('stripe')
const res = await fetch('https://connect.stripe.com/oauth/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ grant_type: 'authorization_code', code }),
})
const json = await res.json() as {
  stripe_user_id: string         // acct_xxx — the only field we persist
  scope: 'read_write' | 'read_only'
  livemode: boolean
  token_type: 'bearer'
  // access_token + refresh_token are DEPRECATED for Standard — ignore them
}

// Optional: fetch account details for display
const stripe = await getStripeClient()
const account = await stripe.accounts.retrieve(json.stripe_user_id)
// account.email, account.business_profile?.name, account.settings?.dashboard?.display_name
```

### Pattern 4: Deauthorize

```typescript
// Source: https://docs.stripe.com/connect/oauth-reference
const res = await fetch('https://connect.stripe.com/oauth/deauthorize', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    client_id: clientId,           // ca_xxx
    stripe_user_id: account_id,    // acct_xxx
  }),
})
// Best-effort: log on failure but still clear DB columns (user intent wins)
```

### Pattern 5: Webhook Branching

Extend the existing handler in `app/api/webhooks/stripe/route.ts`. Top-level `event.account` (string) is **only present on Connect events**:

```typescript
// Source: https://docs.stripe.com/connect/webhooks
async function handleStripeEvent(event, stripe, svc) {
  // event.account is set ONLY for connected-account events
  if (event.account) {
    return handleConnectEvent(event, stripe, svc)
  }
  return handlePlatformEvent(event, stripe, svc)  // existing switch
}

async function handleConnectEvent(event, stripe, svc) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const estimateId = session.metadata?.estimate_id
      if (!estimateId) break

      await svc.from('estimates').update({
        payment_status: 'paid',
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        paid_at: new Date().toISOString(),
        payment_amount_cents: session.amount_total,
      }).eq('id', estimateId)

      // Fire two emails (don't await both — wrap in Promise.allSettled, log errors)
      break
    }
    case 'account.application.deauthorized': {
      // User disconnected from Stripe side (rare but possible)
      await svc.from('companies').update({
        stripe_account_id: null,
        stripe_connect_status: 'disconnected',
      }).eq('stripe_account_id', event.account)
      break
    }
    case 'account.updated': {
      // Optional: sync display_name / email if business updates their Stripe profile
      break
    }
  }
}
```

### Anti-Patterns to Avoid

- **DON'T** modify `getStripeClient()` to accept `stripeAccount` — keep the platform client pure; pass per-request. Mixing scopes in the factory leads to subtle bugs (a long-lived client reused across companies).
- **DON'T** send `application_fee_amount: 0`. Stripe rejects zero values on some paths and the docs say "must be positive". **Omit the field entirely** for 0% platform cut.
- **DON'T** put OAuth state in localStorage / sessionStorage — the redirect is cross-site. Use an `httpOnly + secure + sameSite=lax` cookie.
- **DON'T** trust `event.account` for company lookup without verifying signature first (existing handler does this correctly — keep order).
- **DON'T** use `access_token` / `refresh_token` from the OAuth response. They're deprecated for Standard accounts — the platform's own secret key + `Stripe-Account` header is the canonical pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth state CSRF | Random number in localStorage | `randomBytes(32)` + httpOnly cookie (10 min TTL) | Cross-site redirect breaks JS storage; cookie is the only state surviving the round-trip safely |
| Webhook signature verification | Manual HMAC | `stripe.webhooks.constructEvent()` (already used) | Same secret works for Connect events when endpoint is configured with `connect: true` in Dashboard |
| Idempotency on payment marking | Custom dedup table | Existing `processed_stripe_events` row insert with `ON CONFLICT` | Already battle-tested in `app/api/webhooks/stripe/route.ts:36-49` |
| OAuth token endpoint client | New SDK call | Plain `fetch()` to `connect.stripe.com/oauth/token` | stripe-node intentionally does not wrap OAuth endpoints |
| Currency formatting on share page | `Number.toFixed(2)` | `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` | Handles `$X,XXX.XX` correctly; SSR-safe |
| Branded receipt email design | New layout | `getBranding()` + existing `lib/email/templates/` MJML-like pattern | Already wired with company logo/color |

## Common Pitfalls

### Pitfall 1: Connect Webhook Endpoint vs Platform Endpoint (Stripe Dashboard Setting)

**What goes wrong:** Stripe sends Connect events (`event.account` populated) to a webhook endpoint **only if** that endpoint was registered with `connect: true` (Dashboard: "Events from: Connected accounts"). Endpoints registered as "Your account" never receive Connect events.

**How to avoid:**
- Either (a) **register a second endpoint** in Stripe Dashboard pointing at `/api/webhooks/stripe` with "Connected accounts" toggled, **using the same secret** — Stripe allows reuse, OR
- (b) edit the existing platform endpoint to subscribe to both scopes (Dashboard supports this; the same `STRIPE_WEBHOOK_SECRET` validates both).

**Recommendation:** Document in plan 70-04 that Xtimator owner must add `checkout.session.completed`, `account.application.deauthorized`, `account.updated` to the **Connected accounts** event scope. Same endpoint URL, same secret.

**Warning sign:** Customer pays in Stripe → estimate stays `unpaid` in DB → webhook handler never invoked. First debug step: check Dashboard → Workbench → Events for the connected account.

### Pitfall 2: `application_fee_amount` Must Be Positive (Or Omitted)

**What goes wrong:** Setting `application_fee_amount: 0` returns 400 from Stripe ("must be greater than 0"). Several blog posts confusingly recommend "set to 0 for no fee" — wrong.

**How to avoid:** Omit the field entirely from `payment_intent_data`. Direct charges with no `application_fee_amount` set means 100% goes to the connected account (modulo Stripe's own processing fee, charged to the connected account).

### Pitfall 3: OAuth Code Expires in 5 Minutes and Is Single-Use

**What goes wrong:** Reusing a code (e.g., user double-clicks during callback render, or callback handler retries on error) **revokes the connection** per OAuth v2 spec.

**How to avoid:**
- Make the callback handler idempotent: check `companies.stripe_account_id` before calling token exchange. If already set for this state's company, treat as success.
- Don't retry the `/oauth/token` POST on transient errors — surface a "try again" UI and have user re-initiate.
- Clear the `stripe_oauth_state` cookie immediately after the first read.

### Pitfall 4: Webhook Signature Verification on Connect Events Uses Same Secret

**What goes wrong:** Developers assume Connect events need a different signing secret. They use a wrong/empty secret and signature fails silently.

**How to avoid:** `STRIPE_WEBHOOK_SECRET` (single env var) works for both platform and Connect events as long as both are configured on the **same endpoint** in Dashboard. Existing `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)` call needs no changes.

**Verification:** Confirmed via Stripe docs — signature mechanism is endpoint-scoped, not event-scope-scoped.

### Pitfall 5: `success_url` Must Use the Literal Template `{CHECKOUT_SESSION_ID}`

**What goes wrong:** Developers URL-encode `{CHECKOUT_SESSION_ID}` or substitute a variable, then redirect lands without the session ID.

**How to avoid:** Pass it as a literal string (no encoding): `?stripe=success&session_id={CHECKOUT_SESSION_ID}`. Stripe replaces it before redirecting the user. The share page can then optionally call `stripe.checkout.sessions.retrieve(session_id, { stripeAccount })` for an instant optimistic UI, but the webhook is the source of truth.

### Pitfall 6: Direct Charges + Connected Account = Customer Sees Connected Account's Branding

**What goes wrong:** Business owner expects "Xtimator" branding on Stripe Checkout. With direct charges on Standard accounts, the **connected account's** branding shows (their business name, logo, support email). This is correct behavior but may surprise users.

**How to avoid:** Document in onboarding copy: "Customers will see [your business name] on the Stripe payment page." Direct them to Stripe Dashboard → Settings → Branding to upload logo.

### Pitfall 7: `current_period_end` API Shift Already in Codebase

**What goes wrong:** Existing webhook handler at `app/api/webhooks/stripe/route.ts:101` casts through `unknown` because API `2026-04-22.dahlia` moved `current_period_end` under `billing_details`. New Connect code should NOT touch subscription fields; safe to ignore for Phase 70 but be aware the pattern exists.

## Code Examples

### Building OAuth State Cookie (HMAC-signed for tamper resistance)

```typescript
// lib/billing/connect-oauth.ts
import { createHmac, randomBytes } from 'node:crypto'

const STATE_SECRET = process.env.APP_ENCRYPTION_KEY!  // reuse existing key

export function mintOAuthState(companyId: string): string {
  const nonce = randomBytes(16).toString('base64url')
  const ts = Date.now().toString()
  const payload = `${companyId}.${nonce}.${ts}`
  const sig = createHmac('sha256', STATE_SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyOAuthState(state: string, expectedCompanyId: string): boolean {
  const parts = state.split('.')
  if (parts.length !== 4) return false
  const [companyId, nonce, ts, sig] = parts
  if (companyId !== expectedCompanyId) return false
  if (Date.now() - Number(ts) > 600_000) return false  // 10 min
  const expected = createHmac('sha256', STATE_SECRET)
    .update(`${companyId}.${nonce}.${ts}`).digest('base64url')
  return sig === expected
}
```

### Conditional Pay Now Button (Server Component)

```tsx
// app/estimate/[token]/page.tsx — partial
const showPayButton =
  company.stripe_account_id != null &&
  company.stripe_connect_status === 'active' &&
  estimate.payment_status !== 'paid' &&
  estimate.total_amount_cents > 0

{showPayButton && (
  <form action={`/api/estimate/${token}/pay`} method="POST">
    <Button type="submit" className="w-full bg-[#406EF1]" size="lg">
      Pay {formatUSD(estimate.total_amount_cents)}
    </Button>
    <p className="text-xs text-muted-foreground mt-2 text-center">
      Powered by Stripe · Secure payment
    </p>
  </form>
)}
```

### Admin Integrations Card Addition

In `app/admin/integrations/page.tsx` PROVIDERS array, append:

```typescript
{
  id: 'stripe_connect_client_id',  // requires IntegrationProvider type update
  title: 'Stripe Connect Client ID',
  description: 'ca_... value from Stripe Dashboard → Connect → Settings. Enables tenant Stripe connections.',
}
```

`IntegrationProvider` type in `lib/platform-config.ts:35` needs `| 'stripe_connect_client_id'` appended. The Client ID is not a secret per Stripe's docs (it appears in OAuth URLs and the browser), but storing it in `platform_integrations` keeps admin UX consistent and lets the owner rotate it without a redeploy.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `access_token` from OAuth | Platform secret key + `Stripe-Account` header | Stripe deprecated in 2019 | Ignore `access_token` in response; never persist it |
| Express OAuth endpoint | Standard OAuth (this phase) + Account Links (Express) | Express now uses `accountLinks.create()` instead of OAuth | Confirmed Standard still uses OAuth flow as primary onboarding |
| Subscription `current_period_end` top-level | Under `billing_details.subscription_details` | API `2026-04-22.dahlia` | Existing handler already works around it (line 101); irrelevant to Phase 70 |

**Deprecated/outdated:**
- Stripe Connect "Legacy" (pre-2017 platforms) — not applicable; Xtimator is greenfield
- `refresh_token` for Standard accounts — never needed; platform key authenticates everything

## Open Questions

1. **Should we register a separate webhook endpoint for Connect events or extend the existing one?**
   - What we know: Stripe Dashboard allows a single endpoint to subscribe to both platform and connected-account events, using the same signing secret.
   - What's unclear: Whether Xtimator's owner prefers two endpoints for cleaner Dashboard observability.
   - Recommendation: **Single endpoint** to minimize ops surface. Document the Dashboard subscription change in plan 70-05's setup runbook.

2. **`stripe_connect_client_id`: encrypted or plaintext column?**
   - What we know: Client ID (`ca_...`) appears in browser OAuth URLs — it's not a secret.
   - What's unclear: Whether to bend the `platform_integrations` schema to store a non-secret.
   - Recommendation: Store it via the existing AES-GCM pattern anyway. The encryption overhead is trivial, and admin UX stays uniform (one place for all platform-wide keys). Treat it as "secret-shaped configuration".

3. **Should Pay Now button do client-side POST (fetch + redirect) or HTML form submit?**
   - Tradeoff: Form submit is simpler and works without JS but causes full page reload before the Stripe redirect; fetch lets us show a loading spinner.
   - Recommendation: HTML `<form method="POST">` for MVP — Stripe Checkout itself shows a loading state on its end. Add fetch + spinner in a polish iteration if needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` npm package | All Phase 70 code | ✓ | 22.1.1 | — |
| `STRIPE_SECRET_KEY` (via `platform_integrations.provider='stripe'`) | OAuth code exchange + connected-account API calls | ✓ (admin-managed) | — | env var `STRIPE_API_KEY` (fallback path at `lib/platform-config.ts:177`) |
| `STRIPE_WEBHOOK_SECRET` (env var) | Webhook signature verification | ✓ | — | None — required |
| `APP_ENCRYPTION_KEY` (env var) | OAuth state HMAC + platform integrations encrypt/decrypt | ✓ | — | None — required |
| Resend API key | Payment notification emails | ✓ (admin-managed) | — | If absent, log + skip email; do not block payment processing |
| Stripe Dashboard: Connect enabled | Whole feature | ✗ at code-ship time | — | Plan 70-05 documents manual setup (one-time owner action) |
| Stripe `stripe_connect_client_id` (`ca_...`) | OAuth flow | ✗ at code-ship time | — | Settings page renders "platform not yet configured" message |

**Missing dependencies with no fallback:** None at code-ship time. Two manual setup steps (Stripe Dashboard Connect enablement + Client ID admin entry) are documented in plan 70-05 — code degrades gracefully until they're done.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npm test -- <file>` |
| Full suite command | `npm test` |
| E2E framework | Playwright 1.59.1 (for share-page snapshot tests) |
| E2E command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| 70-01 | DB migration applies cleanly; types regen | smoke | `npx supabase db push && npx supabase gen types typescript` | ❌ Wave 0 — new fixture |
| 70-02 OAuth state | `mintOAuthState` + `verifyOAuthState` round-trip; tampered state rejected; expired state rejected | unit | `npm test -- tests/unit/billing/connect-oauth.test.ts` | ❌ Wave 0 |
| 70-02 Callback idempotency | Re-running callback with same company doesn't re-exchange code | unit | `npm test -- tests/unit/billing/connect-callback.test.ts` | ❌ Wave 0 |
| 70-03 Checkout session creation | `pay` route returns 303 with Stripe URL; metadata includes estimate_id | unit | `npm test -- tests/unit/billing/estimate-pay.test.ts` | ❌ Wave 0 |
| 70-03 Pay button visibility | Share page renders button ONLY when `stripe_account_id` AND not paid | unit (RTL) | `npm test -- tests/unit/components/pay-now-button.test.tsx` | ❌ Wave 0 |
| 70-04 Webhook routing | Event with `event.account` set routes to `handleConnectEvent`; without, to platform handler | unit | `npm test -- tests/unit/webhooks/connect-events.test.ts` | ❌ Wave 0 |
| 70-04 Mark paid | `checkout.session.completed` Connect event updates estimate row correctly | unit | (same file) | ❌ Wave 0 |
| 70-04 Idempotency | Duplicate event id triggers `ON CONFLICT` and skips email send | unit | (same file) | ❌ Wave 0 |
| 70-05 Share page snapshots | Both branches (connected / not connected) render correctly | e2e | `npx playwright test estimate-share-payment.spec.ts` | ❌ Wave 0 |
| 70-05 Settings page states | not-connected / connected / platform-not-configured all render | unit (RTL) | `npm test -- tests/unit/settings/payments-page.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- <changed-test-file>` (< 5s typical)
- **Per wave merge:** `npm test` (full Vitest suite)
- **Phase gate:** Full Vitest suite + targeted Playwright spec green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/billing/connect-oauth.test.ts` — state mint/verify, tamper detection, expiry
- [ ] `tests/unit/billing/connect-callback.test.ts` — code exchange happy path + idempotency
- [ ] `tests/unit/billing/estimate-pay.test.ts` — Checkout Session creation with correct stripeAccount + metadata
- [ ] `tests/unit/components/pay-now-button.test.tsx` — conditional render matrix
- [ ] `tests/unit/webhooks/connect-events.test.ts` — `event.account` branching + paid-state writes + idempotency
- [ ] `tests/unit/settings/payments-page.test.tsx` — three-state render
- [ ] `tests/e2e/estimate-share-payment.spec.ts` — Playwright snapshot of share page in both branches
- [ ] Test fixture: minimal `Stripe.Checkout.Session` + `Stripe.Event` factories in `tests/fixtures/stripe-connect.ts`

## Sources

### Primary (HIGH confidence)
- https://docs.stripe.com/connect/oauth-reference — OAuth URLs, params, code exchange, deauthorize, state CSRF
- https://docs.stripe.com/connect/direct-charges — `Stripe-Account` header / `stripeAccount` option, fee mechanics, op-vs-header table
- https://docs.stripe.com/connect/webhooks — `event.account` distinguishes Connect events; `connect: true` Dashboard scope; `account.application.deauthorized` payload
- https://docs.stripe.com/connect/enable-payment-acceptance-guide — Full stripe-node Checkout Session example for connected account
- https://github.com/stripe/stripe-node — Per-request options shape (`stripeAccount`, `idempotencyKey`, `maxNetworkRetries`)
- `npm view stripe version` (run 2026-05-17) — Confirms `22.1.1` is current
- Existing code: `lib/billing/stripe-client.ts`, `app/api/webhooks/stripe/route.ts`, `lib/platform-config.ts`, `app/admin/integrations/page.tsx`, `app/admin/integrations/actions.ts`

### Secondary (MEDIUM confidence)
- Stripe API version `2026-04-22.dahlia` confirmed in installed client and validated against admin integrations test code (`actions.ts:182`)

### Tertiary (LOW confidence)
- None — all critical claims verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK version verified against npm registry; API version confirmed in existing code
- Architecture: HIGH — OAuth + Direct Charges + webhook patterns all sourced from official Stripe docs and cross-checked against in-repo patterns
- Pitfalls: HIGH for #1-6 (Stripe docs); MEDIUM for #7 (already mitigated in existing code)

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (Stripe Connect APIs are stable; review only if API version bump occurs)
