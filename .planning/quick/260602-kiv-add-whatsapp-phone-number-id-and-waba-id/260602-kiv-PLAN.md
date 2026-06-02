---
phase: 260602-kiv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/admin/integrations/whatsapp-config-form.tsx
  - app/admin/integrations/actions.ts
  - lib/admin/integrations-providers.ts
  - app/admin/integrations/integration-category-content.tsx
  - lib/platform-config.ts
  - lib/whatsapp/client.ts
autonomous: true
requirements:
  - QUICK-260602-kiv
must_haves:
  truths:
    - "Admin can save Phone Number ID and WABA ID from /admin/integrations/whatsapp"
    - "Saved IDs persist in platform_integrations.metadata for provider meta_whatsapp"
    - "WhatsApp send/read/typing calls use DB-stored phoneNumberId (not process.env)"
    - "invalidatePlatformConfig() clears the WhatsApp config cache"
  artifacts:
    - path: "app/admin/integrations/whatsapp-config-form.tsx"
      provides: "Two-input form component for Phone Number ID and WABA ID"
    - path: "lib/platform-config.ts"
      provides: "getWhatsAppPlatformConfig() — reads token (decrypted) + IDs from metadata"
    - path: "lib/whatsapp/client.ts"
      provides: "All public functions use getWhatsAppPlatformConfig() not process.env"
  key_links:
    - from: "app/admin/integrations/integration-category-content.tsx"
      to: "WhatsAppConfigForm"
      via: "category.showWhatsAppConfig flag"
    - from: "lib/whatsapp/client.ts"
      to: "lib/platform-config.ts"
      via: "getWhatsAppPlatformConfig()"
---

<objective>
Add Phone Number ID and WABA ID to the WhatsApp admin integrations panel so these values
are DB-configurable without a redeploy. Update lib/whatsapp/client.ts to read all three
credentials (access token, phone number ID) from the database via a new
getWhatsAppPlatformConfig() loader instead of process.env.

Purpose: Removes the requirement to redeploy when rotating Meta credentials. Mirrors the
existing pattern used for Twilio (from_phone stored in metadata, read via getTwilioConfig).

Output: WhatsApp config form in admin UI + getWhatsAppPlatformConfig() in platform-config.ts
+ client.ts migrated off process.env.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260602-kiv-add-whatsapp-phone-number-id-and-waba-id/260602-kiv-PLAN.md

<interfaces>
<!-- Key types and patterns extracted from existing codebase. -->

From lib/platform-config.ts:
```typescript
// Module-level cache pattern used by getBranding and getIntegrationKey:
let brandingCache: { value: Branding; fetchedAt: number } | null = null
const TTL_MS = 30_000

export function invalidatePlatformConfig(): void {
  brandingCache = null
  integrationCache.clear()
  // NEW: must also clear whatsAppConfigCache (added in this task)
}

// getTwilioConfig() pattern to follow for getWhatsAppPlatformConfig():
export async function getTwilioConfig(): Promise<TwilioConfig> {
  const key = await getIntegrationKey('twilio')
  if (!key) return null
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'twilio')
    .maybeSingle()
  const fromPhone = (data?.metadata as { from_phone?: string } | null)?.from_phone ?? ''
  return { ... }
}
```

From lib/admin/integrations-providers.ts:
```typescript
export type Category = {
  slug: string
  title: string
  navLabel?: string
  description?: string
  providers: ReadonlyArray<Provider>
  showAISelector?: boolean
  showFromPhone?: boolean
  // ADD: showWhatsAppConfig?: boolean
}

// whatsapp category (currently no showWhatsAppConfig):
{
  slug: 'whatsapp',
  title: 'WhatsApp',
  description: 'Inbound message handling and estimate delivery via WhatsApp.',
  providers: [{ id: 'meta_whatsapp', title: 'Meta WhatsApp', ... }],
}
```

From app/admin/integrations/integration-category-content.tsx:
```typescript
// Existing showFromPhone pattern (exact pattern to replicate for showWhatsAppConfig):
let twilioFromPhone = ''
if (category.showFromPhone) {
  const svc = requireServiceClient()
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'twilio')
    .maybeSingle()
  twilioFromPhone = (data?.metadata as { from_phone?: string } | null)?.from_phone ?? ''
}
// Rendered as: {category.showFromPhone && <TwilioFromPhoneForm current={twilioFromPhone} />}
```

From app/admin/integrations/actions.ts (saveTwilioFromPhone pattern):
```typescript
export async function saveTwilioFromPhone(fromPhone: string): Promise<ActionResult> {
  const ctx = await requireAdmin()
  const svc = requireServiceClient()
  const { data: existing } = await svc
    .from('platform_integrations')
    .select('ciphertext, iv, auth_tag, metadata')
    .eq('provider', 'twilio')
    .maybeSingle()
  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'twilio',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), from_phone: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) return { ok: false, message: error.message }
  invalidatePlatformConfig()
  revalidatePath('/admin/integrations')
  void logAdminAction({ ... })
  return { ok: true }
}
```

ActionResult type: { ok: boolean; message?: string }

From lib/whatsapp/client.ts (current process.env usage to replace):
```typescript
// These three functions all read:
const token = process.env.META_WHATSAPP_ACCESS_TOKEN
const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID
// downloadWhatsAppMedia reads only token

// After migration they should call:
const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add saveWhatsAppConfig action, Category type flag, and getWhatsAppPlatformConfig loader</name>
  <files>
    app/admin/integrations/actions.ts
    lib/admin/integrations-providers.ts
    lib/platform-config.ts
  </files>
  <action>
**actions.ts** — add `saveWhatsAppConfig` export after `saveTwilioFromPhone` (around line 337).
Follow saveTwilioFromPhone exactly:
- `requireAdmin()` then `requireServiceClient()`
- Read existing `meta_whatsapp` row (select ciphertext, iv, auth_tag, metadata)
- Upsert with `onConflict: 'provider'`, preserving ciphertext/iv/auth_tag, merging metadata:
  `{ ...existing.metadata, phone_number_id: input.phoneNumberId.trim(), waba_id: input.wabaId.trim() }`
- Call `invalidatePlatformConfig()` and `revalidatePath('/admin/integrations')`
- Fire-and-forget `logAdminAction` with targetId `'meta_whatsapp_config'` and metadata
  `{ phone_number_id, waba_id }` (plain text, not sensitive)
- Return `{ ok: true }` on success, `{ ok: false, message: error.message }` on error

Input type: `{ phoneNumberId: string; wabaId: string }`

**integrations-providers.ts** — two changes:
1. Add `showWhatsAppConfig?: boolean` to the `Category` type definition (after `showFromPhone?: boolean`)
2. Add `showWhatsAppConfig: true` to the whatsapp category object

**platform-config.ts** — two changes:
1. Add a module-level mutable cache variable after the existing `integrationCache` declaration:
   `let whatsAppConfigCache: { value: WhatsAppPlatformConfig; fetchedAt: number } | null = null`
   Export the `WhatsAppPlatformConfig` interface:
   ```typescript
   export interface WhatsAppPlatformConfig {
     accessToken: string | null
     phoneNumberId: string | null
     wabaId: string | null
   }
   ```

2. Add `getWhatsAppPlatformConfig()` export following the getTwilioConfig pattern:
   - Check TTL cache first (TTL_MS = 30_000)
   - `const key = await getIntegrationKey('meta_whatsapp')` for the access token
   - `createServiceClient()` null-check
   - Query `platform_integrations` for `metadata` where `provider = 'meta_whatsapp'`
   - Cast metadata as `{ phone_number_id?: string; waba_id?: string } | null`
   - Env var fallbacks for local dev:
     - `accessToken`: `key ?? process.env.META_WHATSAPP_ACCESS_TOKEN ?? null`
     - `phoneNumberId`: `meta?.phone_number_id ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? null`
     - `wabaId`: `meta?.waba_id ?? process.env.META_WHATSAPP_WABA_ID ?? null`
   - Store result in `whatsAppConfigCache` and return it

3. In `invalidatePlatformConfig()`, add `whatsAppConfigCache = null` alongside the existing `brandingCache = null`

NOTE: `whatsAppConfigCache` must be declared with `let` (not `const`) so `invalidatePlatformConfig` can assign `null`.
  </action>
  <verify>npx tsc --noEmit 2>&1 | head -30</verify>
  <done>
    - `saveWhatsAppConfig` exported from actions.ts with correct upsert logic
    - `Category` type has `showWhatsAppConfig?: boolean`
    - whatsapp category has `showWhatsAppConfig: true`
    - `getWhatsAppPlatformConfig()` exported from platform-config.ts
    - `invalidatePlatformConfig()` clears `whatsAppConfigCache`
    - `tsc --noEmit` passes with no new errors
  </done>
</task>

<task type="auto">
  <name>Task 2: WhatsAppConfigForm component, category content wiring, and client.ts migration</name>
  <files>
    app/admin/integrations/whatsapp-config-form.tsx
    app/admin/integrations/integration-category-content.tsx
    lib/whatsapp/client.ts
  </files>
  <action>
**whatsapp-config-form.tsx** — create new client component using the exact implementation from
the planning context. Key points:
- `'use client'` directive at top
- Props: `{ currentPhoneNumberId: string; currentWabaId: string }`
- Imports: `useState`, `useTransition` from react; `Input`, `Button`, `Label` from shadcn/ui;
  `Loader2`, `Save` from lucide-react; `toast` from sonner; `saveWhatsAppConfig` from `./actions`
- Two text inputs side-by-side on sm screens (`grid gap-4 sm:grid-cols-2 max-w-2xl`)
- Input IDs: `wa-phone-number-id` and `wa-waba-id`
- Placeholders: `123456789012345` for both
- Save button with spinner when `isPending`, min-h-[44px] for touch target
- On success: `toast.success('WhatsApp config saved.')`
- On error: `toast.error(result.message)`
- Card wrapper matches TwilioFromPhoneForm style: `rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4`

**integration-category-content.tsx** — two changes:
1. Import `WhatsAppConfigForm` from `'./whatsapp-config-form'`
2. After the `twilioFromPhone` block, add the WhatsApp config block:
   ```typescript
   let waPhoneNumberId = ''
   let waWabaId = ''
   if (category.showWhatsAppConfig) {
     const svc = requireServiceClient()
     const { data } = await svc
       .from('platform_integrations')
       .select('metadata')
       .eq('provider', 'meta_whatsapp')
       .maybeSingle()
     const meta = (data?.metadata as { phone_number_id?: string; waba_id?: string } | null) ?? {}
     waPhoneNumberId = meta.phone_number_id ?? ''
     waWabaId = meta.waba_id ?? ''
   }
   ```
3. In the JSX return, add after `{category.showFromPhone && ...}`:
   ```tsx
   {category.showWhatsAppConfig && (
     <WhatsAppConfigForm
       currentPhoneNumberId={waPhoneNumberId}
       currentWabaId={waWabaId}
     />
   )}
   ```

**client.ts** — migrate all process.env reads to getWhatsAppPlatformConfig():
1. Add import at top: `import { getWhatsAppPlatformConfig } from '@/lib/platform-config'`
2. `sendWhatsAppMessage`: replace the two `const token/phoneNumberId = process.env...` lines with:
   ```typescript
   const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()
   if (!token || !phoneNumberId) throw new Error('[WhatsApp] Missing platform config: access token or phone number ID not set')
   ```
3. `markMessageAsRead`: same replacement — `const { accessToken: token, phoneNumberId } = await getWhatsAppPlatformConfig()`
4. `sendTypingIndicator`: same replacement
5. `downloadWhatsAppMedia`: replace only `const token = process.env.META_WHATSAPP_ACCESS_TOKEN` with:
   ```typescript
   const { accessToken: token } = await getWhatsAppPlatformConfig()
   ```
   This function doesn't use phoneNumberId so no guard needed (existing error handling covers null token implicitly via Bearer auth failure — but add explicit check: `if (!token) throw new Error('[WhatsApp] Missing platform config: access token not set')`)

IMPORTANT: Do NOT remove the `GRAPH_BASE` constant. Keep all existing error handling and fire-and-forget patterns intact.
  </action>
  <verify>npx tsc --noEmit 2>&1 | head -30</verify>
  <done>
    - `whatsapp-config-form.tsx` exists and renders two text inputs with Save button
    - `integration-category-content.tsx` renders `WhatsAppConfigForm` when `showWhatsAppConfig` is true
    - `client.ts` has zero `process.env.META_WHATSAPP_` references
    - `tsc --noEmit` passes with no new errors
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Admin browser → saveWhatsAppConfig | Admin-only action; phone_number_id and waba_id are non-secret identifiers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kiv-01 | Elevation of Privilege | saveWhatsAppConfig | mitigate | requireAdmin() gate at action entry (established pattern from saveTwilioFromPhone) |
| T-kiv-02 | Information Disclosure | getWhatsAppPlatformConfig cache | accept | phone_number_id and waba_id are non-secret Meta platform identifiers (appear in API URLs); access token is encrypted via existing getIntegrationKey path |
| T-kiv-03 | Tampering | metadata spread in upsert | accept | Existing meta fields (e.g. any future keys) are preserved via `...existing.metadata` spread; admin access required to call action |
</threat_model>

<verification>
After both tasks complete, verify end-to-end:
1. `npx tsc --noEmit` — zero errors
2. `grep -r "META_WHATSAPP_PHONE_NUMBER_ID\|META_WHATSAPP_ACCESS_TOKEN" lib/whatsapp/client.ts` — should return no matches
3. Visit `/admin/integrations/whatsapp` — "WhatsApp Platform Config" card appears below the token card
4. Enter a Phone Number ID and WABA ID, click Save — toast shows "WhatsApp config saved."
5. Reload the page — saved values populate the inputs
</verification>

<success_criteria>
- `/admin/integrations/whatsapp` shows the PhoneNumberId + WABA ID form below the token card
- Saving stores `phone_number_id` and `waba_id` in `platform_integrations.metadata` for `meta_whatsapp` without disturbing existing ciphertext
- `lib/whatsapp/client.ts` has no `process.env.META_WHATSAPP_*` references
- `getWhatsAppPlatformConfig()` falls back to env vars for local dev when DB row is absent
- `invalidatePlatformConfig()` clears the new cache entry
- TypeScript strict mode passes (`tsc --noEmit`)
</success_criteria>

<output>
After completion, create `.planning/quick/260602-kiv-add-whatsapp-phone-number-id-and-waba-id/260602-kiv-SUMMARY.md`
</output>
