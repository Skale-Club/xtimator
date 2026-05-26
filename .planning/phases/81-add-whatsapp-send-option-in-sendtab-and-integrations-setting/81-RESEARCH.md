# Phase 81: Add WhatsApp send option in SendTab and integrations settings — Research

**Researched:** 2026-05-26
**Domain:** Outbound delivery channel addition (SendTab WhatsApp tab) + settings surface replacement (Integrations page)
**Confidence:** HIGH

## Summary

This phase ships two surfaces in lock-step:

1. **SendForm gains a third tab `whatsapp`** alongside `email` and `sms`, gated by a new prop `whatsappSendEnabled` that mirrors the existing `smsDeliveryEnabled` plumbing end-to-end. The tab posts to a new server route `POST /api/estimates/[id]/send-whatsapp` that mirrors `send-sms/route.ts` exactly (auth → ownership → estimate consolidated check → server-side gate → provider call → `estimate_deliveries` insert → `estimates.sent_at` → `estimate_activity` log).
2. **`/settings/integrations` page replaces the OpenRouter placeholder** by mounting the already-shipped `<WhatsAppConnectCard initial={initial} />`, fetched server-side from `company_whatsapp` for the current company. No new card is built — the card is the contract.

The bulk of the engineering surface is in (1). There is **one architectural decision** that the planner must lock with the user, and **one schema change** that is mandatory:

- **Architectural decision:** the existing `lib/whatsapp/client.ts:sendWhatsAppMessage()` uses **platform-global env vars** (`META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID`) — i.e. every outbound message is sent from the *Xtimator platform's* WhatsApp number, regardless of which company is sending. The per-company `company_whatsapp.phone_number_id` is read for inbound routing only. The UI-SPEC is silent on this. The planner must decide whether Phase 81 (a) reuses the platform number (cheap, matches Phase 44 send-from-owner pattern), or (b) refactors `sendWhatsAppMessage()` to accept a per-company `phoneNumberId` and read it from `company_whatsapp` (correct long-term but a refactor with blast radius across `confirm.ts`, `handler.ts`, `whatsapp-settings.ts`). **Recommendation:** ship (a) for Phase 81 — match the established Phase 43/44/53 send pattern. File a follow-up phase if multi-tenant WhatsApp sending becomes a requirement.
- **Schema change (mandatory):** `estimate_deliveries.channel` CHECK constraint currently allows only `('email', 'sms')`. A migration MUST drop and re-add the constraint to include `'whatsapp'`, OR Plan must INSERT into a different audit table. The pattern is identical to `20260511000003_phase53_pdf_attachment.sql` which extended `company_whatsapp.delivery_format`.

**Primary recommendation:** Mirror the SMS implementation 1:1. WhatsApp Send route → reuses existing `sendWhatsAppMessage()` for `text` payloads (formatted_text + share_link branches) and `document` payloads (pdf_attachment branch via `generateAndUploadEstimatePDF`). Reuse `formatEstimateForWhatsApp()` from `lib/whatsapp/formatter.ts` and `generateAndUploadEstimatePDF()` from `lib/whatsapp/pdf-delivery.ts`. The format is read from `company_whatsapp.delivery_format` — the Send tab does NOT expose a format toggle (UI-SPEC locked).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for this phase** — `/gsd-discuss-phase` was not run. The UI-SPEC at `81-UI-SPEC.md` is the design contract that locks all UI decisions; treat it with the same authority as CONTEXT.md `## Decisions`.

### Locked Decisions (from 81-UI-SPEC.md — VERBATIM)

1. **Two surfaces only.** SendForm (third tab) + `/settings/integrations` page (mount `WhatsAppConnectCard`). Everything else is out of scope.
2. **Tab ordering left → right:** Email · SMS (if enabled) · WhatsApp (if enabled). WhatsApp goes last.
3. **Tab icon:** `MessageCircle` (lucide). MUST NOT reuse `MessageSquare` — that icon is owned by SMS.
4. **Visibility gate:** `whatsappSendEnabled === false` → tab is **hidden entirely**, not disabled. Mirrors `smsDeliveryEnabled` behavior in `send-form.tsx` lines 161 + 237.
5. **Prop name and threading:** `whatsappSendEnabled: boolean` threaded from `app/(app)/projects/[id]/page.tsx` → `ProjectWorkspace` → `SendTab` → `SendForm`. Mirror the exact `smsDeliveryEnabled` plumbing.
6. **Gate semantics:** `whatsappSendEnabled = entitlements.whatsappEnabled && company_whatsapp?.status === 'active'`.
7. **Form fields:** recipient phone (`PhoneInput`, default `clientPhone`, E.164 regex `/^\+[1-9]\d{7,14}$/`), optional `Textarea rows=3` custom message, primary CTA.
8. **CTA:** `Button variant="primary" size="lg" className="w-full"` with `MessageCircle` (idle) / `Loader2` (sending). Labels: `"Send WhatsApp"` / `"Sending..."`.
9. **Delivery format selector is OUT OF SCOPE on the Send tab.** The format is read from `company_whatsapp.delivery_format` set on the connect card. Single source of truth.
10. **Draft estimate gating:** parent `SendTab` passes `disabled={isDraft}`; CTA disabled identically to Email and SMS.
11. **No upsell inline.** Free-tier 402 upsell lives in the global `<UpgradeModal>` (Phase 59).
12. **`WhatsAppConnectCard` is unchanged.** Do NOT refactor it. If a planner proposes to modify props or internals, that proposal is out of phase scope.
13. **Integrations page header copy:** H1 = `t("Integrations")`, subhead = `t("Connect outbound channels for sending estimates and receiving client messages.")` (replaces the current AI-focused copy).
14. **Toast on success:** `t("Estimate sent via WhatsApp!")` (with exclamation — matches `"Estimate sent via SMS!"` style on line 125 of `send-form.tsx`).
15. **WhatsApp brand name is not translated** — wrapped in `t()` but the source string is the proper noun.

### Claude's Discretion

The UI-SPEC is silent on the following — planner has freedom:

- The new API route name. **Recommendation:** `POST /api/estimates/[id]/send-whatsapp` (mirrors `send-sms` casing).
- Whether to add a `recipient_phone` column nullability check, OR whether `estimate_deliveries.recipient_phone` (already nullable) suffices.
- Whether to add `'whatsapp'` to a new `provider` enum value (`'meta'`?) or reuse one of `'resend'`/`'twilio'`. The existing CHECK is `('resend', 'twilio')`. **Recommendation:** add `'meta'` (provider) and `'whatsapp'` (channel) in the same migration.
- Whether to record a usage event (`recordUsage('whatsapp_send', ...)`) for outbound. Phase 57 enforcement only blocks INBOUND WhatsApp at the `processInboundMessages` handler. Outbound is post-paid AI work and not currently quota-counted. **Recommendation:** do NOT add quota for outbound in Phase 81 (out of scope; matches SMS which has no quota either).

### Deferred Ideas (OUT OF SCOPE)

- Refactoring `sendWhatsAppMessage()` to accept per-company `phoneNumberId` from `company_whatsapp` instead of `process.env.META_WHATSAPP_PHONE_NUMBER_ID`. **Decision:** defer to a follow-up phase. Send-from-platform-number matches the Phase 43/44/53 owner-receives-from-platform pattern.
- Surface inline upsell when entitlement is true but no number is connected. UI-SPEC locks this as **hide the tab**.
- Add OpenRouter / Slack / other integrations cards. UI-SPEC says the page is a vertical card stack forward-compat; this phase ships ONLY the WhatsApp card.
- Modify `WhatsAppConnectCard` — locked verbatim.
</user_constraints>

<phase_requirements>
## Phase Requirements

> No `REQUIREMENTS.md` IDs exist for this phase (phase description says "TBD — derive from CONTEXT and STATE"). The implicit requirements derived from the UI-SPEC are:

| ID (proposed) | Description | Research Support |
|---|---|---|
| WA-SEND-01 | SendForm renders a third `TabsTrigger value="whatsapp"` with `MessageCircle` icon, gated by `whatsappSendEnabled === true && company_whatsapp.status === 'active'` | `components/workspace/send/send-form.tsx` lines 155-167 (existing tabs pattern); UI-SPEC §"SendTab — WhatsApp Tab Contract" |
| WA-SEND-02 | `whatsappSendEnabled: boolean` prop threaded end-to-end: project page → ProjectWorkspace → SendTab → SendForm | `app/(app)/projects/[id]/page.tsx` lines 96-152, `components/workspace/project-workspace.tsx` lines 24-167, `components/workspace/send/send-tab.tsx` lines 12-67 |
| WA-SEND-03 | New API route `POST /api/estimates/[id]/send-whatsapp` mirrors `send-sms/route.ts` (auth + ownership + consolidated check + provider send + `estimate_deliveries` insert + `estimates.sent_at` + `estimate_activity` event) | `app/api/estimates/[id]/send-sms/route.ts` (full pattern) |
| WA-SEND-04 | Route reads `company_whatsapp.delivery_format` and branches `share_link` / `formatted_text` / `pdf_attachment` mirroring `lib/whatsapp/confirm.ts:handleSend` lines 376-432 | `lib/whatsapp/confirm.ts`; `lib/whatsapp/formatter.ts`; `lib/whatsapp/pdf-delivery.ts` |
| WA-SEND-05 | Free-tier WhatsApp is gated server-side (returns 403 if `getEntitlements(tier).whatsappEnabled === false`) — matches `processInboundMessages` lines 188-206 | `lib/entitlements.ts` `whatsappEnabled` per tier; `lib/whatsapp/handler.ts` entitlement gate pattern |
| WA-SEND-06 | `estimate_deliveries` migration extends `channel` CHECK to include `'whatsapp'` and `provider` CHECK to include `'meta'` (single DROP + ADD CONSTRAINT migration) | `supabase/migrations/20260519000003_estimate_deliveries.sql`; pattern from `20260511000003_phase53_pdf_attachment.sql` |
| WA-INT-01 | `/settings/integrations/page.tsx` replaces OpenRouter placeholder by mounting `<WhatsAppConnectCard initial={initial} />` with `initial` fetched server-side from `company_whatsapp` for the authenticated user's company | UI-SPEC §"Settings → Integrations — Card Contract"; `app/(app)/settings/integrations/page.tsx` (current placeholder) |
| WA-INT-02 | Header copy updated to `t("Integrations")` H1 + `t("Connect outbound channels for sending estimates and receiving client messages.")` subhead | UI-SPEC line 200-201 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack locked:** Next.js 16.2.3 (App Router), TypeScript strict, Tailwind v4, shadcn/ui (New York / neutral / cssVariables), Zustand or React Context, react-hook-form + zod. [VERIFIED: `package.json`]
- **Supabase RLS on all tables.** Service role key never exposed to browser; all AI/external calls server-side via API routes. [VERIFIED: `CLAUDE.md`]
- **SECRET HANDLING (CRITICAL):** Never commit secrets / API keys / signing secrets to git — including markdown, comments, examples, or planning docs. Use placeholders like `whsec_<your-secret>` or `sk_live_<your-key>`. Pre-commit `gitleaks` hook blocks `whsec_*`, `sk_(test|live)_*`, `rk_(test|live)_*`, `sb_secret_*`, `sk-ant-*`, `sk-proj-*`, `re_*`. [VERIFIED: `CLAUDE.md`]
  - **Application to this phase:** WhatsApp provider secrets (`META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`) MUST be referenced via env-var NAME only in any new plan/summary/migration. NEVER paste a value, even a placeholder that looks like a real token. The same applies to platform-stored Meta access token retrieved via `getIntegrationKey('meta_whatsapp')` — never log the token, never include it in error messages, never serialize it into RSC payload.
- **GSD workflow:** Phase 81 is a planned phase — use `/gsd:execute-phase` for execution, not ad-hoc edits.

## Standard Stack

### Core (no new packages — everything already installed) [VERIFIED: `package.json`]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.3 | App Router, RSC, route handlers | Locked at project level |
| `react` / `react-dom` | 19.2.4 | UI runtime | Locked |
| `react-hook-form` | ^7.72.1 | Form state inside SendForm WhatsApp tab | Already used by Email + SMS tabs in `send-form.tsx` |
| `zod` | ^4.3.6 | Validation schema for `sendWhatsAppSchema` | Established pattern (lines 35-38 of `send-form.tsx`) |
| `@hookform/resolvers` | ^5.2.2 | `zodResolver` for the new schema | Same pattern |
| `lucide-react` | ^1.8.0 | `MessageCircle`, `Loader2` icons | Already imported in `send-form.tsx` line 23. **VERIFIED:** `MessageCircle` exists in 1.8.0 (`require('lucide-react').MessageCircle` resolves) |
| `sonner` | ^2.0.7 | Toasts on send success / error | Established pattern (`send-form.tsx` line 24) |
| `@supabase/supabase-js` | ^2.103.0 | DB access in the new route + page query | Locked |
| `@react-pdf/renderer` | ^4.4.0 | PDF generation in pdf_attachment branch | Already used by `lib/whatsapp/pdf-delivery.ts` |

### Supporting (existing internal modules — REUSE, do not hand-roll)

| Module | Purpose | Where Used |
|--------|---------|------------|
| `lib/whatsapp/client.ts:sendWhatsAppMessage(to, body)` | Calls Meta Graph API `v21.0/{phoneNumberId}/messages`. Reads `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` from env. Body shape: `{ messaging_product: 'whatsapp', to, ...body }`. | All outbound. Reuse for `type: 'text'` and `type: 'document'`. |
| `lib/whatsapp/formatter.ts:formatEstimateForWhatsApp(estimate, clientName, companyName)` | Builds the `formatted_text` body. Handles i18n (en/pt/es) and currency formatting. | Reuse for `formatted_text` branch. |
| `lib/whatsapp/pdf-delivery.ts:generateAndUploadEstimatePDF(estimateId, companyId, supabase, clientName)` | Generates PDF via `@react-pdf/renderer`, uploads to `pdfs` bucket via `lib/storage`, returns 24h signed URL + filename. Throws on failure (caller must catch + fall back to share_link). | Reuse for `pdf_attachment` branch. |
| `lib/queries/estimate.ts:getEstimateWithContext(supabase, id)` | Loads estimate + project + company + client (with join unwrap) | Used by `send/route.ts` + `pdf-delivery.ts`. Reuse for the new route. |
| `lib/entitlements.ts:getEntitlements(tier)` | Returns `{ whatsappEnabled: boolean, ... }` per tier | Server-side gate in the new route + in the project page resolver |
| `lib/queries/company.ts:getCompanyTier(supabase, userId)` | Returns `{ id, tier, tier_trial_ends_at }` | Use for the entitlement check in the project page when resolving `whatsappSendEnabled` |
| `lib/supabase/server.ts:createClient()` | Authenticated user client | All authenticated server routes |
| `lib/supabase/service.ts:requireServiceClient()` | Service-role client (bypasses RLS) | Used by `send-sms/route.ts` for `estimate_deliveries` insert |
| `components/ui/phone-input.tsx` | `PhoneInput` reused for the recipient field | Already used by SMS tab |
| `components/ui/tabs.tsx` (shadcn) | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Already used |
| `components/settings/whatsapp-connect-card.tsx` | The integrations card — **DO NOT MODIFY** | Just mount it |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `sendWhatsAppMessage()` with platform env vars | Refactor `sendWhatsAppMessage()` to accept `phoneNumberId` and read it from `company_whatsapp` | Correct long-term for true multi-tenant WhatsApp Business Cloud sending, but blast radius touches `confirm.ts` (3 call sites), `handler.ts` (1 call site), `whatsapp-settings.ts` (1 call site for verification SMS). **Defer to follow-up phase.** Phase 81 reuses the established Phase 43/44/53 send-from-platform pattern. |
| New table `whatsapp_deliveries` mirroring `estimate_deliveries` | Extend `estimate_deliveries.channel` + `provider` CHECKs | Extension is cheaper and gives uniform delivery history queries. Matches the Phase 53 `delivery_format` constraint extension pattern. |
| Calling `/api/estimates/[id]/pdf` internally for the `pdf_attachment` branch | Reuse `generateAndUploadEstimatePDF()` from `lib/whatsapp/pdf-delivery.ts` | The internal `/api/.../pdf` route requires auth cookies that may not be present in all server contexts; `pdf-delivery.ts` takes an injected `supabase` client and is the documented Phase 41 pattern. |
| Inline format selector in SendForm WhatsApp tab | Read `company_whatsapp.delivery_format` server-side | UI-SPEC locks the single-source-of-truth behavior. The selector lives on the connect card only. |

**Installation:** No new packages required. Skip `npm install`.

**Version verification:**

```bash
node -e "console.log(require('lucide-react/package.json').version)"  # → 1.8.0
node -e "console.log('MessageCircle' in require('lucide-react'))"    # → true
```

[VERIFIED: package.json + runtime import resolves both `MessageCircle` and `MessageSquare` in lucide-react@1.8.0 on this machine]

## Architecture Patterns

### Recommended Project Structure (delta only — files this phase touches)

```
app/
├── (app)/
│   ├── projects/[id]/page.tsx          # MODIFY: resolve whatsappSendEnabled and pass it down
│   └── settings/
│       └── integrations/page.tsx       # MODIFY: replace placeholder with WhatsAppConnectCard
├── api/
│   └── estimates/[id]/
│       └── send-whatsapp/route.ts      # NEW: mirrors send-sms/route.ts
components/
└── workspace/
    └── send/
        ├── send-form.tsx               # MODIFY: add whatsappSendEnabled prop + third tab
        └── send-tab.tsx                # MODIFY: add whatsappSendEnabled prop, pass to SendForm
    └── project-workspace.tsx           # MODIFY: add whatsappSendEnabled prop, pass to SendTab
lib/
└── queries/
    └── company.ts                      # OPTIONAL: add whatsapp config fetch helper if needed
supabase/
└── migrations/
    └── 20260526xxxxxx_phase81_whatsapp_delivery_channel.sql   # NEW: ALTER CONSTRAINT channel + provider
tests/
└── unit/
    └── api/
        └── send-whatsapp.test.ts       # NEW: route handler tests (mirrors handler.test.ts pattern)
    └── workspace/
        └── send-form.whatsapp.test.tsx # NEW: tab visibility + form submit tests
```

### Pattern 1: Prop threading (mirror `smsDeliveryEnabled` exactly)

**What:** A single boolean prop threaded from server page → workspace → tab → form, derived once on the server.

**When to use:** Always for entitlement / feature gates that depend on company state. Avoids client-side DB lookups and avoids prop drilling alternative state (tier/status separately).

**Trace:**
```
app/(app)/projects/[id]/page.tsx (line 106: `smsDeliveryEnabled = (company?.sms_delivery_enabled as boolean) ?? false`)
  → <ProjectWorkspace smsDeliveryEnabled={smsDeliveryEnabled} />
components/workspace/project-workspace.tsx (line 37: `smsDeliveryEnabled?: boolean`, line 166: `smsDeliveryEnabled={smsDeliveryEnabled}`)
  → <SendTab smsDeliveryEnabled={smsDeliveryEnabled} />
components/workspace/send/send-tab.tsx (line 21: prop, line 67: passed to SendForm)
  → <SendForm smsDeliveryEnabled={smsDeliveryEnabled} />
components/workspace/send/send-form.tsx (line 50: prop, lines 161 + 237: conditional render)
```

**Example (for the new prop):**
```typescript
// app/(app)/projects/[id]/page.tsx — additions in ProjectTabs() async sub-component
const supabase = await createClient()

// 1. existing companies query — extend select to include tier
const { data: company } = await supabase
  .from('companies')
  .select('name, owner_name, brand_primary_color, /* ... */, sms_delivery_enabled, tier')
  .eq('id', project.company_id)
  .single()

// 2. new query: company_whatsapp status (one row per company; .maybeSingle())
const { data: waConfig } = await supabase
  .from('company_whatsapp')
  .select('status')
  .eq('company_id', project.company_id)
  .maybeSingle()

// 3. derive the gate (matches UI-SPEC formula verbatim)
import { getEntitlements } from '@/lib/entitlements'
const tier = (company?.tier as string | null) ?? 'free'
const entitlements = getEntitlements(tier)
const whatsappSendEnabled =
  entitlements.whatsappEnabled && waConfig?.status === 'active'

// 4. pass down
<ProjectWorkspace whatsappSendEnabled={whatsappSendEnabled} /* ... */ />
```
Source: synthesis of `app/(app)/projects/[id]/page.tsx` lines 96-152 + `lib/entitlements.ts` + UI-SPEC formula.

### Pattern 2: API route mirrors `send-sms/route.ts`

**What:** Server route handler with auth → input validation → ownership query → consolidated check → entitlement check → provider call → success/failure log to `estimate_deliveries` → side-effect updates (`estimates.sent_at`, `estimate_activity`).

**Example skeleton for `app/api/estimates/[id]/send-whatsapp/route.ts`:**
```typescript
// Source: app/api/estimates/[id]/send-sms/route.ts (full file, lines 1-171)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { getEntitlements } from '@/lib/entitlements'

const E164_RE = /^\+[1-9]\d{7,14}$/

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { to, message } = await request.json() as { to: string; message?: string }
    if (!to || !E164_RE.test(to)) {
      return NextResponse.json({ error: 'Valid phone number in E.164 format required' }, { status: 400 })
    }

    // 1. Load estimate + ownership
    const result = await getEstimateWithContext(supabase, id)
    if (!result || !result.company) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    const { estimate, project, company } = result

    if (estimate.workflow_status !== 'consolidated') {
      return NextResponse.json({ error: 'Consolidate this estimate before sending it.' }, { status: 409 })
    }

    // 2. Entitlement + connection gate (mirror UI-SPEC `whatsappSendEnabled` formula)
    const tier = (company.tier as string | null) ?? 'free'
    if (!getEntitlements(tier).whatsappEnabled) {
      // HTTP 402 triggers the global UpgradeModal (Phase 59)
      return NextResponse.json({ error: 'WhatsApp delivery is not available on your current plan.' }, { status: 402 })
    }
    const { data: waConfig } = await supabase
      .from('company_whatsapp')
      .select('status, delivery_format')
      .eq('company_id', estimate.company_id)
      .maybeSingle()
    if (!waConfig || waConfig.status !== 'active') {
      return NextResponse.json({ error: 'Connect a WhatsApp number first in Settings → Integrations.' }, { status: 409 })
    }

    // 3. Send via provider (branch by delivery_format)
    const deliveryFormat = waConfig.delivery_format as 'share_link' | 'formatted_text' | 'pdf_attachment'
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/estimate/${estimate.share_token}`
    // ... build text/document payload per format ...
    // ... wrap try/catch around sendWhatsAppMessage(to, payload) ...
    // ... pdf_attachment branch: try generateAndUploadEstimatePDF → fall back to share_link on failure (mirror confirm.ts handleSend lines 376-432) ...

    // 4. Log delivery to estimate_deliveries (service role for service-role bypass on inserts)
    const svc = requireServiceClient()
    await svc.from('estimate_deliveries').insert({
      estimate_id: estimate.id,
      company_id: estimate.company_id,
      channel: 'whatsapp',           // ← REQUIRES the migration
      recipient_phone: to,
      provider: 'meta',              // ← REQUIRES the migration
      provider_message_id: null,     // Meta sendMessages returns no message id today (sendWhatsAppMessage is void)
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    // 5. Update sent_at + log activity (mirror send-sms lines 151-164)
    await supabase.from('estimates').update({ sent_at: new Date().toISOString() }).eq('id', id).is('sent_at', null)
    await svc.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: estimate.company_id,
      estimate_id: estimate.id,
      event_type: 'estimate_sent',
      metadata: { channel: 'whatsapp', to, delivery_format: deliveryFormat },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Send WhatsApp error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Pattern 3: Delivery-format branching (mirror `lib/whatsapp/confirm.ts:handleSend`)

The exact branching logic for `share_link` / `formatted_text` / `pdf_attachment` lives in `confirm.ts` lines 376-432. The new route MUST mirror this:

```typescript
// Source: lib/whatsapp/confirm.ts lines 376-432
if (deliveryFormat === 'pdf_attachment') {
  let pdfDelivered = false
  try {
    const { signedUrl, filename } = await generateAndUploadEstimatePDF(
      estimate.id, estimate.company_id, supabase, clientName,
    )
    await sendWhatsAppMessage(to, {
      type: 'document',
      document: { link: signedUrl, filename, caption: `Your estimate from ${company.name}` },
    })
    pdfDelivered = true
  } catch (err) {
    console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', err)
  }
  if (!pdfDelivered) {
    await sendWhatsAppMessage(to, { type: 'text', text: { body: buildShareLinkMessage(shareUrl, clientName) } })
  }
} else if (deliveryFormat === 'formatted_text') {
  const body = formatEstimateForWhatsApp(estimate as FormatterEstimate, clientName, company.name)
  await sendWhatsAppMessage(to, { type: 'text', text: { body } })
} else {
  // share_link (default)
  const body = buildShareLinkMessage(shareUrl, clientName)
  await sendWhatsAppMessage(to, { type: 'text', text: { body } })
}
```

### Pattern 4: Settings → Integrations server-component fetch

`WhatsAppConnectCard` accepts `initial: WhatsAppStatus | null`. The page must fetch from `company_whatsapp` on the server and pass the initial state.

```typescript
// app/(app)/settings/integrations/page.tsx (new shape)
import { createClient } from '@/lib/supabase/server'
import { WhatsAppConnectCard, type WhatsAppStatus } from '@/components/settings/whatsapp-connect-card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Integrations | Settings' }

export default async function SettingsIntegrationsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  let initial: WhatsAppStatus = null
  if (claims) {
    const { data: company } = await supabase
      .from('companies').select('id').eq('user_id', claims.sub).single()
    if (company) {
      const { data: row } = await supabase
        .from('company_whatsapp')
        .select('phone_number, phone_number_id, waba_id, status, delivery_format')
        .eq('company_id', company.id)
        .maybeSingle()
      if (row) {
        initial = {
          phoneNumber: row.phone_number as string,
          phoneNumberId: row.phone_number_id as string,
          wabaId: row.waba_id as string,
          status: row.status as string,
          deliveryFormat: row.delivery_format as 'share_link' | 'formatted_text' | 'pdf_attachment',
        }
      }
    }
  }
  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Integrations</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Connect outbound channels for sending estimates and receiving client messages.</T>
        </p>
      </header>
      <div className="space-y-6">
        <WhatsAppConnectCard initial={initial} />
      </div>
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Do NOT modify `WhatsAppConnectCard`.** UI-SPEC locks this — re-using the card is the contract.
- **Do NOT render a `disabled` WhatsApp tab.** When `whatsappSendEnabled === false`, hide it entirely (matches SMS pattern lines 161 + 237 of `send-form.tsx`).
- **Do NOT add a delivery-format selector to the SendForm WhatsApp tab.** The format is single-source-of-truth on the connect card.
- **Do NOT call `/api/estimates/[id]/pdf` internally** for the `pdf_attachment` branch. Use `generateAndUploadEstimatePDF()` from `lib/whatsapp/pdf-delivery.ts` (it accepts an injected `supabase` client; the internal API requires auth cookies).
- **Do NOT re-implement `formatEstimateForWhatsApp()`** — reuse `lib/whatsapp/formatter.ts`. The function already handles i18n (en/pt/es) and currency formatting.
- **Do NOT log Meta access tokens, signed URLs, or phone-number-IDs to console** in error paths. Sanitize error messages.
- **Do NOT reuse `MessageSquare` icon** for the WhatsApp tab — `MessageSquare` is owned by SMS. Use `MessageCircle`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Outbound WhatsApp message dispatch | Custom Meta Graph API fetch | `sendWhatsAppMessage()` from `lib/whatsapp/client.ts` | Already implements env-token read, error mapping, fire-and-forget for typing/read receipts |
| WhatsApp formatted-text estimate body | Custom string builder | `formatEstimateForWhatsApp()` from `lib/whatsapp/formatter.ts` | i18n labels (en/pt/es), currency formatting via `formatMoney`, share-link / payment terms / timeline integration |
| PDF generation + upload + signed URL | `puppeteer`, custom storage upload, or calling internal API | `generateAndUploadEstimatePDF()` from `lib/whatsapp/pdf-delivery.ts` | Phase 53 already wired @react-pdf/renderer + storage abstraction (`createStorage`) + 24h signed URL + filename sanitization |
| Entitlement / tier resolution | Custom tier→features map | `getEntitlements(tier)` from `lib/entitlements.ts` | Single source of truth — Phase 55 + Phase 57 enforce this |
| Phone E.164 validation | Custom regex | Reuse `/^\+[1-9]\d{7,14}$/` from `send-form.tsx` line 36 / `send-sms/route.ts` line 11 | Established, tested, matches WhatsApp + Meta requirements |
| Phone input mask UI | Manual `<input type="tel">` | `<PhoneInput>` from `components/ui/phone-input.tsx` | Already used by SMS tab, handles iOS Safari `inputMode="tel"` |
| Delivery audit | Custom logging table | `estimate_deliveries` (existing table) — extend `channel` + `provider` enums | One uniform delivery history surface |
| Toast notifications | Custom alerts | `sonner` `toast.success()` / `toast.error()` | Established (`send-form.tsx` line 24) |

**Key insight:** Every layer of this feature already exists in the codebase. The phase is composition + glue, not building. The two NEW files are the API route (mirrors `send-sms/route.ts`) and the migration (mirrors `20260511000003_phase53_pdf_attachment.sql` constraint-extension pattern).

## Runtime State Inventory

**This phase is greenfield in code terms (new route, new tab, schema extension).** No rename / refactor / migration. No existing runtime state needs updating.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `company_whatsapp` rows already exist for connected companies. They already carry `delivery_format`. **No data migration needed.** | None |
| Live service config | Meta Cloud API (the `WhatsApp Business` app at `developers.facebook.com`) — already configured for the platform per Phase 40-45. Webhook endpoint `/api/webhooks/whatsapp` already verified. **No live service change required for Phase 81** because outbound sends use the same access token already wired. | None — verified by `app/api/webhooks/whatsapp/route.ts` line 20 (verify token) and `lib/whatsapp/client.ts` lines 13-15 (access token + phone number id) |
| OS-registered state | None — no Windows Task Scheduler / pm2 / systemd / launchd state touches this phase | None |
| Secrets/env vars | `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN` — all already in `.env.local` / Vercel env vars per Phase 40. **No new env vars required.** Phase 81 reads only what Phase 40-54 already wired. | None |
| Build artifacts / installed packages | None — no `pip`, no compiled binaries, no Docker image tags. The Next.js build will pick up the new route/migration automatically. | None — verified by `package.json`: no new packages required |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* — **Answer: nothing.** This is an additive feature, not a rename.

## Common Pitfalls

### Pitfall 1: Forgetting the `estimate_deliveries.channel` CHECK constraint migration

**What goes wrong:** New route runs, calls `sendWhatsAppMessage()` successfully, then the `INSERT INTO estimate_deliveries` fails with `new row for relation "estimate_deliveries" violates check constraint "estimate_deliveries_channel_check"`. WhatsApp message went out, audit row didn't. Silent partial success.

**Why it happens:** `20260519000003_estimate_deliveries.sql` line 15 limits channel to `('email', 'sms')`. The new route inserts `channel: 'whatsapp'`.

**How to avoid:** Ship the migration FIRST (Wave 0) before any route code. Mirror `20260511000003_phase53_pdf_attachment.sql` constraint extension exactly: DROP CONSTRAINT + ADD CONSTRAINT in a single migration.

**Warning signs:** Unit tests fail at the INSERT step but the mock `sendWhatsAppMessage` succeeds.

### Pitfall 2: PDF attachment fallback dropping silently to share_link

**What goes wrong:** The pdf_attachment branch fails (storage upload, signed URL, or Meta document send), falls back to share_link, but the `estimate_deliveries` row records `status: 'sent'` with no indication that the format was downgraded. Owner thinks their client got a PDF.

**Why it happens:** Mirroring the `confirm.ts:handleSend` pattern faithfully — that pattern (lines 376-432) has the same gap. The owner WhatsApp message in `confirm.ts` doesn't tell the owner "we tried PDF and fell back".

**How to avoid:** Record `metadata.delivery_format` AND `metadata.actually_delivered_format` (e.g. `'pdf_attachment'` requested, `'share_link'` actually sent) in `estimate_activity` and/or `estimate_deliveries.metadata` so the audit trail is honest. Consider surfacing a `pdf_attachment_fallback` toast on the client side if the route response indicates a fallback. **Planner decision.**

**Warning signs:** Client received a share link when the connect card showed `pdf_attachment` selected.

### Pitfall 3: Sending to free-tier users when `company_whatsapp` row exists from a prior trial

**What goes wrong:** Owner was on `trial` tier, connected WhatsApp, then trial expired and tier downgraded to `free`. `company_whatsapp.status === 'active'` is unchanged, but `getEntitlements('free').whatsappEnabled === false`. UI hides the tab correctly (per UI-SPEC formula `entitlements.whatsappEnabled && status === 'active'`), but a malicious client could still hit `POST /api/estimates/[id]/send-whatsapp` directly.

**Why it happens:** UI-only gating is never sufficient. Server-side gate is mandatory.

**How to avoid:** The route MUST re-check `getEntitlements(tier).whatsappEnabled === true` AND `company_whatsapp.status === 'active'` before any send. Return HTTP 402 for entitlement failure (triggers global `UpgradeModal` per Phase 59) and HTTP 409 for status failure.

**Warning signs:** Free-tier users seeing WhatsApp sends succeed.

### Pitfall 4: HTTP 402 wired correctly

**What goes wrong:** Returning 403 instead of 402 for entitlement failures. The global `UpgradeModal` from Phase 59 (line of `STATE.md`: "UpgradeModal uses window.fetch monkey-patch returning null — invisible effect-only component intercepts 402 from AI routes") intercepts 402, not 403.

**Why it happens:** Easy to default to 403 for "forbidden". Phase 57 / REQUIREMENTS.md decision is "HTTP 402 for quota-exceeded responses (not 403)".

**How to avoid:** Use 402 specifically for "tier-blocked" responses. Use 409 for "consolidation required" and "not connected".

### Pitfall 5: PhoneInput onChange storing formatted (not E.164) value

**What goes wrong:** `<PhoneInput value={field.value} onChange={...} />` — the component emits the masked string (e.g. `+1 (555) 123-4567`). If you store that directly, the zod schema `/^\+[1-9]\d{7,14}$/` fails.

**Why it happens:** SMS already solved this in `send-form.tsx` lines 248-253: `field.onChange(formatted.replace(/[^\d+]/g, ''))`.

**How to avoid:** Copy the SMS pattern verbatim for the WhatsApp tab.

**Warning signs:** Form validation errors on a phone that "looks fine" in the input.

### Pitfall 6: Outbound send from the platform's WhatsApp number confusing the recipient

**What goes wrong:** Client receives a WhatsApp message from Xtimator's platform number, not from the business owner's WhatsApp Business number that they "connected" in settings. Client thinks the estimate came from Xtimator, not from "ABC Roofing".

**Why it happens:** `sendWhatsAppMessage()` (lib/whatsapp/client.ts) reads `META_WHATSAPP_PHONE_NUMBER_ID` from env globally. The per-company `company_whatsapp.phone_number_id` is not threaded through.

**How to avoid:** The text body already embeds `companyName` (via `buildShareLinkMessage` and `formatEstimateForWhatsApp`). For MVP this is sufficient. If multi-tenant outbound is critical, file a follow-up phase to refactor `sendWhatsAppMessage()` to accept `phoneNumberId` and have each call site read `company_whatsapp.phone_number_id`. **Planner decision (recommendation: ship MVP, file follow-up).**

**Warning signs:** Owner complains "the client says the message came from a number they don't recognize".

### Pitfall 7: `sendWhatsAppMessage()` returns void — no `provider_message_id`

**What goes wrong:** SMS records `provider_message_id: twilioData.sid`. The current `sendWhatsAppMessage()` signature is `Promise<void>` — no return value. The `estimate_deliveries.provider_message_id` column will be `null` for every WhatsApp delivery.

**Why it happens:** `lib/whatsapp/client.ts:sendWhatsAppMessage` discards the Meta response.

**How to avoid:** Either (a) extend `sendWhatsAppMessage()` to return the parsed Meta response `messages[0].id`, OR (b) accept `null` for the WhatsApp branch. The column is nullable. **Recommendation:** ship (b) for Phase 81; file follow-up to enrich the client function. Note this in PLAN.md so it doesn't surface as a "missing feature" later.

### Pitfall 8: shadcn `Tabs` overflow on mobile with 3 tabs

**What goes wrong:** Three tabs (Email · SMS · WhatsApp) on a 360px viewport overflow. UI-SPEC says "Tabs already scroll horizontally if they overflow; with three tabs at 44px touch height there is no overflow at 360px viewport". But labels translated to PT or ES may be longer (e.g. "WhatsApp" + "Correo" + "SMS" — actually fine; but if "WhatsApp" turned into a longer locale string it could break).

**Why it happens:** Phase 71 made tabs scroll horizontally with momentum scroll. Default behavior is correct.

**How to avoid:** Test at 360px viewport with PT-BR active. The current `TabsList className="mb-4"` (line 156 of send-form.tsx) does NOT set `overflow-x-auto`. Confirm shadcn Tabs handles overflow internally (it does via `inline-flex`). No action needed unless overflow is observed.

## Code Examples

Verified patterns from this codebase (sources cited inline):

### Send tab third tab + form skeleton

```typescript
// Source: components/workspace/send/send-form.tsx (lines 35-38, 155-167, 237-289)
// Existing SMS schema + tab — copy this pattern for WhatsApp

const sendWhatsAppSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +15551234567)'),
  message: z.string().optional(),
})
type SendWhatsAppValues = z.infer<typeof sendWhatsAppSchema>

const whatsappForm = useForm<SendWhatsAppValues>({
  resolver: zodResolver(sendWhatsAppSchema) as any,
  defaultValues: { to: clientPhone ?? '', message: '' },
})

async function onWhatsAppSubmit(values: SendWhatsAppValues) {
  setSending(true)
  try {
    const response = await fetch(`/api/estimates/${estimateId}/send-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: values.to, message: values.message }),
    })
    const data = await response.json()
    if (!response.ok) {
      toast.error(data.error ?? t('Failed to send via WhatsApp. Please try again.'))
      return
    }
    toast.success(t('Estimate sent via WhatsApp!'))
  } catch {
    toast.error(t('Failed to send via WhatsApp. Please try again.'))
  } finally {
    setSending(false)
  }
}

// In the TabsList:
{whatsappSendEnabled && (
  <TabsTrigger value="whatsapp" className="gap-2">
    <MessageCircle className="h-4 w-4" />
    WhatsApp
  </TabsTrigger>
)}

// And the matching TabsContent — copy the SMS TabsContent structure exactly,
// just swap onSubmit / icon / label / helper copy.
```

### Migration for channel + provider enum extension

```sql
-- Source: supabase/migrations/20260511000003_phase53_pdf_attachment.sql (pattern)
-- File: supabase/migrations/20260526xxxxxx_phase81_whatsapp_delivery_channel.sql

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp'));

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio', 'meta'));
```

### TypeScript types — manual extension (Phase 19 convention)

```typescript
// types/database.types.ts — manually extend per Phase 19/24 convention
// (Docker unavailable on Windows; supabase gen types needs Docker)
// Search for estimate_deliveries.channel/provider literals and add 'whatsapp' / 'meta'.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-level Meta SDK init | Per-call env read inside `sendWhatsAppMessage()` | Phase 40 | Pattern reused by Phase 81 — call from new route is identical |
| `puppeteer` for PDF | `@react-pdf/renderer` via `lib/whatsapp/pdf-delivery.ts` | Phase 53 | Phase 81 reuses; no puppeteer needed |
| Inline `supabase.storage.from(...)` calls | `lib/storage` provider abstraction | Phase 66 | Phase 81 doesn't add new storage calls; pdf-delivery already uses the abstraction |
| Inline AI work in API routes (10s timeout) | Inngest background jobs for AI | Phase 67 | Phase 81 outbound send is <2s — does NOT need Inngest (no AI call) |
| HTTP 403 for quota | HTTP 402 for quota (UpgradeModal interception) | Phase 59 | Phase 81 follows: 402 for entitlement, 409 for connection status |

**Deprecated/outdated:** Nothing relevant to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sendWhatsAppMessage()` is acceptable for Phase 81 outbound (platform-number send) — multi-tenant per-company sending deferred to follow-up | Deferred Ideas + Pitfall 6 | If user expects "the message comes from MY business number", they will be unhappy at UAT. Mitigation: companyName is embedded in the message body. **User confirmation recommended.** |
| A2 | Free-tier 402 response will trigger the existing `UpgradeModal` (Phase 59) — the modal monkey-patches `window.fetch` and intercepts 402 from AI routes | Pattern 2 + Pitfall 4 | If the modal's selector is path-specific (e.g. only `/api/generate-estimate`), it might not catch `/api/estimates/[id]/send-whatsapp`. Mitigation: planner should verify Phase 59 modal's interception path is broad enough, or wire an inline upgrade toast. |
| A3 | `estimate_deliveries.recipient_phone` is sufficient for WhatsApp (no new column needed) | Pattern 2 | Low risk — phone is the only WhatsApp recipient identifier. |
| A4 | `sendWhatsAppMessage()` `Promise<void>` is acceptable; `provider_message_id` stays NULL for WhatsApp rows | Pitfall 7 | Low risk for MVP. Future analytics that need provider message IDs will require enriching the client function. |
| A5 | The migration's CHECK extension does not break existing `('email', 'sms')` rows | Code Examples | Verified — DROP + ADD is the established pattern (Phase 53 did the same for delivery_format). |
| A6 | `getEntitlements(tier).whatsappEnabled` is the correct gate for outbound (matches inbound gate in `handler.ts` line 198) | Pattern 1, Pattern 2 | Verified — `lib/entitlements.ts` shows `whatsappEnabled` is per-tier flag, used by `handler.ts` (inbound) — symmetric outbound use is correct. |
| A7 | `MessageCircle` is the right icon — visually distinct from SMS's `MessageSquare` | UI-SPEC | UI-SPEC locks this. Both icons confirmed to exist in lucide-react@1.8.0 runtime. |
| A8 | The current `app/(app)/settings/integrations/page.tsx` is a placeholder with no other content to preserve | Settings → Integrations | Verified — the file is 22 lines, all placeholder content. No state lost in replacement. |

## Open Questions

1. **Should outbound WhatsApp record a `usage_event` (quota)?**
   - What we know: Phase 57 enforces inbound free-tier WhatsApp at the handler. Outbound is currently uncounted (matches SMS).
   - What's unclear: Business decision — does each outbound WhatsApp send cost the platform money? (Meta Cloud API: ~$0.005 per business-initiated session, varies by region.)
   - Recommendation: SKIP for Phase 81. Mirror SMS (no quota). File a follow-up if Meta costs become material.

2. **Should the PDF fallback indicator surface in the UI?**
   - What we know: `pdf_attachment` failures fall back silently to `share_link` (mirrors `confirm.ts:handleSend`).
   - What's unclear: UX best practice — should the API return `{ success: true, deliveredAs: 'share_link', requested: 'pdf_attachment' }` and the toast say "Estimate sent via WhatsApp (share link — PDF generation failed)"?
   - Recommendation: planner decision. Lean toward honest UX (include the fallback hint in toast) given the dollar impact of a misleading "PDF sent" claim.

3. **Provider value `'meta'` vs `'meta_whatsapp'` for `estimate_deliveries.provider`?**
   - What we know: The platform integration uses `'meta_whatsapp'` in `IntegrationProvider` (lib/platform-config.ts line 44).
   - What's unclear: Convention — `provider` column tends to be coarser-grained ("resend" not "resend_email"). `'meta'` is consistent.
   - Recommendation: `'meta'`. Reusable if Meta Messenger / Instagram channels are added later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `lucide-react` (`MessageCircle`) | New WhatsApp tab trigger | ✓ | 1.8.0 [VERIFIED: `node -e "console.log(require('lucide-react/package.json').version)"`] | — |
| `@react-pdf/renderer` | `generateAndUploadEstimatePDF` | ✓ | 4.4.0 | — |
| `lib/storage` (Supabase provider) | PDF upload + signed URL | ✓ | Active (Phase 66) | — |
| `lib/inngest` | Not used by Phase 81 outbound (no AI work) | — | — | — |
| Meta Cloud API (`graph.facebook.com/v21.0`) | `sendWhatsAppMessage()` for outbound | ✓ | v21.0 — already wired in Phase 40 | — |
| `META_WHATSAPP_ACCESS_TOKEN` env var | `sendWhatsAppMessage` token | ✓ on dev (already set per Phase 40) | n/a | Admin-stored `getIntegrationKey('meta_whatsapp')` fallback per `platform-config.ts` |
| `META_WHATSAPP_PHONE_NUMBER_ID` env var | `sendWhatsAppMessage` URL path | ✓ on dev (already set per Phase 40) | n/a | None — env-only |
| Supabase (PostgreSQL + Storage + RLS) | Schema migration + queries | ✓ | — | None — required |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — Phase 81 is fully additive on infrastructure that Phases 40-71 already shipped.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.4` + `@vitejs/plugin-react@^6.0.1` + jsdom + `@testing-library/react@^16.3.2` [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- tests/unit/api/send-whatsapp.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WA-SEND-01 | Tab rendered iff `whatsappSendEnabled === true`; hidden iff false | unit (RTL render) | `npm test -- tests/unit/workspace/send-form.whatsapp.test.tsx -t "renders tab"` | ❌ Wave 0 |
| WA-SEND-01 | Tab uses `MessageCircle` icon (visually distinct from SMS `MessageSquare`) | unit (DOM query) | `npm test -- tests/unit/workspace/send-form.whatsapp.test.tsx -t "icon"` | ❌ Wave 0 |
| WA-SEND-02 | `whatsappSendEnabled` prop threads end-to-end | typecheck (`tsc --noEmit`) + unit | `npm test -- tests/unit/workspace/project-workspace-props.test.tsx` (new) | ❌ Wave 0 |
| WA-SEND-03 | Route 401 on missing auth | unit (route handler) | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "401"` | ❌ Wave 0 |
| WA-SEND-03 | Route 400 on bad E.164 phone | unit | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "E.164"` | ❌ Wave 0 |
| WA-SEND-03 | Route 409 on non-consolidated estimate | unit | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "consolidated"` | ❌ Wave 0 |
| WA-SEND-04 | Branches into `share_link` / `formatted_text` / `pdf_attachment` correctly based on `company_whatsapp.delivery_format` | unit (mock `sendWhatsAppMessage`, assert called with correct body shape per branch) | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "delivery_format"` | ❌ Wave 0 |
| WA-SEND-04 | `pdf_attachment` falls back to `share_link` on `generateAndUploadEstimatePDF` throw | unit (mock pdf-delivery to throw) | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "pdf fallback"` | ❌ Wave 0 |
| WA-SEND-05 | Free-tier returns HTTP 402 | unit | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "402 entitlement"` | ❌ Wave 0 |
| WA-SEND-05 | Inactive `company_whatsapp.status` returns HTTP 409 | unit | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "409 not active"` | ❌ Wave 0 |
| WA-SEND-06 | Successful send inserts `estimate_deliveries` with `channel='whatsapp'`, `provider='meta'` | unit (spy on supabase mock) | `npm test -- tests/unit/api/send-whatsapp.test.ts -t "logs delivery"` | ❌ Wave 0 |
| WA-SEND-06 | Migration applies cleanly + accepts `('email', 'sms', 'whatsapp')` and `('resend', 'twilio', 'meta')` | manual + smoke INSERT in dev DB | `npx supabase db push --db-url $DATABASE_URL` then `psql -c "INSERT INTO estimate_deliveries (...) VALUES (..., 'whatsapp', ..., 'meta', ...)"` | manual-only (DB migration) |
| WA-INT-01 | `/settings/integrations` mounts `<WhatsAppConnectCard initial={null}>` when company has no row | unit (RTL render) | `npm test -- tests/unit/settings/integrations-page.test.tsx -t "not connected"` | ❌ Wave 0 |
| WA-INT-01 | Page passes existing `company_whatsapp` row as `initial` when row exists | unit | `npm test -- tests/unit/settings/integrations-page.test.tsx -t "connected"` | ❌ Wave 0 |
| WA-INT-02 | Header copy matches UI-SPEC verbatim | unit (text query) | `npm test -- tests/unit/settings/integrations-page.test.tsx -t "header copy"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- tests/unit/api/send-whatsapp.test.ts tests/unit/workspace/send-form.whatsapp.test.tsx tests/unit/settings/integrations-page.test.tsx` (estimated <15s)
- **Per wave merge:** `npm test` (full suite — vitest, runs in <2min for this codebase)
- **Phase gate:** Full suite green + manual smoke (1× WhatsApp send each format against a dev WABA number) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/api/send-whatsapp.test.ts` — covers WA-SEND-03, WA-SEND-04, WA-SEND-05, WA-SEND-06 (route behavior)
- [ ] `tests/unit/workspace/send-form.whatsapp.test.tsx` — covers WA-SEND-01 (tab visibility + icon + form submit happy path)
- [ ] `tests/unit/settings/integrations-page.test.tsx` — covers WA-INT-01, WA-INT-02 (page mounts card + correct header)
- [ ] Optional: `tests/unit/workspace/project-workspace-props.test.tsx` — covers WA-SEND-02 prop threading (low value — typecheck `tsc --noEmit` catches this for free)

*(If no gaps: "None — existing test infrastructure covers all phase requirements")* — gaps listed above.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getClaims()` (matches `send-sms/route.ts` line 23) |
| V3 Session Management | no | session cookies handled by Supabase SSR; no new session surface |
| V4 Access Control | yes | RLS-scoped ownership check via `getEstimateWithContext` + explicit `company_id` match; entitlement gate via `getEntitlements(tier).whatsappEnabled`; status gate via `company_whatsapp.status === 'active'` |
| V5 Input Validation | yes | zod schema on request body: `to` E.164 regex, `message` optional string |
| V6 Cryptography | no (no new crypto) — existing platform-config AES-GCM decrypt for Meta token is reused unchanged | — |
| V7 Error Handling and Logging | yes | error responses sanitized (no Meta token / phone-number-id / signed URL leakage); successful + failed sends logged to `estimate_deliveries` |
| V8 Data Protection | yes | Meta access token never enters RSC payload — only used server-side in `sendWhatsAppMessage`; 24h signed URL for PDF (storage layer enforces expiry) |
| V13 API and Web Service | yes | route is a POST under `/api/estimates/[id]/...` mirroring existing pattern; ownership tied to authenticated user's company via Supabase RLS |

### Known Threat Patterns for {Next.js App Router + Supabase + Meta Cloud API}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Recipient phone tampering — caller sends a phone they don't control | Spoofing | This is by design (owner picks the recipient — no tamper-evidence needed). However, ownership check on the estimate must be strict: `getEstimateWithContext` returns null if the company doesn't belong to the authenticated user. |
| Message body injection / template escape | Tampering | WhatsApp text messages are NOT templated for free-form sends to opted-in numbers (per Meta Cloud API). However, the `message` from the user is concatenated into a plain text body; no SQL, no shell, no HTML interpolation. **Low risk.** |
| PDF link leakage to unauthorized recipients | Information Disclosure | Signed URLs are 24h-scoped; the URL embeds the share path which is unguessable. Mitigated by storage abstraction layer (`createStorage` + explicit `expiresInSeconds`). |
| Cross-tenant data leakage (sending estimate X from company A to a number associated with company B) | Information Disclosure | Mitigated by `getEstimateWithContext` ownership check + RLS on `estimates` table. |
| Rate limiting / spam abuse on paid channel | DoS / Cost | Not currently rate-limited per-company. Phase 47 `lib/ratelimit` exists. **Planner decision:** add `rateLimit('whatsappSendPerHour', companyId)` to the new route? Recommendation: ship with no rate limit for MVP (matches SMS), file follow-up if abuse observed. Audit trail in `estimate_deliveries` makes abuse detectable. |
| Audit trail completeness | Repudiation | Every send (success OR failure) writes a row to `estimate_deliveries`. `estimate_activity` records the event. Owner cannot deny they sent the estimate. |
| Secret leakage in error responses | Information Disclosure | Sanitize `error_message` field in `estimate_deliveries` to NEVER include Meta access token, phone-number-id, or full Meta API response (extract `error.message` only). |
| Free-tier bypass | Authorization | HTTP 402 gate on tier + HTTP 409 gate on status, both server-side. UI tab hide is defense-in-depth, not the primary control. |

## Sources

### Primary (HIGH confidence)
- `components/workspace/send/send-form.tsx` (full file, 310 lines) — existing SendForm with Email + SMS tabs, validation, sonner toasts, entitlement gating via `smsDeliveryEnabled`
- `components/workspace/send/send-tab.tsx` (full file, 82 lines) — parent that threads `smsDeliveryEnabled` and `disabled={isDraft}` to SendForm
- `components/workspace/project-workspace.tsx` (full file, 178 lines) — threads `smsDeliveryEnabled` prop from page → SendTab
- `app/(app)/projects/[id]/page.tsx` (full file, 162 lines) — server page that resolves `smsDeliveryEnabled` from `companies.sms_delivery_enabled`
- `components/settings/whatsapp-connect-card.tsx` (full file, 419 lines) — shipped card, do not modify
- `app/(app)/settings/integrations/page.tsx` (current file, 22 lines) — placeholder being replaced
- `app/api/estimates/[id]/send-sms/route.ts` (full file, 171 lines) — the API route mirror for the new send-whatsapp route
- `app/api/estimates/[id]/send/route.ts` (full file, 242 lines) — Email route pattern (delivery logging, sent_at, activity log)
- `lib/whatsapp/client.ts` (full file, 115 lines) — Meta Graph API client (sendWhatsAppMessage, markMessageAsRead, sendTypingIndicator, downloadWhatsAppMedia)
- `lib/whatsapp/confirm.ts` (full file, 489 lines) — `handleSend` is the canonical pattern for delivery-format branching (share_link/formatted_text/pdf_attachment)
- `lib/whatsapp/formatter.ts` (full file, 153 lines) — i18n estimate formatter for WhatsApp
- `lib/whatsapp/pdf-delivery.ts` (full file, 101 lines) — PDF generation + storage upload + signed URL
- `lib/whatsapp/handler.ts` (full file, 289 lines) — inbound entitlement gate (mirror for outbound)
- `lib/actions/whatsapp-settings.ts` (full file, 261 lines) — server actions used by WhatsAppConnectCard
- `lib/entitlements.ts` (full file, 72 lines) — tier-to-features mapping including `whatsappEnabled`
- `lib/queries/company.ts` lines 95-115 — `getCompanyTier`
- `lib/platform-config.ts` lines 38-50, 180-260 — `IntegrationProvider`, `getIntegrationKey`
- `lib/whatsapp/types.ts` — `WhatsAppMessage`, `WhatsAppPayload` types
- `supabase/migrations/20260510000002_phase40_whatsapp.sql` — `company_whatsapp` schema
- `supabase/migrations/20260510000004_phase44_delivery_format.sql` — `delivery_format` column added
- `supabase/migrations/20260511000003_phase53_pdf_attachment.sql` — DROP+ADD CONSTRAINT pattern reference for Phase 81's migration
- `supabase/migrations/20260519000003_estimate_deliveries.sql` — `estimate_deliveries` table + RLS + current CHECK constraints
- `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md` — the locked UI contract
- `.planning/STATE.md` — Phase 44/53/54/45 decisions and patterns
- `.planning/ROADMAP.md` — Phase dependencies (44, 45, 50, 53, 54, 59, 71)
- `package.json` — dependency versions
- `.planning/config.json` — Nyquist validation enabled

### Secondary (MEDIUM confidence)
- WhatsApp Cloud API v21.0 documentation (referenced by `lib/whatsapp/client.ts` and `lib/actions/whatsapp-settings.ts`) — message types `text` and `document`, `messaging_product: 'whatsapp'` required field, opted-in free-form messages don't need template approval
- Phase 57 STATE.md decision: "HTTP 402 for quota-exceeded responses (not 403)" — applies to outbound send tier-block

### Tertiary (LOW confidence)
- *(none — every claim in this research is backed by direct file inspection)*

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package is already installed and used by adjacent code; no version unknowns
- Architecture: HIGH — patterns are explicit in `send-sms/route.ts`, `confirm.ts`, `pdf-delivery.ts`, `formatter.ts`; this phase is composition, not invention
- Pitfalls: HIGH — every pitfall is grounded in a specific line of existing code or a documented Phase decision
- Validation: HIGH — vitest + RTL + jsdom already in use; route-handler tests follow `handler.test.ts` mocking pattern
- Security: HIGH — ASVS controls map directly to existing patterns (Supabase auth, RLS, signed URLs, sanitized errors)

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days — stable codebase patterns, Meta Cloud API v21.0 is current)
