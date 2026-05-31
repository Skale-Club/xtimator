---
phase: 81
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - app/(app)/projects/[id]/page.tsx
  - components/workspace/project-workspace.tsx
  - components/workspace/send/send-tab.tsx
  - components/workspace/send/send-form.tsx
  - app/(app)/settings/integrations/page.tsx
  - tests/unit/whatsapp/send-form-tab.test.tsx
  - tests/unit/whatsapp/integrations-page.test.tsx
autonomous: true
requirements:
  - WA-SEND-01
  - WA-SEND-02
  - WA-INT-01
  - WA-INT-02
must_haves:
  truths:
    - "SendForm renders a third TabsTrigger value='whatsapp' with MessageCircle icon when whatsappSendEnabled === true; tab is hidden entirely when false"
    - "whatsappSendEnabled prop threads end-to-end: app/(app)/projects/[id]/page.tsx → ProjectWorkspace → SendTab → SendForm"
    - "Tab order is Email · SMS · WhatsApp left-to-right per UI-SPEC; WhatsApp tab is always last"
    - "/settings/integrations renders WhatsAppConnectCard with initial={null|WhatsAppStatus} and the new header copy 'Connect outbound channels for sending estimates and receiving client messages.'"
    - "On WhatsApp send success, sonner toast reads 'Estimate sent via WhatsApp!'; on response with fallback:'share_link', toast reads 'PDF indisponível — enviamos o link'"
  artifacts:
    - path: "components/workspace/send/send-form.tsx"
      provides: "WhatsApp tab UI — TabsTrigger + TabsContent with PhoneInput, optional message Textarea, MessageCircle CTA"
      contains: "whatsappSendEnabled"
    - path: "components/workspace/send/send-tab.tsx"
      provides: "Prop pass-through whatsappSendEnabled"
      contains: "whatsappSendEnabled"
    - path: "components/workspace/project-workspace.tsx"
      provides: "Prop pass-through whatsappSendEnabled"
      contains: "whatsappSendEnabled"
    - path: "app/(app)/projects/[id]/page.tsx"
      provides: "Server-side resolution of whatsappSendEnabled = getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'"
      contains: "whatsappSendEnabled"
    - path: "app/(app)/settings/integrations/page.tsx"
      provides: "Server component mounting <WhatsAppConnectCard initial={initial}> with header copy from UI-SPEC §Copywriting"
      contains: "WhatsAppConnectCard"
  key_links:
    - from: "components/workspace/send/send-form.tsx"
      to: "/api/estimates/[id]/send-whatsapp"
      via: "fetch in onWhatsAppSubmit"
      pattern: "send-whatsapp"
    - from: "app/(app)/projects/[id]/page.tsx"
      to: "lib/entitlements.ts:getEntitlements"
      via: "tier-based gate derivation"
      pattern: "getEntitlements"
    - from: "app/(app)/projects/[id]/page.tsx"
      to: "company_whatsapp table"
      via: "supabase.from('company_whatsapp').select('status').eq(company_id).maybeSingle()"
      pattern: "company_whatsapp"
    - from: "app/(app)/settings/integrations/page.tsx"
      to: "components/settings/whatsapp-connect-card.tsx"
      via: "import + mount with initial prop"
      pattern: "WhatsAppConnectCard"
---

<objective>
Ship the UI side of Phase 81 (Wave 1, depends on 81-01 migration only — independent of 81-02 because files do NOT overlap; the form just `fetch()`es the route at runtime).

This plan:
1. Adds a `whatsappSendEnabled: boolean` prop and threads it end-to-end (page → workspace → tab → form), mirroring the exact `smsDeliveryEnabled` plumbing verbatim per UI-SPEC §"SendTab — WhatsApp Tab Contract".
2. Resolves the gate server-side in `app/(app)/projects/[id]/page.tsx` via the formula `whatsappSendEnabled = getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'` (UI-SPEC verbatim).
3. Adds a third `TabsTrigger value="whatsapp"` + `TabsContent` block in `components/workspace/send/send-form.tsx` with `MessageCircle` icon (NOT `MessageSquare` — owned by SMS per UI-SPEC §Component Inventory), PhoneInput recipient field, optional message Textarea, primary CTA. The tab is HIDDEN entirely when `whatsappSendEnabled === false` (UI-SPEC §Visibility Gate — NOT a disabled tab trigger).
4. Replaces the OpenRouter placeholder body of `app/(app)/settings/integrations/page.tsx` with a server component that fetches `company_whatsapp` and mounts `<WhatsAppConnectCard initial={initial} />`. Header copy is changed to UI-SPEC §Copywriting verbatim. `WhatsAppConnectCard` is NOT modified.
5. Wires the WhatsApp toast copy:
   - Success (no fallback): `toast.success(t('Estimate sent via WhatsApp!'))` — exclamation per UI-SPEC §Copywriting
   - Fallback (PDF→share_link, Locked Decision 2): `toast.success(t('PDF indisponível — enviamos o link'))` — replaces the success copy when the API response includes `fallback: 'share_link'`
   - Error (404/409/500): `toast.error(data.error ?? t('Failed to send via WhatsApp. Please try again.'))`
   - 402 (entitlement): defer to global UpgradeModal from Phase 59 (no inline upsell per UI-SPEC §Empty States and Locked Decision 11)
6. Flips every `it.todo` in `tests/unit/whatsapp/send-form-tab.test.tsx` and `tests/unit/whatsapp/integrations-page.test.tsx` to GREEN.

Purpose: Make the WhatsApp send option visible to entitled-and-connected users. The Integrations page becomes the canonical place to connect — closes the loop between settings and the send tab.

Output: 5 modified UI files + 2 GREEN UI test suites + page-level integration with WhatsAppConnectCard (NO modification to that card).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md
@app/(app)/projects/[id]/page.tsx
@app/(app)/settings/integrations/page.tsx
@components/workspace/project-workspace.tsx
@components/workspace/send/send-tab.tsx
@components/workspace/send/send-form.tsx
@components/settings/whatsapp-connect-card.tsx
@components/ui/phone-input.tsx
@lib/entitlements.ts
@lib/supabase/server.ts

<interfaces>
<!-- Existing contracts the executor needs. Extracted from codebase. -->

From `components/workspace/send/send-form.tsx` (existing props — extend with one field):

```typescript
interface SendFormProps {
  estimateId: string
  clientEmail: string | null
  clientPhone: string | null
  companyName: string
  projectName: string
  shareToken: string
  smsDeliveryEnabled: boolean
  // ADD: whatsappSendEnabled: boolean
  disabled?: boolean
}
```

Existing SMS form schema (line 35-38) — mirror for WhatsApp:

```typescript
const sendSmsSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +15551234567)'),
  message: z.string().optional(),
})
```

Existing SMS TabsTrigger + TabsContent pattern (lines 161-167 and 237-289) — mirror exactly with three string swaps (icon, label, route).

From `components/workspace/send/send-tab.tsx` (existing props — extend with one field):

```typescript
interface SendTabProps {
  // ... existing fields ...
  smsDeliveryEnabled: boolean
  // ADD: whatsappSendEnabled: boolean
}
```

Passes through to SendForm at line 60-69; add the new prop in the JSX.

From `components/workspace/project-workspace.tsx` (existing props — extend with one field):

```typescript
interface ProjectWorkspaceProps {
  // ... existing fields ...
  smsDeliveryEnabled?: boolean
  // ADD: whatsappSendEnabled?: boolean
}
```

Default the new prop to `false` (matches `smsDeliveryEnabled = false` at line 45) and pass into `<SendTab>` at line 156-167.

From `components/settings/whatsapp-connect-card.tsx` (existing — DO NOT MODIFY):

```typescript
import { WhatsAppConnectCard, type WhatsAppStatus } from '@/components/settings/whatsapp-connect-card'
// WhatsAppStatus shape from the card export:
type WhatsAppStatus = {
  phoneNumber: string
  phoneNumberId: string
  wabaId: string
  status: string
  deliveryFormat: 'share_link' | 'formatted_text' | 'pdf_attachment'
} | null
```

(Confirm export shape by reading `components/settings/whatsapp-connect-card.tsx` at implementation time; if the `WhatsAppStatus` type is not exported, define an inline structural type matching what the card accepts as `initial`.)

From `lib/entitlements.ts`:

```typescript
export function getEntitlements(tier: string): { whatsappEnabled: boolean; ... }
// 'free' → false; 'trial'/'pro'/'business' → true
```

From `app/(app)/projects/[id]/page.tsx` lines 95-101 (existing companies query — extend select with `tier`):

```typescript
const { data: company } = await supabase
  .from('companies')
  .select('name, owner_name, brand_primary_color, estimate_template_*, sms_delivery_enabled, tier, ...')
  .eq('id', project.company_id)
  .single()
```

Add a sibling `company_whatsapp` query (one row per company) returning `{ status }`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Thread whatsappSendEnabled prop end-to-end (page → workspace → tab) + resolve gate server-side</name>
  <files>app/(app)/projects/[id]/page.tsx, components/workspace/project-workspace.tsx, components/workspace/send/send-tab.tsx</files>
  <read_first>
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md` §"SendTab — WhatsApp Tab Contract" + §"Visibility gate"
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Pattern 1: Prop threading (mirror smsDeliveryEnabled exactly)"
    - `app/(app)/projects/[id]/page.tsx` lines 84-152 (the `ProjectTabs` async sub-component — where the companies query + workspace render lives)
    - `components/workspace/project-workspace.tsx` lines 24-50 (props interface + destructuring) and lines 156-167 (`<SendTab>` mount)
    - `components/workspace/send/send-tab.tsx` lines 12-24 (props interface + destructuring) and lines 60-69 (`<SendForm>` mount)
    - `lib/entitlements.ts` (full file — confirm `getEntitlements(tier).whatsappEnabled` boolean)
  </read_first>
  <behavior>
    - `app/(app)/projects/[id]/page.tsx` extends the existing `companies` select to include `tier`, and adds a sibling `company_whatsapp` query returning `{ status }` for the project's company. Derives `whatsappSendEnabled = getEntitlements(tier).whatsappEnabled && waConfig?.status === 'active'` and passes it to `<ProjectWorkspace>`.
    - `ProjectWorkspace` accepts `whatsappSendEnabled?: boolean` defaulting to `false` (mirrors `smsDeliveryEnabled = false`) and passes it into `<SendTab>`.
    - `SendTab` accepts `whatsappSendEnabled: boolean` (required, like `smsDeliveryEnabled`) and passes it into `<SendForm>`.
    - No new client-side state, no new useEffect, no new fetch — gate is fully server-resolved.
    - When the company has no `company_whatsapp` row at all (e.g. brand-new account), the `.maybeSingle()` call returns `data: null` and the gate evaluates to `false` (because `null?.status === 'active'` is false). This is the intended default.
  </behavior>
  <action>
    **Step 1: `app/(app)/projects/[id]/page.tsx`** — locate the existing companies query (around line 95-101). Extend the `.select(...)` string to include `, tier` at the end. Then add a sibling query and gate derivation immediately after the existing destructuring:

```typescript
// Existing block (lines 97-101) — extend select with `, tier`:
const { data: company } = await supabase
  .from('companies')
  .select('name, owner_name, brand_primary_color, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, sms_delivery_enabled, logo_url, phone, email, website, address, city, state, zip, tier')
  .eq('id', project.company_id)
  .single()

// ADD: WhatsApp gate resolution (Phase 81 — UI-SPEC §Visibility gate)
const { data: waConfig } = await supabase
  .from('company_whatsapp')
  .select('status')
  .eq('company_id', project.company_id)
  .maybeSingle()
const tier = (company?.tier as string | null) ?? 'free'
const whatsappSendEnabled =
  getEntitlements(tier).whatsappEnabled && (waConfig?.status as string | undefined) === 'active'
```

       At the top of the file, add the import: `import { getEntitlements } from '@/lib/entitlements'`.

       Then locate the existing `<ProjectWorkspace ... smsDeliveryEnabled={smsDeliveryEnabled} ... />` render (around line 147) and add the new prop adjacent:

```tsx
<ProjectWorkspace
  // ... existing props ...
  smsDeliveryEnabled={smsDeliveryEnabled}
  whatsappSendEnabled={whatsappSendEnabled}
  // ... rest ...
/>
```

    **Step 2: `components/workspace/project-workspace.tsx`** — locate the `ProjectWorkspaceProps` interface (around line 24-40) and add:

```typescript
whatsappSendEnabled?: boolean
```

       In the function signature destructuring (around line 42-48), add `whatsappSendEnabled = false,`.

       In the `<SendTab>` mount (around line 156-167), add the prop:

```tsx
<SendTab
  estimate={currentEstimate}
  // ... existing props ...
  smsDeliveryEnabled={smsDeliveryEnabled}
  whatsappSendEnabled={whatsappSendEnabled}
/>
```

    **Step 3: `components/workspace/send/send-tab.tsx`** — locate `SendTabProps` (lines 12-22) and add `whatsappSendEnabled: boolean`. Update the function signature destructuring to include it. Pass it to `<SendForm>` (around line 60-69):

```tsx
<SendForm
  estimateId={estimate.id}
  // ... existing props ...
  smsDeliveryEnabled={smsDeliveryEnabled}
  whatsappSendEnabled={whatsappSendEnabled}
  disabled={isDraft}
/>
```

       (SendForm's prop addition happens in Task 2.)
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/wave1-typecheck.log; if grep -E "whatsappSendEnabled" /tmp/wave1-typecheck.log; then echo "TYPE ERROR — fix"; exit 1; fi; echo "typecheck passed"</automated>
  </verify>
  <acceptance_criteria>
    - `app/(app)/projects/[id]/page.tsx` contains literal `whatsappSendEnabled`
    - `app/(app)/projects/[id]/page.tsx` contains literal `getEntitlements(tier).whatsappEnabled`
    - `app/(app)/projects/[id]/page.tsx` contains literal `company_whatsapp` (the new query)
    - `app/(app)/projects/[id]/page.tsx` contains literal `, tier` in the companies select (the only diff that's not whitespace)
    - `components/workspace/project-workspace.tsx` contains literal `whatsappSendEnabled` (in interface + destructure + JSX)
    - `components/workspace/send/send-tab.tsx` contains literal `whatsappSendEnabled` (in interface + destructure + JSX)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>whatsappSendEnabled prop is resolved server-side via `getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'` in app/(app)/projects/[id]/page.tsx and threaded through ProjectWorkspace → SendTab with no TypeScript errors. Wave 1 Task 2 can now consume the prop in SendForm.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add WhatsApp tab to SendForm (third TabsTrigger + TabsContent + form + fetch wiring)</name>
  <files>components/workspace/send/send-form.tsx, tests/unit/whatsapp/send-form-tab.test.tsx</files>
  <read_first>
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md` §"SendTab — WhatsApp Tab Contract" (full section), §"Copywriting Contract" (all toast/label strings)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Code Examples → Send tab third tab + form skeleton" (verbatim snippet)
    - `components/workspace/send/send-form.tsx` (FULL FILE — line-by-line mirror of the SMS pattern: lines 35-38 schema, 83-89 form hook, 112-131 submit handler, 161-167 trigger, 237-289 content)
    - `components/ui/phone-input.tsx` (PhoneInput value/onChange contract — confirm `field.onChange(formatted.replace(/[^\d+]/g, ''))` pattern from send-form.tsx line 252)
    - `tests/unit/whatsapp/send-form-tab.test.tsx` (the it.todo scaffold from plan 81-01)
    - `tests/unit/clients/client-list.test.tsx` (RTL pattern for tab rendering — render with props, query by role, assert visibility)
  </read_first>
  <behavior>
    - `SendFormProps` gains `whatsappSendEnabled: boolean` (required, not optional — matches `smsDeliveryEnabled`).
    - When `whatsappSendEnabled === false`, the WhatsApp `TabsTrigger` is NOT rendered (conditional `{whatsappSendEnabled && (...)}` per UI-SPEC §Visibility gate) — NOT a disabled trigger.
    - When `whatsappSendEnabled === true`, the third `TabsTrigger value="whatsapp"` with `<MessageCircle className="h-4 w-4" />` icon and label `WhatsApp` is rendered LAST in the TabsList (after Email and SMS-if-enabled).
    - The corresponding `TabsContent value="whatsapp"` renders: `<PhoneInput>` (default `clientPhone ?? ''`, E.164 strip on change), optional `<Textarea rows={3}>` for custom message, `<Button variant="primary" size="lg" className="w-full">` CTA with `MessageCircle` (idle) or `Loader2` (sending) icon and label `Send WhatsApp` / `Sending...`.
    - Submit handler `onWhatsAppSubmit` POSTs to `/api/estimates/${estimateId}/send-whatsapp` with JSON body `{ to, message }`. On 200:
      - If response JSON contains `fallback === 'share_link'`: `toast.success(t('PDF indisponível — enviamos o link'))` (Locked Decision 2).
      - Otherwise: `toast.success(t('Estimate sent via WhatsApp!'))` (UI-SPEC §Copywriting — exclamation included).
    - On non-2xx: `toast.error(data.error ?? t('Failed to send via WhatsApp. Please try again.'))`.
    - CTA disabled when `sending || disabled` (mirrors Email/SMS pattern lines 225 / 278).
    - Tab labels: brand name `"WhatsApp"` rendered verbatim inside `t('WhatsApp')` wrapper — UI-SPEC line 152 + 256 say the proper noun is unchanged but kept in the `t()` shape for i18n consistency.
    - Helper copy below the message field: `t("Your client will receive an interactive WhatsApp message. Delivery format (share link, formatted text, or PDF attachment) is set on Settings → Integrations.")`.
  </behavior>
  <action>
    **Step 1: `components/workspace/send/send-form.tsx`** modifications.

    1.1 Update import (line 23): add `MessageCircle` to lucide imports:
```typescript
import { Send, CheckCircle2, Loader2, MessageSquare, MessageCircle, Mail } from 'lucide-react'
```

    1.2 After the `sendSmsSchema` definition (line 38), add the WhatsApp schema:
```typescript
const sendWhatsAppSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +15551234567)'),
  message: z.string().optional(),
})
type SendWhatsAppValues = z.infer<typeof sendWhatsAppSchema>
```

    1.3 Extend `SendFormProps` (around line 43-53) to add the prop:
```typescript
interface SendFormProps {
  // ... existing fields ...
  smsDeliveryEnabled: boolean
  whatsappSendEnabled: boolean
  disabled?: boolean
}
```

       Update the destructuring in the function signature (around line 55-64).

    1.4 After the `smsForm` hook (around line 83-89), add the WhatsApp form hook:
```typescript
const whatsappForm = useForm<SendWhatsAppValues>({
  resolver: zodResolver(sendWhatsAppSchema) as any,
  defaultValues: {
    to: clientPhone ?? '',
    message: '',
  },
})
```

    1.5 After `onSmsSubmit` (around line 112-131), add the submit handler:
```typescript
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
    // Locked Decision 2: PDF→share_link fallback is explicit
    if (data?.fallback === 'share_link') {
      toast.success(t('PDF indisponível — enviamos o link'))
    } else {
      toast.success(t('Estimate sent via WhatsApp!'))
    }
  } catch {
    toast.error(t('Failed to send via WhatsApp. Please try again.'))
  } finally {
    setSending(false)
  }
}
```

    1.6 In the `<TabsList>` (around line 156-167), after the SMS conditional trigger, add the WhatsApp trigger:
```tsx
{whatsappSendEnabled && (
  <TabsTrigger value="whatsapp" className="gap-2">
    <MessageCircle className="h-4 w-4" />
    {t('WhatsApp')}
  </TabsTrigger>
)}
```

    1.7 After the SMS `<TabsContent>` block (around line 237-289), add the WhatsApp content block:
```tsx
{whatsappSendEnabled && (
  <TabsContent value="whatsapp">
    <Form {...whatsappForm}>
      <form onSubmit={whatsappForm.handleSubmit(onWhatsAppSubmit)} className="space-y-4">
        <FormField
          control={whatsappForm.control}
          name="to"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Phone number')}</FormLabel>
              <FormControl>
                <PhoneInput
                  value={field.value ?? ''}
                  onChange={(formatted) => {
                    // Schema requires E.164 — strip mask chars before storing (mirrors SMS line 252)
                    field.onChange(formatted.replace(/[^\d+]/g, ''))
                  }}
                  placeholder="+15551234567"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={whatsappForm.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Custom message (optional)')}</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder={`${companyName} sent you an estimate.`}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-sm text-muted-foreground">
          {t('Your client will receive an interactive WhatsApp message. Delivery format (share link, formatted text, or PDF attachment) is set on Settings → Integrations.')}
        </p>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={sending || disabled}>
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-2 h-4 w-4" />
          )}
          {sending ? t('Sending...') : t('Send WhatsApp')}
        </Button>
      </form>
    </Form>
  </TabsContent>
)}
```

    **Step 2: `tests/unit/whatsapp/send-form-tab.test.tsx`** — flip every `it.todo` from plan 81-01 to a real `it(...)`.

       Use the RTL render pattern from existing tab/component tests. Mock `sonner` to spy on toast calls and `global.fetch` to control API responses. Each `it` renders `<SendForm>` with appropriate prop combinations and asserts.

       Concretely:
       - `renders tab when whatsappSendEnabled === true` → `render(<SendForm ... whatsappSendEnabled />)` → `expect(screen.getByRole('tab', { name: /WhatsApp/i })).toBeInTheDocument()`
       - `hides tab entirely when whatsappSendEnabled === false` → `expect(screen.queryByRole('tab', { name: /WhatsApp/i })).toBeNull()`
       - `icon: tab trigger renders MessageCircle (not MessageSquare)` → assert the tab's icon has the `lucide-message-circle` class (lucide-react adds class names per icon name) OR query the tab trigger and assert it contains a child SVG with `data-lucide="message-circle"` if present. If neither marker exists in your lucide version, snapshot or `container.querySelector('[data-tab-icon="message-circle"]')` — Implementor's call; the criterion is "test FAILS if someone swaps MessageCircle to MessageSquare". Acceptable alternative: assert `screen.getByRole('tab', { name: /WhatsApp/i }).innerHTML.includes('circle')` (case-insensitive) — pragmatic.
       - `tab order is Email, SMS, WhatsApp` → `const tabs = screen.getAllByRole('tab')` → `expect(tabs.map(t => t.textContent)).toEqual(['Email', expect.stringContaining('SMS'), expect.stringContaining('WhatsApp')])`
       - `phone field accepts +15551234567 and rejects 555-1234` → fill via userEvent, submit, assert validation message renders for the bad case and `fetch` was called for the good case
       - `submit posts to /api/estimates/[id]/send-whatsapp with { to, message }` → `expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/send-whatsapp'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('+15551234567') }))`
       - `success toast reads "Estimate sent via WhatsApp!"` → mock fetch to resolve `{ ok: true, json: async () => ({ success: true }) }`, submit, await, `expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Estimate sent via WhatsApp'))`
       - `fallback toast: when API response includes fallback: "share_link"` → mock fetch resolve `{ ok: true, json: async () => ({ success: true, fallback: 'share_link' }) }`, assert `toast.success` called with string containing `'PDF indispon'` (or the exact UI-SPEC string)
       - `CTA disabled when parent passes disabled={true}` → render with `disabled`, assert the WhatsApp send button has `disabled` attribute

       Use the same `vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))` pattern other UI tests use.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/whatsapp/send-form-tab.test.tsx --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `components/workspace/send/send-form.tsx` contains literal `whatsappSendEnabled` (in props interface, function signature, conditional renders)
    - File contains literal `sendWhatsAppSchema`
    - File contains literal `MessageCircle` (icon import + JSX usage)
    - File contains literal `/api/estimates/${estimateId}/send-whatsapp` or backtick template with `send-whatsapp`
    - File contains literal `Estimate sent via WhatsApp!` (exact UI-SPEC copy)
    - File contains literal `PDF indispon` (the fallback toast copy from Locked Decision 2 — exact string `PDF indisponível — enviamos o link`)
    - File does NOT contain `disabled` attribute on the WhatsApp `TabsTrigger` (UI-SPEC: hide entirely, do not disable)
    - `npx vitest run tests/unit/whatsapp/send-form-tab.test.tsx` exits 0 with all 9 cases passing (no .todo, no .skip)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>SendForm renders the third TabsTrigger (MessageCircle) with conditional `{whatsappSendEnabled && ...}` (hidden, not disabled — per UI-SPEC); WhatsApp submit fetches /api/estimates/[id]/send-whatsapp; toast distinguishes happy-path "Estimate sent via WhatsApp!" from fallback "PDF indisponível — enviamos o link" (Locked Decision 2); send-form-tab.test.tsx all 9 cases GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Replace /settings/integrations placeholder with WhatsAppConnectCard mount</name>
  <files>app/(app)/settings/integrations/page.tsx, tests/unit/whatsapp/integrations-page.test.tsx</files>
  <read_first>
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md` §"Settings → Integrations — Card Contract" (page layout JSX verbatim) + §"Copywriting Contract" (header copy)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Pattern 4: Settings → Integrations server-component fetch" (verbatim snippet)
    - `app/(app)/settings/integrations/page.tsx` (CURRENT FILE — 22 lines; the placeholder being replaced)
    - `components/settings/whatsapp-connect-card.tsx` (lines 1-100 — confirm export shape and `initial` prop type; DO NOT MODIFY)
    - `lib/supabase/server.ts` (`createClient()` for server-component auth pattern)
    - `tests/unit/whatsapp/integrations-page.test.tsx` (the it.todo scaffold from plan 81-01)
    - `components/i18n/t.tsx` (`<T>` component wrapper for server-component i18n — already used by the existing placeholder)
  </read_first>
  <behavior>
    - The page is a server component (no `'use client'` directive). It fetches the authenticated user's company id, then fetches the matching `company_whatsapp` row.
    - When no `company_whatsapp` row exists, `initial` passed to `<WhatsAppConnectCard>` is `null` (the card renders its "not connected → connect form" state per UI-SPEC §"WhatsAppConnectCard placement" table row 1).
    - When the row exists, `initial` is `{ phoneNumber, phoneNumberId, wabaId, status, deliveryFormat }` matching the card's `WhatsAppStatus` shape.
    - Page header is `<h1>` with copy `Integrations` and a `<p>` subhead with copy `Connect outbound channels for sending estimates and receiving client messages.` (UI-SPEC §Copywriting line 199-200) — replacing the AI-provider-focused copy.
    - No new component is built; `<WhatsAppConnectCard>` is mounted unchanged.
    - Layout: `<div className="space-y-8 p-6"> <header ... /> <div className="space-y-6"> <WhatsAppConnectCard ... /> </div> </div>` — UI-SPEC §Page layout verbatim.
    - The `<T>` wrapper from `components/i18n/t` wraps each string literal exactly as the existing placeholder does (preserves PT/ES i18n compatibility).
  </behavior>
  <action>
    **Step 1: `app/(app)/settings/integrations/page.tsx`** — replace the entire file content with:

```typescript
import { T } from '@/components/i18n/t'
import { createClient } from '@/lib/supabase/server'
import { WhatsAppConnectCard } from '@/components/settings/whatsapp-connect-card'

// If WhatsAppStatus is exported from the card module, import it. Otherwise define
// a structural type locally that matches what the card accepts.
// import type { WhatsAppStatus } from '@/components/settings/whatsapp-connect-card'

type WhatsAppInitial = {
  phoneNumber: string
  phoneNumberId: string
  wabaId: string
  status: string
  deliveryFormat: 'share_link' | 'formatted_text' | 'pdf_attachment'
} | null

export const metadata = { title: 'Integrations | Settings' }

export default async function SettingsIntegrationsPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  let initial: WhatsAppInitial = null
  if (claims) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', (claims as any).sub)
      .single()
    if (company) {
      const { data: row } = await supabase
        .from('company_whatsapp')
        .select('phone_number, phone_number_id, waba_id, status, delivery_format')
        .eq('company_id', company.id as string)
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
        <WhatsAppConnectCard initial={initial as any} />
      </div>
    </div>
  )
}
```

       Notes:
       - `WhatsAppConnectCard` is a `'use client'` component; importing it into a server page is the established Phase 45 pattern (see `STATE.md` Phase 45 entries — same dance done for the existing settings page).
       - If the executor finds `WhatsAppConnectCard` exports a typed `WhatsAppStatus`, import it and replace `as any` with the proper type. Otherwise the structural cast is acceptable (the card validates `initial` at runtime).
       - Use `.eq('user_id', ...)` to find the company — same pattern as `lib/queries/auth.ts` getAuthContext (consult that file if uncertain about the field name; if user→company mapping requires a different join, mirror what `app/(app)/settings/page.tsx` does — read at implementation time).

    **Step 2: `tests/unit/whatsapp/integrations-page.test.tsx`** — flip every `it.todo` from plan 81-01 to a real `it(...)`.

       Server-component pages are hard to render with RTL directly (they return Promises). Two strategies:
       (a) Test the rendered output: call the page function with mocked supabase, then render the returned JSX with `render(await SettingsIntegrationsPage())`. This is the cleanest test for Next.js App Router pages.
       (b) Test by static analysis if RTL pathway is too brittle: read the file content and assert string presence.

       Prefer (a). Concrete tests:
       - `header copy: H1 reads "Integrations"` → render the page (with mocked supabase → no row), `expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Integrations')`
       - `header copy: subhead reads "Connect outbound channels..."` → `expect(screen.getByText(/Connect outbound channels/i)).toBeInTheDocument()`
       - `mounts WhatsAppConnectCard with initial={null} when company has no company_whatsapp row` → mock `supabase.from('company_whatsapp').select().eq().maybeSingle()` to return `{ data: null }`, render, assert WhatsAppConnectCard is mounted (e.g. mock it and check it was called with `{ initial: null }`)
       - `mounts WhatsAppConnectCard with initial={{...}} when row exists` → mock supabase to return a full row, assert the mock card received `initial` with all 5 fields
       - `does NOT render the old "OpenRouter integration coming soon" placeholder text` → `expect(screen.queryByText(/OpenRouter/i)).toBeNull()`

       Mock WhatsAppConnectCard:
```typescript
vi.mock('@/components/settings/whatsapp-connect-card', () => ({
  WhatsAppConnectCard: vi.fn(({ initial }) => <div data-testid="wa-card">{JSON.stringify(initial)}</div>),
}))
```

       Mock createClient with a chainable mock returning configurable rows.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/whatsapp/integrations-page.test.tsx --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `app/(app)/settings/integrations/page.tsx` does NOT contain `OpenRouter` (old copy removed)
    - File contains literal `WhatsAppConnectCard`
    - File contains literal `Connect outbound channels for sending estimates and receiving client messages.`
    - File contains literal `company_whatsapp` (the supabase query)
    - File contains literal `initial` (the prop passed to the card)
    - File starts with `import` (no `'use client'` — it's a server component)
    - `npx vitest run tests/unit/whatsapp/integrations-page.test.tsx` exits 0 with all 5 cases passing (no .todo, no .skip)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>/settings/integrations is a server component mounting WhatsAppConnectCard with initial={null|WhatsAppStatus} loaded from company_whatsapp; OpenRouter placeholder copy is removed; new H1 + subhead from UI-SPEC §Copywriting are present; WhatsAppConnectCard is NOT modified (UI-SPEC lock); integrations-page.test.tsx all 5 cases GREEN.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server component → client component (`<WhatsAppConnectCard>`) | `initial` prop crosses server/client boundary. Only safe fields are serialized: phone_number, phone_number_id, waba_id, status, delivery_format. No tokens or secrets pass through. |
| browser → SendForm → `/api/estimates/[id]/send-whatsapp` | Form values cross to the route in plan 81-02; this plan's surface is just the UI. |
| client form → toast layer (sonner) | Display only; no untrusted HTML interpolation. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-81-06 | Elevation of Privilege | UI gate (`whatsappSendEnabled` prop) | mitigate (defense-in-depth) | The UI hides the tab entirely when `whatsappSendEnabled === false`. The PRIMARY control is server-side (plan 81-02 route returns 402/409). This UI gate prevents accidental discoverability — server gate prevents bypass via direct API call. |
| T-81-02 | Tampering | optional `message` field | mitigate | The Textarea content is sent to the server as `message` (string, no length cap per UI-SPEC). Server treats it as plain WhatsApp body text — no HTML/SQL interpolation. zod schema makes `message` optional+string. |
| T-81-07 | Information Disclosure | Settings integrations page server-side fetch | mitigate | Page fetches `company_whatsapp.phone_number, phone_number_id, waba_id, status, delivery_format` — does NOT fetch any access token field (the platform Meta token lives in `platform_integrations`, not in `company_whatsapp`). No tokens enter the RSC payload. Verified by acceptance_criteria checks on the file content. |
| T-81-03 | Information Disclosure | PDF fallback toast wording | mitigate | The toast copy `'PDF indisponível — enviamos o link'` does NOT include any URL, token, or PII. The owner sees only the human-readable status. |
| T-81-04 | DoS | (deferred to plan 02 server-side accept) | accept | UI has no rate gate (locked decision); user can spam the WhatsApp tab CTA. Server-side `sending` flag debounces multi-click while the request is in-flight. Re-evaluate if abuse observed. |
| T-81-01, T-81-05 | (deferred to plan 02 server-side) | (route) | — | Not applicable to UI files. Plan 81-02 owns the auth + audit trail. |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0 (every prop addition is type-safe end-to-end)
- `npx vitest run tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx` exits 0 with all cases passing
- Manual smoke (deferred to Phase 81 UAT): with a `pro`-tier company that has connected WhatsApp (`status='active'`), open the Send tab of a consolidated estimate; expect Email · SMS (if enabled) · WhatsApp tabs visible. With a `free`-tier company, expect no WhatsApp tab. Visit `/settings/integrations` and expect `WhatsAppConnectCard` to render (its "not connected" state if no row exists, "connected" state otherwise) with the new header copy.
- `grep -rE 'whsec_|sk_live_|sk_test_|sk-ant-|sk-proj-|re_[A-Za-z]|EAAB' app/(app)/settings/integrations/page.tsx components/workspace/send/send-form.tsx` returns no matches (gitleaks pre-check; no secrets baked into UI).
</verification>

<success_criteria>
- `whatsappSendEnabled` prop threads end-to-end with no TypeScript errors
- WhatsApp tab is hidden when `whatsappSendEnabled === false`, visible (and last) when `true`
- WhatsApp tab uses `MessageCircle` icon — distinct from SMS's `MessageSquare`
- Send tab CTA submits to `/api/estimates/[id]/send-whatsapp` (the route from plan 81-02) with E.164 validation
- Success toast `Estimate sent via WhatsApp!` on normal success; `PDF indisponível — enviamos o link` on `fallback: 'share_link'` response (Locked Decision 2)
- `/settings/integrations` mounts `<WhatsAppConnectCard initial={null|WhatsAppStatus}>` with the new header copy
- WhatsAppConnectCard is NOT modified (locked decision; UI-SPEC line 211-213)
- Vitest scaffolds from plan 81-01 are 100% GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-03-SUMMARY.md` documenting:
- Diff summary for each of the 5 modified UI files (1-line each)
- Confirmation that `WhatsAppConnectCard` was NOT modified (UI-SPEC lock)
- Output of `npx tsc --noEmit` and `npx vitest run tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx`
- Screenshot path (if executor captures one during the Phase 81 UAT) showing the three-tab Send card and the new Integrations page header
</output>
