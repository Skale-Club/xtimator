---
phase: quick-260624-ajz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/admin/integrations/actions.ts
  - lib/admin/integrations-providers.ts
  - app/admin/integrations/integration-category-content.tsx
  - app/admin/integrations/price-research-config-form.tsx
  - tests/unit/admin/price-research-config.test.ts
autonomous: true
requirements: [PRSRC-ADMIN-01]

must_haves:
  truths:
    - "An admin can open /admin/integrations/price-research and see the current research source + engine + enabled state"
    - "Saving with enable=true + source=openrouter_web persists metadata { research_source: 'openrouter_web', research_engine: <exa|native> } so getPriceResearchProvider() resolves a provider"
    - "Saving with enable=false persists a non-activating state so getPriceResearchProvider() returns null (dormant)"
    - "A non-admin calling setPriceResearchSource is rejected (requireAdmin throws notFound before any DB write)"
  artifacts:
    - path: "app/admin/integrations/actions.ts"
      provides: "setPriceResearchSource server action (requireAdmin-gated, service-role upsert)"
      contains: "export async function setPriceResearchSource"
    - path: "lib/admin/integrations-providers.ts"
      provides: "price-research category with showPriceResearchConfig flag + metadata loader"
      contains: "showPriceResearchConfig"
    - path: "app/admin/integrations/price-research-config-form.tsx"
      provides: "client form: enable toggle + source select + engine select wired to the action"
      contains: "setPriceResearchSource"
    - path: "tests/unit/admin/price-research-config.test.ts"
      provides: "unit test: upsert metadata shape, disable→dormant, requireAdmin gate"
      contains: "setPriceResearchSource"
  key_links:
    - from: "app/admin/integrations/price-research-config-form.tsx"
      to: "setPriceResearchSource"
      via: "import from ./actions + call in useTransition"
      pattern: "setPriceResearchSource"
    - from: "app/admin/integrations/actions.ts"
      to: "platform_integrations (provider='price_research')"
      via: "service-client upsert onConflict provider"
      pattern: "provider: 'price_research'"
    - from: "lib/estimate/price-research/provider.ts (getActiveResearchSource)"
      to: "metadata.research_source"
      via: "reads research_source ∈ {openrouter_web, anthropic_web}; else null"
      pattern: "research_source"
---

<objective>
Build the deferred super-admin control that configures the v4.6 price-research source.
`getActiveResearchSource()` (lib/estimate/price-research/provider.ts) reads
`platform_integrations` row `provider='price_research'`, `metadata.research_source`
(activates ONLY on `'openrouter_web'`/`'anthropic_web'`; anything else → null = dormant
no-op). `resolveEngine()` (adapters/openrouter-web.ts) reads `metadata.research_engine`
(`'native'` only for the literal, else `'exa'`). No admin UI ever wrote that row — this plan adds it.

Purpose: let an admin enable/disable researched-pricing and pick source + engine from the
existing /admin/integrations surface, with no redeploy (the readers query the DB live).
Output: a requireAdmin-gated server action, a config card in the integrations UI (EN/PT/ES),
and a unit test covering the upsert shape, the disable→dormant path, and the admin gate.

NO API keys involved (price_research reuses the existing OpenRouter/Anthropic keys). Do NOT
apply anything to the remote DB. Mirror the EXISTING admin integrations action+UI pattern.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Readers this control feeds (do NOT modify — confirm the persisted shape matches them)
@lib/estimate/price-research/provider.ts
@lib/estimate/price-research/adapters/openrouter-web.ts

# Mirror targets — the EXISTING action + UI pattern to copy, do not invent a new one
@app/admin/integrations/actions.ts
@lib/admin/integrations-providers.ts
@app/admin/integrations/integration-category-content.tsx
@app/admin/integrations/xphere-config-form.tsx
@app/admin/integrations/ai-provider-selector.tsx
@tests/unit/admin/save-seo.test.ts

<interfaces>
<!-- The reader logic the saved metadata MUST satisfy (provider.ts getActiveResearchSource):
       const source = metadata?.research_source
       if (source === 'openrouter_web') return 'openrouter_web'
       if (source === 'anthropic_web') return 'anthropic_web'
       return null                       // ← any other value = DORMANT
     resolveEngine() (openrouter-web.ts): engine === 'native' ? 'native' : 'exa'
     => DISABLE = persist research_source: null (non-matching) → reader returns null. -->

From lib/estimate/price-research/provider.ts:
```typescript
export type PriceResearchSource = 'openrouter_web' | 'anthropic_web'
export async function getPriceResearchProvider(): Promise<PriceResearchProvider | null>
```

Existing upsert pattern (app/admin/integrations/actions.ts — saveWhatsAppConfig / setActiveAIProvider):
```typescript
const ctx = await requireAdmin()                  // throws notFound() for non-admins
const svc = requireServiceClient()
// read existing metadata to merge, then:
await svc.from('platform_integrations').upsert(
  { provider, ciphertext: null, iv: null, auth_tag: null,
    metadata: { ...prevMeta, ...changes },
    updated_at: new Date().toISOString(), updated_by: ctx.userId },
  { onConflict: 'provider' })
invalidatePlatformConfig(); revalidatePath('/admin/integrations')
```

Category shape (lib/admin/integrations-providers.ts) — a config-only category uses an EMPTY
`providers: []` array + a `show*Config` flag (mirrors Twilio's showFromPhone), so NO encrypted
IntegrationCard renders.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: setPriceResearchSource server action (requireAdmin + service-role upsert) + unit test</name>
  <read_first>
    - app/admin/integrations/actions.ts (mirror setActiveAIProvider + saveWhatsAppConfig: requireAdmin → read prev metadata → upsert onConflict provider → invalidate + revalidate + logAdminAction)
    - lib/estimate/price-research/provider.ts (getActiveResearchSource — confirm the activation/dormant contract the upsert must satisfy)
    - tests/unit/admin/save-seo.test.ts (mirror the mock harness: requireAdmin mock, chainable from() stub capturing lastUpsertPayload, platform-config + audit-log + next/cache mocks)
  </read_first>
  <action>
    Append `setPriceResearchSource` to app/admin/integrations/actions.ts (same file, same
    `ActionResult` type, same imports already present: requireAdmin, requireServiceClient,
    invalidatePlatformConfig, revalidatePath, logAdminAction).

    Signature:
    ```typescript
    export async function setPriceResearchSource(input: {
      enabled: boolean
      source: 'openrouter_web' | 'anthropic_web'
      engine: 'exa' | 'native'
    }): Promise<ActionResult>
    ```

    Body (mirror setActiveAIProvider exactly):
    1. `const ctx = await requireAdmin()` — FIRST line, before any DB access (the gate).
    2. Validate inline (no new schema file needed): if `input.source` is not one of
       `['openrouter_web','anthropic_web']` → return `{ ok: false, message: 'Invalid source' }`;
       if `input.engine` is not one of `['exa','native']` → return `{ ok: false, message: 'Invalid engine' }`.
    3. `const svc = requireServiceClient()`. Best-effort read existing metadata to preserve any
       unrelated keys (try/catch, default `{}`):
       ```typescript
       let prevMeta: Record<string, unknown> = {}
       try {
         const { data: prev } = await svc.from('platform_integrations')
           .select('metadata').eq('provider', 'price_research').maybeSingle()
         prevMeta = (prev?.metadata ?? {}) as Record<string, unknown>
       } catch { /* non-fatal */ }
       ```
    4. Build the disable-aware metadata. ENABLE writes the activating source; DISABLE writes a
       NON-matching value so getActiveResearchSource() returns null (dormant):
       ```typescript
       const metadata = {
         ...prevMeta,
         research_source: input.enabled ? input.source : null,
         research_engine: input.engine,
       }
       ```
       (research_source: null is NOT in {openrouter_web, anthropic_web} → reader returns null →
       getPriceResearchProvider() resolves null → Phase-108 enrichment is a safe no-op. research_engine
       is preserved either way so re-enabling restores the prior engine.)
    5. Upsert:
       ```typescript
       const { error } = await svc.from('platform_integrations').upsert(
         { provider: 'price_research', ciphertext: null, iv: null, auth_tag: null,
           metadata, updated_at: new Date().toISOString(), updated_by: ctx.userId },
         { onConflict: 'provider' })
       if (error) return { ok: false, message: error.message }
       ```
    6. `invalidatePlatformConfig(); revalidatePath('/admin/integrations')`.
    7. `void logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: 'price_research.set',
       targetType: 'price_research', targetId: input.enabled ? input.source : 'disabled',
       metadata: { enabled: input.enabled, source: input.source, engine: input.engine } })`.
    8. `return { ok: true, message: input.enabled ? \`Price research enabled (\${input.source}).\` : 'Price research disabled.' }`.

    Then create tests/unit/admin/price-research-config.test.ts — copy save-seo.test.ts's mock
    harness verbatim (requireAdmin mock returning `{ userId:'admin-1', email:'a@x.com' }`;
    chainable `from()` stub whose `.upsert(p)` records `lastUpsertPayload = p` and returns
    `{ error: null }`, and `.select().eq().maybeSingle()` returns `{ data: { metadata: {} }, error: null }`;
    mock `@/lib/platform-config` → `{ invalidatePlatformConfig: vi.fn() }`, `@/lib/admin/audit-log`
    → `{ logAdminAction: vi.fn(async()=>undefined) }`, `next/cache` → `{ revalidatePath: vi.fn() }`).
    Import `{ setPriceResearchSource } from '@/app/admin/integrations/actions'` AFTER the mocks.
    Tests:
    - "enable openrouter_web + exa → upsert metadata.research_source='openrouter_web' & research_engine='exa'":
      call `{ enabled:true, source:'openrouter_web', engine:'exa' }`; assert `res.ok===true`,
      `lastUpsertPayload.provider==='price_research'`, `lastUpsertPayload.metadata.research_source==='openrouter_web'`,
      `lastUpsertPayload.metadata.research_engine==='exa'`.
    - "enable anthropic_web + native → research_source='anthropic_web' & research_engine='native'".
    - "disable → research_source is null (dormant)": call `{ enabled:false, source:'openrouter_web', engine:'exa' }`;
      assert `lastUpsertPayload.metadata.research_source===null` (so getActiveResearchSource → null).
    - "invalid source → ok:false, no upsert": call `{ enabled:true, source:'brave' as any, engine:'exa' }`;
      assert `res.ok===false` and the upsert mock was NOT called.
    - "non-admin rejected": make requireAdmin mock reject (e.g. `requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))`);
      `await expect(setPriceResearchSource({enabled:true,source:'openrouter_web',engine:'exa'})).rejects.toThrow()`;
      assert the upsert mock was NOT called.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/admin/price-research-config.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function setPriceResearchSource" app/admin/integrations/actions.ts` → 1
    - `grep -c "provider: 'price_research'" app/admin/integrations/actions.ts` → 1
    - actions.ts contains `research_source: input.enabled ? input.source : null` (disable path writes null)
    - actions.ts validates source ∈ {openrouter_web, anthropic_web} and engine ∈ {exa, native} before upsert
    - tests/unit/admin/price-research-config.test.ts asserts metadata.research_source + metadata.research_engine on enable, null on disable, ok:false (no upsert) on invalid source, and rejects + no-upsert for non-admin
    - `npx vitest run tests/unit/admin/price-research-config.test.ts` passes (5 tests)
  </acceptance_criteria>
  <done>The action exports a requireAdmin-gated, service-role upsert that writes
  metadata.research_source (null when disabled) + metadata.research_engine, validates both
  enums, and the 5-test suite passes.</done>
</task>

<task type="auto">
  <name>Task 2: price-research category + config card in the integrations UI (EN/PT/ES)</name>
  <read_first>
    - lib/admin/integrations-providers.ts (add a CATEGORY with empty providers[] + a showPriceResearchConfig flag, mirroring the Twilio showFromPhone config-only pattern)
    - app/admin/integrations/integration-category-content.tsx (mirror the showFromPhone/showXphereConfig blocks: read the metadata row server-side, pass to a client form)
    - app/admin/integrations/xphere-config-form.tsx (mirror the client-form shell: 'use client', useState + useTransition, toast, rounded-lg border card)
    - app/admin/integrations/ai-provider-selector.tsx (mirror useTranslation t() for EN/PT/ES + the select/radio + Active badge UX)
  </read_first>
  <action>
    (a) lib/admin/integrations-providers.ts — add a new Category to the CATEGORIES array (place it
    after the 'crm' entry, before the closing `] as const`):
    ```typescript
    {
      slug: 'price-research',
      title: 'Price Research',
      navLabel: 'Price Research',
      description:
        'Researched regional pricing for estimate items with no price-book match. Reuses the configured OpenRouter / Anthropic key — no separate API key.',
      showPriceResearchConfig: true,
      providers: [],
    },
    ```
    Add `showPriceResearchConfig?: boolean` to the `Category` type (next to showXphereConfig).
    (Empty `providers: []` is already handled by loadCategoryInitials — `.in('provider', [])` returns no rows.)

    (b) app/admin/integrations/price-research-config-form.tsx — NEW 'use client' component mirroring
    ai-provider-selector.tsx (useTranslation for i18n) + xphere-config-form.tsx (card shell + useTransition + toast):
    ```typescript
    'use client'
    import { useState, useTransition } from 'react'
    import { toast } from 'sonner'
    import { useTranslation } from '@/lib/i18n/use-translation'
    import { setPriceResearchSource } from './actions'

    type Props = { current: { enabled: boolean; source: 'openrouter_web' | 'anthropic_web'; engine: 'exa' | 'native' } }
    ```
    Render inside a `<div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">`:
    - heading `{t('Price Research')}` + helper `{t('Enable researched regional pricing and choose the search source and engine. Takes effect within 60 seconds | no redeploy.')}`
    - an enable checkbox: `<input type="checkbox" checked={enabled} ... />` with label `{t('Enable price research')}`
    - a source `<select>` (`value={source}`) with options `openrouter_web` → `{t('OpenRouter web')}` and `anthropic_web` → `{t('Anthropic web')}`
    - an engine `<select>` (`value={engine}`) with options `exa` → `{t('Exa (default)')}` and `native` → `{t('Native')}`
    - a Save `<Button>` (import from `@/components/ui/button`) calling, inside `startTransition`:
      `const res = await setPriceResearchSource({ enabled, source, engine })` → `res.ok ? toast.success(res.message ?? t('Saved')) : toast.error(res.message)`.
    Keep all three controls disabled while `isPending`. Use local useState for enabled/source/engine seeded from `current`.
    (Note: `setActiveAIProvider`-style instant-on-change is also acceptable, but a single Save button matches xphere-config-form and avoids 3 separate writes.)

    (c) app/admin/integrations/integration-category-content.tsx — add a server-side read + render
    block mirroring the showXphereConfig block:
    - after the existing `if (category.showXphereConfig)` block, add:
      ```typescript
      let priceResearch = { enabled: false, source: 'openrouter_web' as 'openrouter_web' | 'anthropic_web', engine: 'exa' as 'exa' | 'native' }
      if (category.showPriceResearchConfig) {
        const svc = requireServiceClient()
        const { data } = await svc.from('platform_integrations').select('metadata').eq('provider', 'price_research').maybeSingle()
        const meta = (data?.metadata as { research_source?: string; research_engine?: string } | null) ?? {}
        const src = meta.research_source
        priceResearch = {
          enabled: src === 'openrouter_web' || src === 'anthropic_web',
          source: src === 'anthropic_web' ? 'anthropic_web' : 'openrouter_web',
          engine: meta.research_engine === 'native' ? 'native' : 'exa',
        }
      }
      ```
    - in the JSX (after the showWhatsAppConfig block), add:
      ```tsx
      {category.showPriceResearchConfig && (
        <PriceResearchConfigForm current={priceResearch} />
      )}
      ```
    - add the import `import { PriceResearchConfigForm } from './price-research-config-form'` at the top.
    `requireServiceClient` is already imported in this file.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "price-research-config-form|integration-category-content|integrations-providers" || echo "SCOPED-CLEAN"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "showPriceResearchConfig" lib/admin/integrations-providers.ts` → 2 (type field + category flag)
    - `grep -c "slug: 'price-research'" lib/admin/integrations-providers.ts` → 1
    - app/admin/integrations/price-research-config-form.tsx exists, is `'use client'`, imports `setPriceResearchSource` from `./actions`, and renders a source `<select>` + an engine `<select>` + an enable checkbox
    - price-research-config-form.tsx uses `useTranslation` / `t(` for EN/PT/ES labels
    - integration-category-content.tsx imports `PriceResearchConfigForm`, reads `provider', 'price_research'` metadata, and renders `<PriceResearchConfigForm` under `category.showPriceResearchConfig`
    - scoped tsc over the three files emits no errors (SCOPED-CLEAN or no matching error lines)
  </acceptance_criteria>
  <done>A 'Price Research' category appears in the integrations nav; its page reads the current
  research_source + research_engine and renders an enable toggle + source select + engine select
  (EN/PT/ES via t()) wired to setPriceResearchSource; the three changed/created files type-check clean.</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/unit/admin/price-research-config.test.ts` → 5 tests pass (upsert shape on enable, disable→null/dormant, invalid-source no-upsert, non-admin rejected).
- `npx vitest run` → full suite green (no regressions vs the STATE.md baseline 275 files / 1932 passed).
- Scoped `npx tsc --noEmit -p tsconfig.json` over the four changed/created code files → no new errors.
- Manual trace (no remote DB write): the persisted `metadata.research_source` is one of
  {openrouter_web, anthropic_web} on enable (→ getPriceResearchProvider() resolves) and null on
  disable (→ getPriceResearchProvider() returns null), matching getActiveResearchSource().
</verification>

<success_criteria>
- A requireAdmin-gated `setPriceResearchSource` server action upserts the
  `platform_integrations` row (provider='price_research') with
  `metadata = { research_source, research_engine }`, validating source ∈ {openrouter_web, anthropic_web}
  and engine ∈ {exa, native}; disable persists research_source=null so the readers go dormant.
- The admin integrations UI has a 'Price Research' card that reads the current value and renders an
  enable toggle + source select + engine select (EN/PT/ES) wired to the action, mirroring the
  existing config-only category pattern (no encrypted IntegrationCard, no new API key).
- A unit test covers the upsert metadata shape, the disable→dormant path, and the requireAdmin gate.
- No secrets touched (price_research reuses existing OpenRouter/Anthropic keys); nothing applied to the remote DB.
</success_criteria>

<output>
After completion, create `.planning/quick/260624-ajz-super-admin-control-to-configure-the-v4-/260624-ajz-SUMMARY.md`
</output>
