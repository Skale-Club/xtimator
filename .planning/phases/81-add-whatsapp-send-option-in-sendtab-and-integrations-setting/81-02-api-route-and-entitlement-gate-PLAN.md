---
phase: 81
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - app/api/estimates/[id]/send-whatsapp/route.ts
  - tests/unit/whatsapp/send-route.test.ts
  - tests/unit/whatsapp/entitlement-gate.test.ts
autonomous: true
requirements:
  - WA-SEND-03
  - WA-SEND-04
  - WA-SEND-05
must_haves:
  truths:
    - "POST /api/estimates/[id]/send-whatsapp returns 401 without auth, 400 on bad phone, 409 on non-consolidated estimate, 402 on free-tier, 409 on inactive WA, 200 on success"
    - "Route reads company_whatsapp.delivery_format and branches into share_link / formatted_text / pdf_attachment"
    - "PDF generation failure falls back to share_link AND surfaces this in the JSON response as `fallback: 'share_link'`"
    - "Every successful send writes an estimate_deliveries row with channel='whatsapp' and provider='meta', plus an estimate_activity event_type='estimate_sent'"
    - "Outbound uses platform-global META_WHATSAPP_PHONE_NUMBER_ID (Locked Decision 1 — no per-company refactor)"
    - "No rate limiting wired (Locked Decision 3); no usage_event recorded (Locked Decision 4)"
  artifacts:
    - path: "app/api/estimates/[id]/send-whatsapp/route.ts"
      provides: "POST handler that mirrors send-sms/route.ts shape with WhatsApp-specific delivery_format branching and PDF→share_link fallback"
      exports: ["POST"]
      min_lines: 150
    - path: "tests/unit/whatsapp/send-route.test.ts"
      provides: "GREEN test suite — every it.todo from plan 81-01 is now a real it(...) with assertions that pass"
    - path: "tests/unit/whatsapp/entitlement-gate.test.ts"
      provides: "GREEN test suite — entitlement formula tested via the route handler's 402/409 paths"
  key_links:
    - from: "app/api/estimates/[id]/send-whatsapp/route.ts"
      to: "lib/whatsapp/client.ts:sendWhatsAppMessage"
      via: "import + call with type:'text'|'document'"
      pattern: "sendWhatsAppMessage\\("
    - from: "app/api/estimates/[id]/send-whatsapp/route.ts"
      to: "lib/whatsapp/pdf-delivery.ts:generateAndUploadEstimatePDF"
      via: "try/catch with share_link fallback"
      pattern: "generateAndUploadEstimatePDF\\("
    - from: "app/api/estimates/[id]/send-whatsapp/route.ts"
      to: "estimate_deliveries table"
      via: "requireServiceClient().from('estimate_deliveries').insert(...)"
      pattern: "channel: 'whatsapp'"
    - from: "app/api/estimates/[id]/send-whatsapp/route.ts"
      to: "lib/entitlements.ts:getEntitlements"
      via: "tier-based 402 check"
      pattern: "getEntitlements\\("
---

<objective>
Implement the server route that powers the Send tab's WhatsApp button (Wave 1, depends on 81-01 migration being applied).

This plan:
1. Creates `app/api/estimates/[id]/send-whatsapp/route.ts` mirroring `app/api/estimates/[id]/send-sms/route.ts` 1:1 (auth → input validation → ownership → consolidated check → entitlement gate → status gate → provider dispatch → delivery log → sent_at → activity log).
2. Branches by `company_whatsapp.delivery_format` into share_link / formatted_text / pdf_attachment, mirroring `lib/whatsapp/confirm.ts:handleSend` lines 376-432 verbatim.
3. Implements PDF→share_link fallback with explicit surfacing in the JSON response (`fallback: 'share_link'`) per Locked Decision 2.
4. Uses platform-global outbound number (`META_WHATSAPP_PHONE_NUMBER_ID` consumed inside `sendWhatsAppMessage`) per Locked Decision 1 — NO refactor of `lib/whatsapp/client.ts`.
5. NO rate limiting (Locked Decision 3); NO `recordUsage` call (Locked Decision 4).
6. Flips every `it.todo` in `tests/unit/whatsapp/send-route.test.ts` and `tests/unit/whatsapp/entitlement-gate.test.ts` to a real `it(...)` with passing assertions.

Purpose: This is the actual send mechanism — the prop in plan 81-03 is just a switch; this route is what carries the message.

Output: One new server route file + two GREEN test suites.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md
@app/api/estimates/[id]/send-sms/route.ts
@lib/whatsapp/confirm.ts
@lib/whatsapp/client.ts
@lib/whatsapp/formatter.ts
@lib/whatsapp/pdf-delivery.ts
@lib/queries/estimate.ts
@lib/entitlements.ts
@lib/supabase/server.ts
@lib/supabase/service.ts
@tests/unit/whatsapp/handler.test.ts
@tests/unit/whatsapp/pdf-delivery.test.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. -->

From `lib/whatsapp/client.ts` (function signature — DO NOT refactor):

```typescript
export async function sendWhatsAppMessage(
  to: string,
  body: TextMessage | DocumentMessage
): Promise<void>
```

Reads `process.env.META_WHATSAPP_ACCESS_TOKEN` and `process.env.META_WHATSAPP_PHONE_NUMBER_ID` at call time (platform-global per Locked Decision 1).

Note: returns `Promise<void>` — `provider_message_id` will be `null` on the delivery row (RESEARCH.md Pitfall 7 — accepted for MVP).

From `lib/whatsapp/formatter.ts`:

```typescript
import type { Estimate, EstimateSection } from '@/lib/queries/estimate'
export type FormatterEstimate = Estimate & { sections: EstimateSection[]; language?: string | null }
export function formatEstimateForWhatsApp(
  estimate: FormatterEstimate,
  clientName: string | null,
  companyName: string | null
): string
```

From `lib/whatsapp/pdf-delivery.ts`:

```typescript
export async function generateAndUploadEstimatePDF(
  estimateId: string,
  companyId: string,
  supabase: SupabaseClient,
  clientName: string | null,
): Promise<{ signedUrl: string; filename: string }>
```

Throws on any failure (storage upload, signed URL, PDF render). Caller MUST catch and fall back to share_link per `confirm.ts:handleSend` lines 376-432.

From `lib/queries/estimate.ts`:

```typescript
export async function getEstimateWithContext(
  supabase: SupabaseClient,
  estimateId: string,
): Promise<{ estimate: EstimateWithSections; project: Project; company: Company; client: Client | null } | null>
```

From `lib/entitlements.ts`:

```typescript
export function getEntitlements(tier: string): {
  whatsappEnabled: boolean
  // ... other fields
}
// 'free' returns whatsappEnabled: false; trial/pro/business return true
```

From `app/api/estimates/[id]/send-sms/route.ts` — canonical pattern to mirror (verbatim structure):

```typescript
// Lines 1-171: auth → body parse → estimate fetch → consolidated check → company fetch
// → sms_delivery_enabled gate (replace with entitlement + WA status gate)
// → provider config load (skip — sendWhatsAppMessage reads env)
// → provider call (replace fetch(twilioUrl) with sendWhatsAppMessage)
// → estimate_deliveries insert (channel='whatsapp', provider='meta')
// → estimates.sent_at update
// → estimate_activity insert
```

From `lib/whatsapp/confirm.ts` lines 376-432 — verbatim delivery_format branching:

```typescript
if (deliveryFormat === 'pdf_attachment') {
  let pdfDelivered = false
  try {
    const { signedUrl, filename } = await generateAndUploadEstimatePDF(estimateId, companyId, supabase, clientName)
    await sendWhatsAppMessage(to, { type: 'document', document: { link: signedUrl, filename, caption: `Your estimate from ${companyName}` } })
    pdfDelivered = true
  } catch (err) {
    console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', err)
  }
  if (!pdfDelivered) {
    await sendWhatsAppMessage(to, { type: 'text', text: { body: buildShareLinkMessage(shareUrl, clientName) } })
    // Phase 81 addition: caller must surface fallback in response — see Locked Decision 2.
  }
} else if (deliveryFormat === 'formatted_text') {
  const body = formatEstimateForWhatsApp(estimate as FormatterEstimate, clientName, companyName)
  await sendWhatsAppMessage(to, { type: 'text', text: { body } })
} else {
  // share_link (default)
  const body = buildShareLinkMessage(shareUrl, clientName)
  await sendWhatsAppMessage(to, { type: 'text', text: { body } })
}
```

`buildShareLinkMessage` is a local helper in `confirm.ts`. The new route reproduces it inline (or imports it if exported — check at implementation time and prefer reuse).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement POST /api/estimates/[id]/send-whatsapp route handler</name>
  <files>app/api/estimates/[id]/send-whatsapp/route.ts</files>
  <read_first>
    - `app/api/estimates/[id]/send-sms/route.ts` (FULL FILE — line-by-line mirror; 171 lines)
    - `lib/whatsapp/confirm.ts` lines 376-432 (canonical delivery_format branching with PDF fallback)
    - `lib/whatsapp/confirm.ts` lines 1-50 (find `buildShareLinkMessage` helper — reuse if exported, copy inline if not)
    - `lib/whatsapp/client.ts` (full file — confirm `sendWhatsAppMessage(to, body)` signature and TextMessage / DocumentMessage payload shapes)
    - `lib/whatsapp/formatter.ts` (function signature for `formatEstimateForWhatsApp`)
    - `lib/whatsapp/pdf-delivery.ts` (full file — confirm `generateAndUploadEstimatePDF(estimateId, companyId, supabase, clientName)` returns `{ signedUrl, filename }` and throws on failure)
    - `lib/queries/estimate.ts` (find `getEstimateWithContext` return type and field availability — verify `estimate.share_token`, `estimate.workflow_status`, `estimate.company_id`, `estimate.project_id`, `company.tier`, `company.name` are all available; if not, fall back to direct supabase queries as send-sms/route.ts does on lines 44-71)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Pattern 2: API route mirrors send-sms/route.ts" (full skeleton)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Common Pitfalls" (1, 2, 3, 4, 7)
  </read_first>
  <behavior>
    - **401** when `supabase.auth.getClaims()` returns null.
    - **400** when body cannot be parsed as JSON OR `to` does not match `/^\+[1-9]\d{7,14}$/`.
    - **404** when the estimate is not found or does not belong to the user's company.
    - **400** when `estimate.share_token` is null/empty (mirrors send-sms line 54-56).
    - **409** with body `{ error: 'Consolidate this estimate before sending it.' }` when `estimate.workflow_status !== 'consolidated'`.
    - **402** with body `{ error: 'WhatsApp delivery is not available on your current plan.' }` when `getEntitlements(companyTier).whatsappEnabled === false`. (T-81-06 mitigation — Pitfall 4. 402 triggers global UpgradeModal from Phase 59.)
    - **409** with body `{ error: 'Connect a WhatsApp number first in Settings → Integrations.' }` when `company_whatsapp.status !== 'active'` (or row missing).
    - On success: returns `{ success: true, fallback?: 'share_link' }`. `fallback` is included ONLY when `delivery_format` was `pdf_attachment` AND `generateAndUploadEstimatePDF` threw (Locked Decision 2).
    - On Meta provider call failure (sendWhatsAppMessage throws after at least one successful upload): inserts `estimate_deliveries` row with `status: 'failed'` and `error_message: <sanitized message — no token, no signed URL>`, returns 500.
    - Inserts `estimate_deliveries` row with `channel: 'whatsapp'`, `provider: 'meta'`, `recipient_phone: to`, `provider_message_id: null` (Pitfall 7 — sendWhatsAppMessage returns void), `status: 'sent'`, `sent_at: <ISO>`. Uses `requireServiceClient()` (mirrors send-sms line 118).
    - Updates `estimates.sent_at` only if currently null (mirrors send-sms line 151-155, `.is('sent_at', null)`).
    - Inserts `estimate_activity` row with `event_type: 'estimate_sent'`, `metadata: { channel: 'whatsapp', to, delivery_format: <requested>, actually_delivered_format: <actual — differs only when PDF fell back> }` (Pitfall 2 mitigation — honest audit trail).
    - NO call to `lib/ratelimit` (Locked Decision 3).
    - NO call to `recordUsage` (Locked Decision 4).
  </behavior>
  <action>
    Create `app/api/estimates/[id]/send-whatsapp/route.ts` with the following structure. Use `app/api/estimates/[id]/send-sms/route.ts` as the line-by-line scaffold; the diff from SMS is roughly: replace `getTwilioConfig`/`getBranding` import with `sendWhatsAppMessage`/`formatEstimateForWhatsApp`/`generateAndUploadEstimatePDF`/`getEntitlements`; replace `company.sms_delivery_enabled` gate with the entitlement + status gate; replace the Twilio fetch with the three-way delivery_format branch; change channel/provider literals.

    Implementation outline (executor: produce the full file from this outline; do NOT abbreviate):

    ```typescript
    import { NextResponse } from 'next/server'
    import { createClient } from '@/lib/supabase/server'
    import { requireServiceClient } from '@/lib/supabase/service'
    import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
    import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
    import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
    import { getEntitlements } from '@/lib/entitlements'

    interface SendWhatsAppRequestBody {
      to: string
      message?: string
    }

    const E164_RE = /^\+[1-9]\d{7,14}$/

    function buildShareLinkMessage(shareUrl: string, clientName: string | null, companyName: string): string {
      // Mirror lib/whatsapp/confirm.ts buildShareLinkMessage shape. If that helper is exported,
      // import it instead. Default copy: "${companyName} sent you an estimate. Review it here: ${shareUrl}"
      const greeting = clientName ? `Hi ${clientName}, ` : ''
      return `${greeting}${companyName} sent you an estimate. Review and approve it here: ${shareUrl}`
    }

    export async function POST(
      request: Request,
      { params }: { params: Promise<{ id: string }> }
    ) {
      try {
        const { id } = await params

        // 1. Auth
        const supabase = await createClient()
        const { data: claimsData } = await supabase.auth.getClaims()
        const claims = claimsData?.claims ?? null
        if (!claims) {
          return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        // 2. Body parse + E.164 validation
        let body: SendWhatsAppRequestBody
        try {
          body = await request.json()
        } catch {
          return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
        }
        const { to, message } = body
        if (!to || !E164_RE.test(to)) {
          return NextResponse.json(
            { error: 'Valid phone number in E.164 format required (e.g. +15551234567)' },
            { status: 400 }
          )
        }

        // 3. Estimate ownership + workflow gate (mirror send-sms 44-65)
        const { data: estimate } = await supabase
          .from('estimates')
          .select('id, project_id, company_id, share_token, workflow_status')
          .eq('id', id)
          .single()
        if (!estimate) {
          return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
        }
        if (!estimate.share_token) {
          return NextResponse.json({ error: 'Estimate has no share link' }, { status: 400 })
        }
        if (estimate.workflow_status !== 'consolidated') {
          return NextResponse.json(
            { error: 'Consolidate this estimate before sending it.' },
            { status: 409 }
          )
        }

        // 4. Company tier + entitlement + WA status (mirror send-sms 67-79, replace SMS gate)
        const { data: company } = await supabase
          .from('companies')
          .select('id, name, tier')
          .eq('id', estimate.company_id)
          .single()
        if (!company) {
          return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
        }
        const tier = (company.tier as string | null) ?? 'free'
        // T-81-06 mitigation: server-side entitlement gate (UI hide is defense-in-depth only).
        // 402 (not 403) so the global UpgradeModal from Phase 59 intercepts and shows upsell.
        if (!getEntitlements(tier).whatsappEnabled) {
          return NextResponse.json(
            { error: 'WhatsApp delivery is not available on your current plan.' },
            { status: 402 }
          )
        }
        const { data: waConfig } = await supabase
          .from('company_whatsapp')
          .select('status, delivery_format')
          .eq('company_id', estimate.company_id)
          .maybeSingle()
        if (!waConfig || waConfig.status !== 'active') {
          return NextResponse.json(
            { error: 'Connect a WhatsApp number first in Settings → Integrations.' },
            { status: 409 }
          )
        }

        // 5. Optionally load full estimate + project + client if formatted_text branch needs sections
        const deliveryFormat = (waConfig.delivery_format as 'share_link' | 'formatted_text' | 'pdf_attachment')
        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/estimate/${estimate.share_token}`

        // Determine clientName for caption / greeting — load project.client.name
        let clientName: string | null = null
        {
          const { data: project } = await supabase
            .from('projects')
            .select('client_id')
            .eq('id', estimate.project_id)
            .single()
          if (project?.client_id) {
            const { data: client } = await supabase.from('clients').select('name').eq('id', project.client_id).single()
            clientName = (client?.name as string | null) ?? null
          }
        }

        let actuallyDeliveredFormat: 'share_link' | 'formatted_text' | 'pdf_attachment' = deliveryFormat
        let fallback: 'share_link' | undefined

        try {
          if (deliveryFormat === 'pdf_attachment') {
            let pdfDelivered = false
            try {
              const { signedUrl, filename } = await generateAndUploadEstimatePDF(
                estimate.id, estimate.company_id, supabase, clientName,
              )
              await sendWhatsAppMessage(to, {
                type: 'document',
                document: {
                  link: signedUrl,
                  filename,
                  caption: company.name ? `Your estimate from ${company.name}` : 'Your estimate',
                },
              })
              pdfDelivered = true
            } catch (err) {
              console.error('[WhatsApp send-whatsapp] PDF delivery failed, falling back to share_link:', (err as Error)?.message ?? err)
            }
            if (!pdfDelivered) {
              await sendWhatsAppMessage(to, {
                type: 'text',
                text: { body: message?.trim() || buildShareLinkMessage(shareUrl, clientName, company.name) },
              })
              actuallyDeliveredFormat = 'share_link'
              fallback = 'share_link'
            }
          } else if (deliveryFormat === 'formatted_text') {
            // Load full estimate with sections for formatter
            const { data: full } = await supabase
              .from('estimates')
              .select('*, sections:estimate_sections(*, items:estimate_items(*))')
              .eq('id', estimate.id)
              .single()
            const formattedBody = formatEstimateForWhatsApp(full as unknown as FormatterEstimate, clientName, company.name)
            const finalBody = message?.trim() ? `${message.trim()}\n\n${formattedBody}` : formattedBody
            await sendWhatsAppMessage(to, { type: 'text', text: { body: finalBody } })
          } else {
            // share_link
            const finalBody = message?.trim() || buildShareLinkMessage(shareUrl, clientName, company.name)
            await sendWhatsAppMessage(to, { type: 'text', text: { body: finalBody } })
          }
        } catch (sendErr) {
          // Log failure to estimate_deliveries (mirror send-sms 122-130)
          const svc = requireServiceClient()
          await svc.from('estimate_deliveries').insert({
            estimate_id: estimate.id,
            company_id: estimate.company_id,
            channel: 'whatsapp',
            recipient_phone: to,
            provider: 'meta',
            status: 'failed',
            // T-81-07: sanitize — do NOT log Meta token or signed URL. Extract message only.
            error_message: (sendErr as Error)?.message?.slice(0, 500) ?? 'WhatsApp send failed',
          })
          return NextResponse.json({ error: 'Failed to send WhatsApp message. Please try again.' }, { status: 500 })
        }

        // 6. Success log + sent_at + activity (mirror send-sms 138-164)
        const svc = requireServiceClient()
        await svc.from('estimate_deliveries').insert({
          estimate_id: estimate.id,
          company_id: estimate.company_id,
          channel: 'whatsapp',
          recipient_phone: to,
          provider: 'meta',
          provider_message_id: null, // Pitfall 7 — sendWhatsAppMessage returns void
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        await supabase
          .from('estimates')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', id)
          .is('sent_at', null)
        await svc.from('estimate_activity').insert({
          project_id: estimate.project_id,
          company_id: estimate.company_id,
          estimate_id: estimate.id,
          event_type: 'estimate_sent',
          metadata: {
            channel: 'whatsapp',
            to,
            delivery_format: deliveryFormat,
            actually_delivered_format: actuallyDeliveredFormat, // Pitfall 2 — honest audit
          },
        })

        return NextResponse.json({ success: true, ...(fallback ? { fallback } : {}) })
      } catch (error) {
        console.error('Send WhatsApp error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }
    }
    ```

    Implementation notes:
    - Do NOT regenerate or refactor `lib/whatsapp/client.ts` (Locked Decision 1).
    - Do NOT add `rateLimit(...)` call (Locked Decision 3).
    - Do NOT call `recordUsage(...)` (Locked Decision 4).
    - The route file must be a Node runtime route (default; do NOT add `export const runtime = 'edge'` — `requireServiceClient` and `@react-pdf/renderer` require Node).
    - Sanitize errors: catch blocks must only log `(err as Error).message` — never `err.stack` or `err.config` (could include the Meta auth header).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/whatsapp/send-route.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `app/api/estimates/[id]/send-whatsapp/route.ts` exists
    - File contains literal `export async function POST`
    - File contains literal `channel: 'whatsapp'`
    - File contains literal `provider: 'meta'`
    - File contains literal `getEntitlements(tier).whatsappEnabled` (server-side T-81-06 gate)
    - File contains literal `status: 402` (entitlement)
    - File contains literal `status: 409` (consolidated + WA-not-active)
    - File contains literal `generateAndUploadEstimatePDF(` (PDF branch)
    - File contains literal `fallback` (Locked Decision 2 surfacing)
    - File contains literal `actually_delivered_format` (Pitfall 2 audit honesty)
    - File does NOT contain literal `rateLimit` (Locked Decision 3)
    - File does NOT contain literal `recordUsage` (Locked Decision 4)
    - File does NOT contain any literal secret value matching `whsec_`, `sk_live_`, `sk_test_`, `sk-ant-`, `sk-proj-`, `re_`, or `EAAB` (Meta token prefix)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>POST /api/estimates/[id]/send-whatsapp ships with auth/E.164/consolidated/entitlement/status gates, delivery_format branching (share_link/formatted_text/pdf_attachment), PDF→share_link fallback surfaced as `fallback: "share_link"` per Locked Decision 2, audit logging to estimate_deliveries with channel/provider literals, and Locked Decisions 1/3/4 respected (platform-global outbound; no rateLimit; no recordUsage).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flip RED scaffolds to GREEN — send-route.test.ts + entitlement-gate.test.ts</name>
  <files>tests/unit/whatsapp/send-route.test.ts, tests/unit/whatsapp/entitlement-gate.test.ts</files>
  <read_first>
    - `tests/unit/whatsapp/send-route.test.ts` (the it.todo scaffold from plan 81-01)
    - `tests/unit/whatsapp/entitlement-gate.test.ts` (the it.todo scaffold from plan 81-01)
    - `tests/unit/whatsapp/handler.test.ts` (mocking pattern: `vi.mock('@/lib/whatsapp/client')`, `vi.mock('@/lib/supabase/server')`, supabase chain mock builder)
    - `tests/unit/whatsapp/pdf-delivery.test.ts` (mocking pattern for `generateAndUploadEstimatePDF`)
    - `tests/unit/api/generate-estimate-dispatch.test.ts` (Request-object construction for POST route tests; how `params` is awaited)
    - `app/api/estimates/[id]/send-whatsapp/route.ts` (the file from Task 1 — this is what we're testing)
  </read_first>
  <behavior>
    Every `it.todo` from the Wave 0 scaffold becomes a real `it(...)` with at least one `expect(...).toBe(...)` / `toEqual(...)` / `toHaveBeenCalledWith(...)` assertion. Test count >= 12 in send-route.test.ts; >= 7 in entitlement-gate.test.ts.

    Coverage map (Wave 0 it.todo → Wave 1 real it):
    - `returns 401 when getClaims returns null` → mock `getClaims` to return `{ data: { claims: null } }`, expect `response.status === 401`
    - `returns 400 when phone fails E.164 regex` → POST with `{ to: '555-1234' }`, expect 400
    - `returns 409 when estimate.workflow_status !== "consolidated"` → mock estimate row with `workflow_status: 'draft'`, expect 409
    - `returns 402 when getEntitlements(tier).whatsappEnabled === false` → mock company.tier='free', expect 402
    - `returns 409 when company_whatsapp.status !== "active"` → mock waConfig.status='pending', expect 409
    - `branches into share_link...` → mock delivery_format='share_link', spy on sendWhatsAppMessage, expect call with type:'text' and body containing share URL
    - `branches into formatted_text...` → mock delivery_format='formatted_text', expect formatEstimateForWhatsApp called once, sendWhatsAppMessage called with type:'text'
    - `branches into pdf_attachment...` → mock delivery_format='pdf_attachment', mock generateAndUploadEstimatePDF to resolve, expect sendWhatsAppMessage called with type:'document'
    - `pdf fallback...` → mock generateAndUploadEstimatePDF to throw, expect sendWhatsAppMessage called with type:'text' AND response JSON contains `fallback: 'share_link'`
    - `logs delivery...` → spy on service client insert, expect call with `channel: 'whatsapp', provider: 'meta'`
    - `logs activity...` → expect insert to `estimate_activity` with `event_type: 'estimate_sent'` and `metadata.channel: 'whatsapp'`
    - `updates estimates.sent_at if currently null` → expect supabase chain `.update({ sent_at }).eq('id', id).is('sent_at', null)` called
  </behavior>
  <action>
    1. Replace `tests/unit/whatsapp/send-route.test.ts` content. Use the `handler.test.ts` mocking pattern. Top-of-file mocks:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
}))
vi.mock('@/lib/whatsapp/pdf-delivery', () => ({
  generateAndUploadEstimatePDF: vi.fn(),
}))
vi.mock('@/lib/whatsapp/formatter', () => ({
  formatEstimateForWhatsApp: vi.fn(() => '== FORMATTED =='),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({
  getEntitlements: vi.fn((tier: string) => ({
    whatsappEnabled: tier !== 'free',
    pdfEnabled: true,
  })),
}))
```

       Then a `buildSupabaseMock(opts)` helper that builds a chainable mock returning configurable rows for `estimates`, `companies`, `company_whatsapp`, `projects`, `clients`. Mirror the `buildSupabaseMock` pattern from `handler.test.ts` (or equivalent).

       Each `it(...)` constructs the supabase mock with appropriate fixtures, calls:

```typescript
const { POST } = await import('@/app/api/estimates/[id]/send-whatsapp/route')
const req = new Request('http://localhost/api/estimates/est-1/send-whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: '+15551234567', message: '' }),
})
const res = await POST(req, { params: Promise.resolve({ id: 'est-1' }) })
expect(res.status).toBe(<expected>)
```

       Then asserts on response status / json / spy call args.

    2. Replace `tests/unit/whatsapp/entitlement-gate.test.ts` content. This file tests the gate formula via the route handler — every `it.todo` from plan 81-01 becomes a real `it` that builds the supabase mock with the tested tier+status combo and asserts the route returns the expected status (`402`, `409`, or proceeds to 200). Example:

```typescript
it('returns false when tier=free regardless of status (whatsappEnabled=false on free)', async () => {
  const supabase = buildSupabaseMock({
    estimate: { id: 'e1', workflow_status: 'consolidated', share_token: 't', company_id: 'c1', project_id: 'p1' },
    company: { id: 'c1', name: 'Acme', tier: 'free' },
    waConfig: { status: 'active', delivery_format: 'share_link' },
  })
  vi.mocked(createClient).mockResolvedValue(supabase as any)
  const { POST } = await import('@/app/api/estimates/[id]/send-whatsapp/route')
  const res = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ to: '+15551234567' }), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: 'e1' }) })
  expect(res.status).toBe(402)
})
```

    3. Run the suite and ensure every it passes (no `.todo`, no `.skip`).
  </action>
  <verify>
    <automated>npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/entitlement-gate.test.ts --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/entitlement-gate.test.ts` exits 0
    - Combined test count >= 19 (12 + 7) and no test is `.todo` or `.skip`
    - send-route.test.ts contains literal `expect(res.status).toBe(401)` and `expect(res.status).toBe(402)` and `expect(res.status).toBe(409)`
    - send-route.test.ts contains literal `fallback` assertion (covers Locked Decision 2)
    - send-route.test.ts contains literal `channel: 'whatsapp'` and `provider: 'meta'` (covers WA-SEND-06 INSERT)
  </acceptance_criteria>
  <done>RED scaffolds from plan 81-01 are 100% GREEN: send-route.test.ts (>=12 cases) and entitlement-gate.test.ts (>=7 cases) all pass — Wave 1 server-side route is contract-verified.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → POST /api/estimates/[id]/send-whatsapp | Untrusted user input (recipient phone, optional message) crosses here. Supabase auth cookies establish caller identity. |
| route handler → Meta Cloud API | Trusted egress; uses platform-global `META_WHATSAPP_ACCESS_TOKEN` (never reaches client). |
| route handler → Supabase service role | `requireServiceClient()` bypasses RLS; only used for `estimate_deliveries` and `estimate_activity` inserts (matches send-sms pattern). |
| route handler → @react-pdf/renderer + storage abstraction | Server-side only; signed URL with 24h TTL. URL is returned to Meta only, never to caller. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-81-01 | Spoofing | recipient phone input | accept | By design — owner picks recipient. Mitigation: estimate ownership check via `supabase.from('estimates').eq('id', id)` + RLS guarantees only the company's owner can target a phone. |
| T-81-02 | Tampering | `message` body free-form text | mitigate | Message is concatenated as plain text into a WhatsApp body; no SQL/shell/HTML interpolation. zod validation on `to`; `message` is unconstrained text but free-form text into Meta is the expected use. Per RESEARCH.md §"Security Domain" — low risk. |
| T-81-03 | Information Disclosure | signed PDF URL (24h TTL) | mitigate | Signed URL is generated by `generateAndUploadEstimatePDF` via `lib/storage` provider with explicit `expiresInSeconds=86400` (Phase 53 pattern). URL is passed to Meta in the `document.link` field and never returned to the caller via the JSON response. Sanitized error messages prevent URL leakage in catch blocks. |
| T-81-04 | DoS / Cost | Meta Cloud API paid channel | accept | Per Locked Decision 3 (mirrors SMS): no per-company rate limit. Mitigation: audit trail via `estimate_deliveries` row per send (Repudiation control doubles as abuse detection). Re-evaluate if Meta costs become material — see RESEARCH.md Open Question 1 + Pitfall 4. |
| T-81-05 | Repudiation | `estimate_deliveries` audit row | mitigate | Every send (success OR failure) writes a row; failed sends include sanitized `error_message`. Pitfall 2 additionally records `actually_delivered_format` in `estimate_activity.metadata` so PDF→share_link fallback is auditable. |
| T-81-06 | Elevation of Privilege | tier gate (free tier bypass) | mitigate | Server-side `getEntitlements(tier).whatsappEnabled` check before any Meta API call. Returns HTTP 402 (intercepted by Phase 59 UpgradeModal). Plus server-side `company_whatsapp.status === 'active'` check before send. UI tab hide is defense-in-depth, not the primary control. |
| T-81-07 | Information Disclosure | Meta access token | mitigate | Token is read from env inside `sendWhatsAppMessage` (server-only call); never imported, logged, or serialized. Error catch blocks call `(err as Error).message.slice(0, 500)` — slices length AND drops `err.stack` / `err.config` which could embed the Authorization header. Route file contains zero secret literals (verified by acceptance_criteria gitleaks-pattern grep). |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0
- `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/entitlement-gate.test.ts` exits 0 with >= 19 tests passing
- `grep -E 'whsec_|sk_live_|sk_test_|sk-ant-|sk-proj-|re_[A-Za-z]|EAAB' app/api/estimates/\[id\]/send-whatsapp/route.ts` returns no matches (gitleaks pre-check)
- Manual smoke (deferred to Phase 81 UAT): set `META_WHATSAPP_PHONE_NUMBER_ID` + `META_WHATSAPP_ACCESS_TOKEN` placeholders, POST `{ to: '+<sandbox-number>' }` against a consolidated estimate, observe Meta delivery + new `estimate_deliveries` row with `channel='whatsapp'`, `provider='meta'`.
</verification>

<success_criteria>
- POST /api/estimates/[id]/send-whatsapp returns the correct status code for each of the 5 gate paths (401, 400, 402, 409 consolidated, 409 status) and 200 on the happy path
- The three delivery_format branches each call `sendWhatsAppMessage` with the right payload shape (text vs document)
- PDF→share_link fallback is automatic AND surfaced in the API response as `fallback: 'share_link'` (Locked Decision 2)
- `estimate_deliveries` audit row exists for every send (success or failure) with `channel='whatsapp'`, `provider='meta'`
- `estimate_activity` row records `actually_delivered_format` so PDF fallback is honestly auditable (Pitfall 2)
- No rate limit wired, no usage_event recorded (Locked Decisions 3 + 4)
- Vitest scaffolds from plan 81-01 are 100% GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-02-SUMMARY.md` documenting:
- Final route file path + line count
- Status codes for each gate path (in a table)
- How the PDF fallback surfaces in the response (`fallback: 'share_link'`)
- Confirmation that Locked Decisions 1/3/4 are respected (platform-number outbound; no rateLimit; no recordUsage)
- Output of `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/entitlement-gate.test.ts`
</output>
