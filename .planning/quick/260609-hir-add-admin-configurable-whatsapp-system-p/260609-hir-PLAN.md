---
phase: quick-260609-hir
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/ai/types.ts
  - lib/ai/prompt-builder.ts
  - lib/platform-config.ts
  - lib/services/generate-estimate.ts
  - lib/whatsapp/estimate-graph.ts
  - app/admin/integrations/actions.ts
  - app/admin/integrations/whatsapp-system-prompt-form.tsx
  - app/admin/integrations/integration-category-content.tsx
autonomous: true
requirements: [WA-SYSPROMPT-01]

must_haves:
  truths:
    - "A platform admin can enter free-form text in /admin/integrations (WhatsApp category) and save it"
    - "The saved text is appended to the estimate system prompt ONLY for WhatsApp-channel estimate generation"
    - "Web/MCP estimate generation is unaffected (does not fetch or append the admin text)"
    - "The base prompt's currency, language, price-book, and Security rules remain intact, with Security still LAST"
    - "The setting is platform-wide (single global value, stored in platform_integrations.meta_whatsapp metadata)"
  artifacts:
    - path: "lib/platform-config.ts"
      provides: "getWhatsAppSystemPrompt() reader"
      contains: "export async function getWhatsAppSystemPrompt"
    - path: "lib/ai/prompt-builder.ts"
      provides: "extraInstructions appended before Security block"
      contains: "Additional Instructions"
    - path: "app/admin/integrations/actions.ts"
      provides: "saveWhatsAppSystemPrompt server action"
      contains: "export async function saveWhatsAppSystemPrompt"
    - path: "app/admin/integrations/whatsapp-system-prompt-form.tsx"
      provides: "Client form with Textarea + char counter + Save"
      contains: "saveWhatsAppSystemPrompt"
  key_links:
    - from: "lib/whatsapp/estimate-graph.ts"
      to: "generateEstimateForProject(..., { channel: 'whatsapp' })"
      via: "generateEstimateNode call"
      pattern: "channel: 'whatsapp'"
    - from: "lib/services/generate-estimate.ts"
      to: "getWhatsAppSystemPrompt"
      via: "conditional fetch when options.channel === 'whatsapp'"
      pattern: "getWhatsAppSystemPrompt"
    - from: "app/admin/integrations/integration-category-content.tsx"
      to: "WhatsAppSystemPromptForm"
      via: "render in showWhatsAppConfig block"
      pattern: "WhatsAppSystemPromptForm"
---

<objective>
Add an admin-configurable, platform-wide WhatsApp system prompt that is appended to the base estimate system prompt ONLY when an estimate is generated from the WhatsApp channel.

Purpose: Lets the platform owner steer WhatsApp-originated estimate generation (tone, formatting, extra rules) without code changes, without affecting web or MCP estimate generation, and without weakening the existing currency/language/price-book/Security guardrails.

Output:
- Backend/AI plumbing: a `getWhatsAppSystemPrompt()` reader, an `extraInstructions` field on `EstimateInput`, prompt-builder appends it before the Security block, the generate-estimate service fetches it only for the WhatsApp channel, and the WhatsApp graph passes `channel: 'whatsapp'`.
- Admin UX: a `saveWhatsAppSystemPrompt` server action and a client form rendered in the WhatsApp integrations category.

No DB migration — `platform_integrations.metadata` is an existing jsonb column.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
<!-- Verified from the codebase during planning. Use these directly — no exploration needed. -->

From lib/platform-config.ts (existing pattern to mirror — getWhatsAppDisplayNumber):
```typescript
export async function getWhatsAppDisplayNumber(): Promise<string | null> {
  const fromEnv = process.env.META_WHATSAPP_DISPLAY_NUMBER ?? null
  const svc = createServiceClient()
  if (!svc) return fromEnv
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'meta_whatsapp')
    .maybeSingle()
  const fromDb = (data?.metadata as { display_number?: string } | null)?.display_number
  const value = (fromDb && fromDb.trim()) || fromEnv
  return value && value.trim() ? value.trim() : null
}
```
NOTE: `createServiceClient` and `invalidatePlatformConfig` are already imported/defined in this file.

From lib/ai/prompt-builder.ts — the Security block is currently the LAST appended section (lines ~62-63). The price-book block is appended just before it. Insert the new block BETWEEN them.

From app/admin/integrations/actions.ts (existing pattern to mirror — saveWhatsAppConfig). The audit-log helper requires actorId + actorEmail:
```typescript
// lib/admin/audit-log.ts — logAdminAction signature
interface LogParams {
  actorId: string        // REQUIRED — pass ctx.userId
  actorEmail: string     // REQUIRED — pass ctx.email
  action: AuditAction    // 'integration.save' is a valid value
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown>
}
```
`requireAdmin()` returns `ctx` with `{ userId, email }`. `requireServiceClient`, `invalidatePlatformConfig`, `revalidatePath`, `logAdminAction` are all already imported in actions.ts.

From app/admin/integrations/integration-category-content.tsx — the `if (category.showWhatsAppConfig)` block ALREADY queries the meta_whatsapp metadata row and destructures `phone_number_id`, `waba_id`, `display_number`. Add `system_prompt` to that SAME destructure (no extra query). The `<WhatsAppConfigForm .../>` is rendered inside the existing `{category.showWhatsAppConfig && (...)}` JSX.

From lib/services/generate-estimate.ts — `GenerateEstimateOptions` interface (add `channel`), and `estimateInput` object built around line 147 (set `extraInstructions` there).

From lib/whatsapp/estimate-graph.ts — `generateEstimateNode` (line ~241) calls `generateEstimateForProject(state.companyId, state.projectId)` with no options.

Textarea component exists and is exported:
```typescript
// @/components/ui/textarea
export { Textarea }  // function Textarea({ className, ...props }: React.ComponentProps<"textarea">)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend + AI plumbing (reader, type, prompt-builder, service, WhatsApp graph)</name>
  <files>lib/platform-config.ts, lib/ai/types.ts, lib/ai/prompt-builder.ts, lib/services/generate-estimate.ts, lib/whatsapp/estimate-graph.ts</files>
  <action>
Wire the WhatsApp-only system-prompt addendum through the AI pipeline. Five edits:

1. `lib/platform-config.ts` — Add a new exported async function `getWhatsAppSystemPrompt(): Promise<string | null>`. Mirror `getWhatsAppDisplayNumber()` exactly (same file). Use `createServiceClient()` (already imported); if `svc` is null, return `null`. Query `.from('platform_integrations').select('metadata').eq('provider', 'meta_whatsapp').maybeSingle()`. Read `(data?.metadata as { system_prompt?: string } | null)?.system_prompt`, trim it, and return the trimmed value if non-empty, else `null`. Add a short doc comment: platform-wide admin-configured addendum appended ONLY for WhatsApp-channel estimate generation. Do NOT add a separate TTL cache — read fresh like getWhatsAppDisplayNumber (cache invalidation already covered by invalidatePlatformConfig clearing nothing extra; freshness preferred for a low-frequency admin setting).

2. `lib/ai/types.ts` — Add an optional field to the `EstimateInput` type:
```typescript
  /**
   * Admin-configured, platform-wide WhatsApp-only system prompt addendum.
   * Appended to the base system prompt by buildSystemPrompt(), AFTER the
   * price-book block and BEFORE the Security block. Only set for WhatsApp-channel
   * estimate generation; null/undefined for web + MCP.
   */
  extraInstructions?: string
```

3. `lib/ai/prompt-builder.ts` — In `buildSystemPrompt()`, AFTER the price-book if/else block (the `if (input.priceBookItems.length > 0) { ... } else { ... }`) and BEFORE the `prompt += `\n\n## Security ...`` line, insert:
```typescript
  // Admin-configured WhatsApp-only addendum (trusted text — no XML escaping).
  // Inserted before Security so the Security block remains the LAST section.
  if (input.extraInstructions?.trim()) {
    prompt += `\n\n## Additional Instructions\n${input.extraInstructions.trim()}`
  }
```
The Security block MUST remain the final appended section. Do NOT run this text through `sanitizeField`/`escapeXml` — it is admin-trusted.

4. `lib/services/generate-estimate.ts` — Add `channel?: 'whatsapp'` to the `GenerateEstimateOptions` interface with a doc comment (when 'whatsapp', the admin WhatsApp system-prompt addendum is fetched and appended; omit for web/MCP). Import `getWhatsAppSystemPrompt` from `@/lib/platform-config` (add to existing imports — there is no current platform-config import in this file, so add a new import line). After the `estimateInput` object is built (around line 147-162) and BEFORE `const provider = await getAIProvider(companyId)`, add:
```typescript
  // WhatsApp-only: append the platform admin's system-prompt addendum.
  // Not fetched for web/MCP so those channels are unaffected.
  if (options.channel === 'whatsapp') {
    const extra = await getWhatsAppSystemPrompt()
    if (extra) estimateInput.extraInstructions = extra
  }
```
Change `estimateInput` from `const` to allow mutation only if needed — it is declared `const estimateInput: EstimateInput = {...}`; mutating a property is fine on a const object, so no change to the declaration is required.

5. `lib/whatsapp/estimate-graph.ts` — In `generateEstimateNode`, change the call from `generateEstimateForProject(state.companyId, state.projectId)` to `generateEstimateForProject(state.companyId, state.projectId, { channel: 'whatsapp' })`. This is the ONLY call site that should pass the whatsapp channel.

Do not touch any other generateEstimateForProject call sites (web route, MCP) — they must NOT receive `channel: 'whatsapp'`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `getWhatsAppSystemPrompt` exported from lib/platform-config.ts, mirrors getWhatsAppDisplayNumber, returns trimmed string or null.
- `EstimateInput.extraInstructions?: string` added.
- `buildSystemPrompt` appends `## Additional Instructions` only when extraInstructions is non-empty, positioned before `## Security`.
- `GenerateEstimateOptions.channel?: 'whatsapp'` added; service fetches + sets extraInstructions only when channel === 'whatsapp'.
- estimate-graph.ts generateEstimateNode passes `{ channel: 'whatsapp' }`.
- `npx tsc --noEmit` passes with no new errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Admin server action + UI form + category wiring</name>
  <files>app/admin/integrations/actions.ts, app/admin/integrations/whatsapp-system-prompt-form.tsx, app/admin/integrations/integration-category-content.tsx</files>
  <action>
Add the admin save action, the client form, and render it in the WhatsApp integrations category.

1. `app/admin/integrations/actions.ts` — Add a new exported server action `saveWhatsAppSystemPrompt(prompt: string): Promise<ActionResult>`. Mirror `saveWhatsAppConfig` in the same file. Steps:
   - `const ctx = await requireAdmin()`
   - `const trimmed = prompt.trim()`
   - Length cap: `if (trimmed.length > 4000) return { ok: false, message: 'System prompt must be 4000 characters or fewer.' }`
   - `const svc = requireServiceClient()`
   - Read existing row: `.from('platform_integrations').select('ciphertext, iv, auth_tag, metadata').eq('provider', 'meta_whatsapp').maybeSingle()` → `data: existing`
   - Upsert preserving encrypted fields and merging metadata:
```typescript
  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'meta_whatsapp',
      ciphertext: existing?.ciphertext ?? null,
      iv: existing?.iv ?? null,
      auth_tag: existing?.auth_tag ?? null,
      metadata: { ...((existing?.metadata as object) ?? {}), system_prompt: trimmed },
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' }
  )
  if (error) return { ok: false, message: error.message }
```
   - `invalidatePlatformConfig()`
   - `revalidatePath('/admin/integrations')`
   - Audit log (note: actorId/actorEmail are REQUIRED):
```typescript
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'integration.save',
    targetType: 'integration',
    targetId: 'meta_whatsapp_system_prompt',
    metadata: { length: trimmed.length },
  })
  return { ok: true }
```
All of `requireAdmin`, `requireServiceClient`, `invalidatePlatformConfig`, `revalidatePath`, `logAdminAction`, `ActionResult` are already imported in this file.

2. NEW FILE `app/admin/integrations/whatsapp-system-prompt-form.tsx` — Client component mirroring `whatsapp-config-form.tsx` style. Structure:
   - `'use client'`
   - Imports: `useState, useTransition` from react; `Textarea` from `@/components/ui/textarea`; `Button` from `@/components/ui/button`; `Label` from `@/components/ui/label`; `Loader2, Save` from `lucide-react`; `toast` from `sonner`; `saveWhatsAppSystemPrompt` from `./actions`.
   - Props: `interface WhatsAppSystemPromptFormProps { currentPrompt: string }`. Export `function WhatsAppSystemPromptForm({ currentPrompt }: WhatsAppSystemPromptFormProps)`.
   - State: `const [prompt, setPrompt] = useState(currentPrompt)`, `const [isPending, startTransition] = useTransition()`.
   - `const MAX = 4000`.
   - `handleSave`: `startTransition(async () => { const result = await saveWhatsAppSystemPrompt(prompt); if (!result.ok) toast.error(result.message); else toast.success('WhatsApp system prompt saved.') })`.
   - JSX: outer `<div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">` containing:
     - A heading block: `<h3 className="text-sm font-semibold">WhatsApp System Prompt</h3>` and a `<p className="text-sm text-muted-foreground mt-1">` helper explaining: this text is appended to the estimate generation prompt ONLY for estimates generated via WhatsApp; the base currency, language, price-book, and security rules still apply.
     - `<Label htmlFor="wa-system-prompt">Additional instructions</Label>` + `<Textarea id="wa-system-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={MAX} rows={8} disabled={isPending} placeholder="e.g. Always include a 1-year workmanship warranty line and keep section titles short." />`
     - Char counter: `<p className="text-xs text-muted-foreground">{prompt.length} / {MAX}</p>`
     - Save button identical to whatsapp-config-form's: `<Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">{isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save</Button>`

3. `app/admin/integrations/integration-category-content.tsx` —
   - Add import: `import { WhatsAppSystemPromptForm } from './whatsapp-system-prompt-form'` (next to the existing `WhatsAppConfigForm` import).
   - In the existing `if (category.showWhatsAppConfig) { ... }` block, the metadata is already read and typed. Add `system_prompt?: string` to that inline metadata type and add `let waSystemPrompt = ''` alongside `waPhoneNumberId`/`waWabaId`/`waDisplayNumber`, then set `waSystemPrompt = meta.system_prompt ?? ''`.
   - In the `{category.showWhatsAppConfig && ( ... )}` JSX block, render `<WhatsAppSystemPromptForm currentPrompt={waSystemPrompt} />` immediately AFTER the existing `<WhatsAppConfigForm .../>`. To return two sibling elements, wrap both in a React fragment `<>...</>` (the block currently returns a single `<WhatsAppConfigForm .../>`).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `saveWhatsAppSystemPrompt` exported from actions.ts: requireAdmin, 4000-char cap, preserves ciphertext/iv/auth_tag, merges `system_prompt` into metadata, invalidatePlatformConfig + revalidatePath, audit log with actorId/actorEmail.
- New whatsapp-system-prompt-form.tsx renders Textarea + char counter + Save, calls saveWhatsAppSystemPrompt, mirrors whatsapp-config-form styling.
- integration-category-content.tsx reads `system_prompt` from the existing meta_whatsapp query and renders `<WhatsAppSystemPromptForm currentPrompt={waSystemPrompt} />` after `<WhatsAppConfigForm>`.
- `npx tsc --noEmit` passes with no new errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser admin form → saveWhatsAppSystemPrompt | Admin-supplied free text crosses into the AI system prompt |
| platform_integrations.metadata → buildSystemPrompt | Stored admin text is injected (unescaped) into the LLM system prompt |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hir-01 | Elevation | saveWhatsAppSystemPrompt server action | mitigate | `requireAdmin()` gates the action; only platform admins can write the prompt (same gate as saveWhatsAppConfig). |
| T-hir-02 | Tampering | prompt-builder Security block ordering | mitigate | Addendum inserted BEFORE the `## Security` block so the untrusted-user-data guardrail remains the LAST and authoritative instruction; admin text cannot displace it. |
| T-hir-03 | Denial of Service | unbounded prompt length → token cost | mitigate | 4000-char cap enforced server-side in saveWhatsAppSystemPrompt (and maxLength on the Textarea as UX hint). |
| T-hir-04 | Information disclosure | admin text reaching non-WhatsApp channels | accept | By design only WhatsApp channel fetches it (channel-gated in generate-estimate.ts); web/MCP never read it. Admin-authored, low sensitivity. |
| T-hir-05 | Tampering | admin text is not XML-escaped | accept | Text is admin-trusted (requireAdmin gate); escaping is reserved for untrusted job-site data per existing prompt-builder design. No external/user input path writes this field. |
</threat_model>

<verification>
- `npx tsc --noEmit` passes (TypeScript strict).
- Grep confirms `getWhatsAppSystemPrompt` exists in lib/platform-config.ts and is imported in lib/services/generate-estimate.ts.
- Grep confirms `channel: 'whatsapp'` appears in lib/whatsapp/estimate-graph.ts and NOT in the web route / MCP create_estimate paths.
- Grep confirms `## Additional Instructions` is appended before `## Security` in lib/ai/prompt-builder.ts.
- Manual (optional, post-merge): in /admin/integrations WhatsApp category, save a prompt; generate a WhatsApp estimate and confirm the addendum influences output; generate a web estimate and confirm it does not.
</verification>

<success_criteria>
- Admin can set/clear a platform-wide WhatsApp system prompt at /admin/integrations.
- The text is appended (before Security) ONLY for WhatsApp-channel estimate generation.
- Web and MCP estimate generation are byte-for-byte unaffected (no fetch, no append).
- Base prompt currency/language/price-book/Security sections intact; Security remains last.
- No DB migration introduced; `platform_integrations.metadata.system_prompt` carries the value.
- Project typechecks (`npx tsc --noEmit`).
</success_criteria>

<output>
After completion, create `.planning/quick/260609-hir-add-admin-configurable-whatsapp-system-p/260609-hir-SUMMARY.md`.
</output>
