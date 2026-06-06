---
phase: quick
plan: 260602-jns
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(app)/settings/integrations/page.tsx
  - app/api/webhooks/whatsapp/route.ts
  - lib/actions/whatsapp-settings.ts
  - components/settings/whatsapp-connect-card.tsx
  - tests/unit/whatsapp/otp-verification.test.ts
  - tests/unit/whatsapp/whatsapp-status-flow.test.ts
  - supabase/migrations/20260602000001_simplify_company_whatsapp.sql
autonomous: true
requirements: []
must_haves:
  truths:
    - "/settings/integrations renders without importing WhatsAppConnectCard"
    - "Messaging channels section shows a read-only 'Platform-managed' info card"
    - "Inbound webhook routes by whatsapp_conversations.contact_phone, not company_whatsapp.phone_number"
    - "Migration file drops phone_number, phone_number_id, waba_id, status, verified_at from company_whatsapp"
    - "lib/actions/whatsapp-settings.ts contains only updateDeliveryFormat (or is deleted if no callers remain)"
    - "whatsapp-connect-card.tsx deleted; no TypeScript errors from orphaned imports"
  artifacts:
    - path: "supabase/migrations/20260602000001_simplify_company_whatsapp.sql"
      provides: "DROP COLUMN migration for the 5 removed columns"
    - path: "app/(app)/settings/integrations/page.tsx"
      provides: "Messaging section using read-only platform-managed card"
    - path: "app/api/webhooks/whatsapp/route.ts"
      provides: "Inbound routing via whatsapp_conversations + clients fallback"
  key_links:
    - from: "app/api/webhooks/whatsapp/route.ts"
      to: "whatsapp_conversations.contact_phone"
      via: "supabase query eq('contact_phone', `+${fromPhone}`)"
    - from: "lib/whatsapp/send-estimate.ts"
      to: "company_whatsapp.delivery_format"
      via: "select('delivery_format') — column is kept, must still work"
---

<objective>
Move WhatsApp integration from a per-company self-serve setup to a platform-managed
(admin-only) model. This involves four coordinated changes: (1) replace the
per-company WhatsApp connect UI in Settings with a read-only info card, (2) fix
inbound webhook routing to use conversation history rather than the now-removed
phone_number column, (3) drop the five per-company credentials columns from
company_whatsapp via a Supabase migration, and (4) delete the connect/verify/disconnect
server actions and the WhatsAppConnectCard component.

Purpose: The Meta Business API token is already platform-managed in /admin/integrations;
per-company phone number registration was a UX dead-end and the routing logic was wrong
for a single-platform-number model.
Output: Clean settings page, correct inbound routing, simplified schema.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260602-jns-move-whatsapp-integration-to-admin-only/260602-jns-PLAN.md

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. -->

From app/api/webhooks/whatsapp/route.ts (current routing — WRONG):
```typescript
// Line 107-113: routes by SENDER phone = company_whatsapp.phone_number
// This is wrong for single-platform-number model — fromPhone is the SENDER, not ours.
const { data: whatsappConfig } = await supabase
  .from('company_whatsapp')
  .select('company_id')
  .eq('phone_number', `+${fromPhone}`)   // BUG: sender phone ≠ our phone
  .eq('status', 'active')
  .single()
```

New routing logic (replace lines 105-117):
```typescript
// Route: find company via conversation history (contact_phone = sender's phone)
// whatsapp_conversations.contact_phone stores E.164 of the *other party*.
// ORDER BY last_message_at DESC picks the most-recently-active company thread.
const { data: convRow } = await supabase
  .from('whatsapp_conversations')
  .select('company_id')
  .eq('contact_phone', `+${fromPhone}`)
  .order('last_message_at', { ascending: false })
  .limit(1)
  .maybeSingle()

let resolvedCompanyId: string | null = convRow?.company_id ?? null

// Fallback: check clients table by phone (new contacts have no conversation yet)
if (!resolvedCompanyId) {
  const { data: clientRow } = await supabase
    .from('clients')
    .select('company_id')
    .eq('phone', `+${fromPhone}`)
    .limit(1)
    .maybeSingle()
  resolvedCompanyId = clientRow?.company_id ?? null
}

if (!resolvedCompanyId) {
  // Unknown sender — silent ignore per WA-06
  return
}
```
Then replace `whatsappConfig.company_id` references with `resolvedCompanyId`.

From lib/whatsapp/send-estimate.ts (line 63-64 — must keep working):
```typescript
// This query must still work after the migration (delivery_format column KEPT):
svc.from('company_whatsapp').select('delivery_format').eq('company_id', companyId).maybeSingle()
```

From app/(app)/settings/integrations/page.tsx (current messaging section — REMOVE):
```tsx
// Lines 52-73: WhatsAppStatus fetch (remove)
let initial: WhatsAppStatus = null
const svc = createServiceClient()
if (companyId && svc) {
  const { data: row } = await svc
    .from('company_whatsapp')
    .select('phone_number, phone_number_id, waba_id, status, delivery_format')
    ...
}
// Lines 128-134: WhatsAppConnectCard render (replace with read-only card)
<section className="space-y-3">
  <SectionHeading><T>Messaging channels</T></SectionHeading>
  <WhatsAppConnectCard initial={initial} />
</section>
```

From supabase/migrations/20260529000001_whatsapp_company_id_unique.sql
(reference for existing constraints — company_whatsapp already has UNIQUE(company_id)):
The table currently has: id, company_id, phone_number, phone_number_id, waba_id,
status, verified_at, created_at, delivery_format, plus verification OTP columns.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + delete dead component + slim server actions</name>
  <files>
    supabase/migrations/20260602000001_simplify_company_whatsapp.sql
    components/settings/whatsapp-connect-card.tsx
    lib/actions/whatsapp-settings.ts
    tests/unit/whatsapp/otp-verification.test.ts
    tests/unit/whatsapp/whatsapp-status-flow.test.ts
  </files>
  <action>
1. CREATE supabase/migrations/20260602000001_simplify_company_whatsapp.sql:

```sql
-- Simplify company_whatsapp: move to platform-managed model.
-- Drops per-company Meta credentials; delivery_format + id + company_id + created_at are kept.
-- send-estimate.ts still reads delivery_format via service client.

ALTER TABLE company_whatsapp
  DROP COLUMN IF EXISTS phone_number,
  DROP COLUMN IF EXISTS phone_number_id,
  DROP COLUMN IF EXISTS waba_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verification_code,
  DROP COLUMN IF EXISTS verification_attempts,
  DROP COLUMN IF EXISTS verification_expires_at;
```

Note: also drop the OTP columns (verification_code, verification_attempts,
verification_expires_at) added by phase50 migration — they reference removed flow.
If any of these columns don't exist (already dropped), IF EXISTS guards the statement.

2. DELETE components/settings/whatsapp-connect-card.tsx — this file is being removed
   entirely. Use the Bash tool: `Remove-Item "components/settings/whatsapp-connect-card.tsx"`.

3. REWRITE lib/actions/whatsapp-settings.ts — keep ONLY updateDeliveryFormat (it can
   still be called from a future delivery-format selector on the read-only card).
   Remove: requestWhatsAppVerification, confirmWhatsAppVerification, connectWhatsApp,
   disconnectWhatsApp, updateWhatsAppStatus, and all OTP/connect helpers
   (generateVerificationCode, VERIFICATION_TTL_MINUTES, MAX_VERIFICATION_ATTEMPTS).
   Also remove the sendWhatsAppMessage import (no longer needed).
   Keep: getAuthContext helper, WhatsAppSettingsResult type, updateDeliveryFormat export.

4. DELETE tests/unit/whatsapp/otp-verification.test.ts — tests only the removed OTP flow.
   DELETE tests/unit/whatsapp/whatsapp-status-flow.test.ts — tests only the removed status actions.
   Use Remove-Item for both.
  </action>
  <verify>
    <automated>cd "C:\Users\User\Desktop\projetos_skale\xtimator\xtimator" && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    Migration file exists. whatsapp-connect-card.tsx deleted. whatsapp-settings.ts contains
    only updateDeliveryFormat. Test files for deleted actions are gone.
    `tsc --noEmit` reports no errors related to these files.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix settings page + fix inbound webhook routing</name>
  <files>
    app/(app)/settings/integrations/page.tsx
    app/api/webhooks/whatsapp/route.ts
  </files>
  <action>
**app/(app)/settings/integrations/page.tsx:**

Remove:
- The `WhatsAppConnectCard` import and `WhatsAppStatus` type import (lines 17-19)
- The `createServiceClient` import (line 13) — only used for the WhatsApp fetch
- The `initial: WhatsAppStatus` block (lines 52-73) that queries phone_number etc.
- The `<WhatsAppConnectCard initial={initial} />` render

Replace the entire "Messaging channels" section with a read-only platform-managed card:

```tsx
{/* Messaging channels — platform-managed; no per-company setup required. */}
<section className="space-y-3">
  <SectionHeading>
    <T>Messaging channels</T>
  </SectionHeading>
  <Card className="bg-muted/30">
    <CardHeader>
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
        <CardTitle className="text-base">
          <T>WhatsApp</T>
        </CardTitle>
        <Badge variant="secondary">
          <T>Platform-managed</T>
        </Badge>
      </div>
      <CardDescription>
        <T>
          WhatsApp delivery is managed by Xtimator. Send estimates directly
          to clients via WhatsApp from the project Send tab — no setup required.
        </T>
      </CardDescription>
    </CardHeader>
  </Card>
</section>
```

Add `MessageCircle` to the lucide-react import (already imports from lucide-react on
line 3 alongside Plug, ChevronRight, Sparkles, Mic).

Also remove the now-unused `companyId` variable from the `Promise.all` if it was only
used for the WhatsApp fetch. Check: `companyId` is still used to render the AI section
(`const [companyId, aiProvider]`) — actually looking at the page, `companyId` is only
used in the WhatsApp block. After removing that block, the `getActiveCompanyId()` call
in Promise.all becomes unused. Simplify to:

```tsx
const aiProvider = await getSelectedAIProvider()
```

Remove `getActiveCompanyId` import if no longer used. Remove `createServiceClient` import.

**app/api/webhooks/whatsapp/route.ts:**

Replace lines 104-117 (the routing block) with the new conversation-based routing.
The exact replacement is in the `<interfaces>` block above. Key points:
- Query `whatsapp_conversations` first by `contact_phone = +${fromPhone}` ordered by
  `last_message_at DESC` limit 1
- Fallback to `clients` table by `phone = +${fromPhone}` if no conversation found
- Store result in `resolvedCompanyId: string | null`
- Replace all subsequent uses of `whatsappConfig.company_id` with `resolvedCompanyId`
  (there are two: the dedup insert and the logInboundMessage call and the
  processInboundWithDebounce call)

Final shape after routing block:
```typescript
if (!resolvedCompanyId) return  // Unknown sender — silent ignore

const { error: dedupError } = await supabase
  .from('whatsapp_processed_messages')
  .insert({ message_id: messageId, company_id: resolvedCompanyId })
// ... rest unchanged, replace whatsappConfig.company_id with resolvedCompanyId
```
  </action>
  <verify>
    <automated>cd "C:\Users\User\Desktop\projetos_skale\xtimator\xtimator" && npx tsc --noEmit 2>&1 | head -40</automated>
  </verify>
  <done>
    Settings integrations page renders without WhatsAppConnectCard — no dead import errors.
    Webhook route queries whatsapp_conversations.contact_phone (not company_whatsapp.phone_number).
    `tsc --noEmit` exits clean. `npm run build` succeeds (or at minimum tsc clean).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Meta Cloud API → webhook | Inbound messages from Meta; HMAC-verified before processing |
| Authenticated user → settings page | Read-only view now; no write surface for WhatsApp credentials |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jns-01 | Spoofing | Inbound routing via contact_phone | mitigate | Routing still runs post-HMAC-verification; a spoofed fromPhone can only route to the correct company thread — no privilege escalation |
| T-jns-02 | Elevation | company_whatsapp write removed from user-facing actions | accept | updateDeliveryFormat is the only remaining action; it writes only delivery_format, no credential fields |
| T-jns-03 | Information Disclosure | Migration drops status column | accept | status was internal only; removal reduces attack surface |
</threat_model>

<verification>
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — no build failures
3. Visit `/settings/integrations` — see "WhatsApp / Platform-managed" read-only card, no connect form
4. Migration file exists at `supabase/migrations/20260602000001_simplify_company_whatsapp.sql`
5. `grep -r "WhatsAppConnectCard" app/ components/ lib/` returns no results
6. `grep -r "phone_number" app/api/webhooks/whatsapp/route.ts` returns no results
</verification>

<success_criteria>
- Settings integrations page renders with read-only platform-managed WhatsApp card
- Inbound webhook routes by whatsapp_conversations.contact_phone (sender) with clients fallback
- company_whatsapp migration drops 5+ credential columns, delivery_format column intact
- whatsapp-connect-card.tsx deleted, no dead imports
- whatsapp-settings.ts contains only updateDeliveryFormat export
- TypeScript clean: `tsc --noEmit` exits 0
</success_criteria>

<output>
After completion, create `.planning/quick/260602-jns-move-whatsapp-integration-to-admin-only/260602-jns-SUMMARY.md`
</output>
