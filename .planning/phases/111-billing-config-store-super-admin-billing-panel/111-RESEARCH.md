# Phase 111: `billing_config` Store + Super-Admin Billing Panel - Research

**Researched:** 2026-06-24
**Domain:** Runtime-configurable platform config (extend `platform_integrations` metadata pattern) + super-admin panel UI + zod validation
**Confidence:** HIGH (this is a mirror-an-existing-pattern phase; every mechanism already exists in-repo and was read directly)

## Summary

Phase 111 is a **pattern-extension phase, not a green-field one**. The exact mechanism this phase needs — a metadata-only row in `public.platform_integrations` read by a typed server-only reader and written by a `requireAdmin`-gated server action — already exists and ships in production for `ai_config` (`selected_ai_provider` + `openrouter_default_model`) and `price_research` (`research_source` + `research_engine`). The job is to add one more such "provider" row, `billing_config`, whose `metadata` JSON holds the full billing parameter set, plus a typed `getBillingConfig()` reader with a documented `DEFAULT_BILLING_CONFIG`, a zod-validated writer, and a super-admin Billing surface to edit it.

The `platform_integrations` table already supports metadata-only rows (the `20260517000002` migration dropped NOT NULL on the crypto columns and added a CHECK that permits `ciphertext/iv/auth_tag` all-null when `metadata` is set). **No migration is required** — `billing_config` is just a new value of the `provider` text PK. Billing parameters are NOT secrets (they are prices, multipliers, and thresholds the owner will eventually see the *effect* of), so they live in plaintext `metadata`, exactly like `ai_config` — no encryption, no `getIntegrationKey` crypto path.

The cleanest UI placement is a **new `billing` category in the existing `CATEGORIES` catalog** (`lib/admin/integrations-providers.ts`) rendered as an inline config form under `/admin/integrations/billing`, mirroring how the AI provider selector and price-research config render via `show*Config` flags. This is preferred over extending the existing `/admin/billing` route (Phase 60 — MRR + force-tier + bonus-credits operational tooling), which is a *company operations* surface, not a *platform parameters* surface; mixing them invites the collision the additional context warns about. (A secondary acceptable option — a dedicated `/admin/billing/config` sub-route — is documented below.)

**Primary recommendation:** Add `billing_config` as a metadata-only `platform_integrations` provider row. Ship `lib/billing/billing-config.ts` exporting `DEFAULT_BILLING_CONFIG`, a `billingConfigSchema` (zod), `getBillingConfig()` (null-safe reader, defaults-merged, server-only, 30s TTL cache mirroring `getSelectedAIProvider`/branding), and `saveBillingConfig()` (a `requireAdmin` server action). Surface it as a new `billing` category card form in `/admin/integrations`. Do **not** wire any consumer — `whisper-cost.ts`, the ledger, and the fee read from `getBillingConfig()` in later phases; this phase only makes the reader importable and correct.

## Project Constraints (from CLAUDE.md)

- **Tech stack is fixed:** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui, **react-hook-form + zod** (forms), Zustand/React Context. The Billing form should follow the existing admin form convention (`useState` + `useTransition` + server action — see `price-research-config-form.tsx`), which is what the rest of `/admin/integrations` uses, rather than introducing react-hook-form just for this panel.
- **Database:** Supabase Postgres, **RLS on all tables.** `platform_integrations` is already RLS-enabled with **zero policies** (deny-all to authenticated/anon; service role bypasses). The billing_config row inherits this — the tenant has structurally no read/write path. ✔ satisfies BILLCFG-03 "tenant has no access" by construction.
- **Security:** service-role key never in the browser; reads/writes go through `requireServiceClient()` in `server-only` modules and server actions only.
- **Secret handling (CRITICAL):** never commit secrets to git, including in `.planning/` docs and seeds. Billing parameters (prices/markups/thresholds) are **not secrets** and may appear in code/docs as literal defaults. No API keys are involved in this phase.
- **Migrations idempotent + deploy CI→GHCR→Coolify** (never build on the VPS). **This phase likely needs NO migration** (platform_integrations already exists and already supports metadata-only rows). If the plan adds any optional seed/migration, it must be idempotent (`ON CONFLICT DO NOTHING`) and NOT applied to remote by the executor — the deploy pipeline owns that.
- **GSD workflow enforcement:** all edits go through a GSD command (this is a planned phase via `/gsd:execute-phase`).

## User Constraints (from REQUIREMENTS.md locked decisions — no CONTEXT.md present)

> No `CONTEXT.md` exists for this phase. The binding constraints are the milestone-level **locked decisions** in `.planning/REQUIREMENTS.md` and SEED-035 Principle 6 (non-negotiable). Treat these with the authority of locked decisions.

### Locked Decisions (verbatim intent from REQUIREMENTS.md + SEED-035/036)
- **Everything super-admin-configurable** via a new `billing_config` (the `ai_config`/`platform_integrations` pattern) — **no hard-coded billing numbers, no env vars.** The tenant only experiences the result.
- **1 credit = $0.01** of charged AI value (credit denomination default).
- **Markup target 4.5x** (initial value; the *number* is editable in the panel, never a constant).
- **1% estimate application fee** default (SEED-036) — read from `billing_config.estimate_fee_pct`, never hard-coded.
- **Calibrate before charging** — Phase 111 ships the config STORE only; real numbers are derived later (Phase 116). Defaults are placeholders, explicitly flagged "calibrate before charging."
- **Tenant has NO access** to these controls (BILLCFG-03) — super-admin only, gated identically to the existing admin integrations pages.

### Claude's Discretion
- Exact zod schema shape and field names (recommendation below).
- TTL cache vs read-fresh for `getBillingConfig()` (recommendation: 30s TTL mirroring `getSelectedAIProvider`/branding, plus `invalidatePlatformConfig()` on write).
- New `billing` category vs `/admin/billing/config` sub-route (recommendation: new category — see Pattern 2).
- Form layout/sections (one card with grouped fieldsets vs multiple cards). Recommendation: one inline config form component grouped by concern (Markup & Credits / Per-tier grants & prices / Top-up packs / Cost rates / Fee / Thresholds).
- Whether to include the lower-priority `metered_operations` toggle + `chat_rate_limit` now (recommendation: include them in the SCHEMA with sane defaults so consumers fit later, minimal/no UI — see "design note" fields below).

### Deferred Ideas (OUT OF SCOPE for Phase 111)
- Wiring any consumer to read `billing_config` (ledger/debit = Phase 112; Stripe grants/top-ups = Phase 113; fee = Phase 114; balance UX = Phase 115; calibration = Phase 116). **Phase 111 makes the reader importable; it does NOT change `whisper-cost.ts`, `record-ai-cost.ts`, `entitlements.ts`, or any Stripe path.**
- Per-operation-type markup granularity (v2 GRAN-01) — but design the markup field so a future per-op map fits (recommendation: `markup` is a single global number now; document the extension point).
- Per-tier fee differentiation (v2 GRAN-02), credit rollover (v2 GRAN-03), revenue dashboards (v2 GRAN-04).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **BILLCFG-01** | A `billing_config` section in the encrypted runtime-config store (`platform_integrations`/`ai_config` pattern) holds all billing parameters — no hard-coded values, no env vars. | Mirror `ai_config` metadata-only row (`lib/platform-config.ts:350-380`). New `provider='billing_config'` row, plaintext `metadata` JSON. No migration needed — `20260517000002` already permits metadata-only rows. See Pattern 1. |
| **BILLCFG-02** | A super-admin "Billing" panel edits markup, credit denomination, per-tier grant, subscription prices, top-up packs, Whisper rate, fee %, low-balance thresholds — applied at runtime without deploy. | New `billing` category in `CATEGORIES` + inline `BillingConfigForm` rendered via a `showBillingConfig` flag in `integration-category-content.tsx`. Save action calls `invalidatePlatformConfig()` so the 30s TTL flushes immediately (runtime, no deploy). See Pattern 2 + Code Examples. |
| **BILLCFG-03** | All billing logic reads parameters from `billing_config` at runtime; the business owner (tenant) has no access. | `getBillingConfig()` server-only reader is the single import surface for downstream phases. Tenant has no route (admin layout `redirect('/api/logout')` for non-admins) and no DB read path (deny-all RLS on `platform_integrations`). **Phase 111 ships the reader; downstream phases do the reading.** See Pattern 3. |

## Standard Stack

This phase introduces **no new dependencies.** Everything is already in the repo.

### Core (already present — use these)
| Module | Path | Purpose | Why Standard |
|--------|------|---------|--------------|
| `requireServiceClient` | `lib/supabase/service` | RLS-bypassing service-role client for reading/writing `platform_integrations` | Every existing platform-config reader/writer uses it; never the browser client |
| `requireAdmin` / `getAdminContext` | `lib/auth/admin-context.ts` | Super-admin gate (`platform_admins` lookup; `notFound()` on miss) | THE guard used by every `/admin` action and page — identical gating gives BILLCFG-03 for free |
| `invalidatePlatformConfig` | `lib/platform-config.ts:283` | Clears the in-memory TTL caches after a write so changes apply within one request, no deploy | Already called by `saveIntegrationKey`/`setActiveAIProvider`/`setPriceResearchSource` |
| `logAdminAction` | `lib/admin/audit-log.ts` | Audit trail for every admin mutation | Every admin action logs; the Billing save must too |
| `zod` | dep | Validate-before-trust on write | `lib/schemas/admin.ts` is the established home for admin zod schemas |
| `react` `cache()` / TTL const | `lib/platform-config.ts` | Per-request memo + 30s TTL pattern for config reads | `getBranding`/`getSelectedAIProvider` precedent |

### Supporting (UI — already present)
| Module | Path | Purpose |
|--------|------|---------|
| `CATEGORIES` catalog | `lib/admin/integrations-providers.ts` | Add a `billing` category here |
| `IntegrationCategoryContent` | `app/admin/integrations/integration-category-content.tsx` | Renders category cards + `show*Config` inline forms; add a `showBillingConfig` branch |
| `useTranslation` / `T` | `lib/i18n/use-translation.ts`, `components/i18n/t` | i18n for all user-facing strings (admin UI is translated) |
| `Button`, `Card`, `toast` (sonner) | `components/ui/*`, `sonner` | Form chrome — see `price-research-config-form.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Metadata-only `platform_integrations` row | A NEW dedicated `billing_config` table (singleton like `platform_branding`) | A new table is heavier (migration, RLS policies, loader) and breaks the "one mechanism" principle SEED-035 explicitly calls for ("extend `ai_config`/`platform_integrations`"). The metadata row needs ZERO migration. **Reject.** |
| New `billing` integrations category | Extend existing `/admin/billing` route (Phase 60) | `/admin/billing` is company-ops (MRR, force-tier, bonus credits per-company). Platform *parameters* belong with the other platform config (`/admin/integrations`). Mixing risks the documented collision + dilutes both surfaces. **Reject as primary; keep `/admin/billing/config` as fallback.** |
| react-hook-form | `useState` + `useTransition` + server action | The whole `/admin/integrations` suite uses the latter; introducing RHF only here adds inconsistency. CLAUDE.md lists RHF as *available*, not *mandatory everywhere*. **Use the existing convention.** |

**Installation:** none — no `npm install`.

## Architecture Patterns

### Recommended File Structure
```
lib/billing/
├── billing-config.ts          # NEW — DEFAULT_BILLING_CONFIG, BillingConfig type, getBillingConfig() reader
├── whisper-cost.ts            # UNTOUCHED this phase (Phase 110 const stays as fallback; Phase 116 sources from config)
└── record-ai-cost.ts          # UNTOUCHED this phase

lib/schemas/
└── admin.ts                   # EXTEND — add billingConfigSchema (zod) + inferred type

lib/admin/
└── integrations-providers.ts  # EXTEND — add { slug: 'billing', showBillingConfig: true, providers: [] } category

app/admin/integrations/
├── integration-category-content.tsx  # EXTEND — load billing_config metadata + render <BillingConfigForm>
├── billing-config-form.tsx           # NEW — client form (mirror price-research-config-form.tsx)
└── actions.ts                        # EXTEND — saveBillingConfig() server action (requireAdmin + zod + upsert + invalidate + audit)

tests/unit/billing/
└── billing-config.test.ts            # NEW — defaults, schema validation, reader merge/null-safety
```

> **Where defaults live (recommendation):** put `DEFAULT_BILLING_CONFIG`, the `BillingConfig` type, and `getBillingConfig()` in `lib/billing/billing-config.ts` (server-only reader). Put `billingConfigSchema` (zod) in `lib/schemas/admin.ts` (the established admin-schema home) so the client form and the server action share one shape, OR co-locate it in `billing-config.ts` and re-export — either is fine; the key is ONE source of truth. The `whisper-cost.ts` Phase-110 doc comment already anticipates: *"Phase 111 (BILLCFG) moves it into the runtime billing_config; this const becomes the fallback."*

### Pattern 1: Metadata-only `platform_integrations` row (the read mechanism)
**What:** Store `billing_config` as a single row `provider='billing_config'` with `ciphertext/iv/auth_tag = NULL` and the full param set in `metadata` (jsonb). Read with a typed, defaults-merged accessor.
**When to use:** This is THE pattern for BILLCFG-01. Mirrors `getSelectedAIProvider()` exactly (read `metadata` off the provider row, fall back to a default when absent/null).
**Example:**
```typescript
// Source: mirrors lib/platform-config.ts:350-380 (getSelectedAIProvider / getOpenRouterDefaultModel)
// lib/billing/billing-config.ts
import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

export type TopUpPack = { credits: number; priceCents: number }
export type TierBilling = { monthlyCreditGrant: number; subscriptionPriceCents: number }

export type BillingConfig = {
  markup: number                 // global multiplier; default 4.5 (design note: per-op map = v2)
  creditUnitUsd: number          // 1 credit = $X charged value; default 0.01
  whisperUsdPerMinute: number    // sources Phase-110's module const; default 0.006
  estimateFeePct: number         // 0.01 = 1% (SEED-036); default 0.01
  estimateFeeMinCents: number    // Stripe rejects $0 fee; sane floor; default 1
  tiers: Record<'free'|'trial'|'pro'|'business', TierBilling>
  topUpPacks: TopUpPack[]
  lowBalanceThresholds: number[] // credit balances at which to warn; default [200, 50]
  // ── design-note fields (schema-present, minimal/deferred UI; consumers later) ──
  meteredOperations: Record<string, boolean> // which ops debit vs absorbed; default all heavy = true
  absorbedChatRateLimitPerMin: number        // anti-abuse for absorbed chat; default 20
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  markup: 4.5,
  creditUnitUsd: 0.01,
  whisperUsdPerMinute: 0.006, // ≈ OpenAI whisper-1 list — CALIBRATE before charging (CALIB-02)
  estimateFeePct: 0.01,
  estimateFeeMinCents: 1,
  tiers: {
    free:     { monthlyCreditGrant: 0,    subscriptionPriceCents: 0 },
    trial:    { monthlyCreditGrant: 2000, subscriptionPriceCents: 0 },
    pro:      { monthlyCreditGrant: 9000, subscriptionPriceCents: 2900 }, // illustrative — calibrate (Phase 116)
    business: { monthlyCreditGrant: 30000, subscriptionPriceCents: 9900 },
  },
  topUpPacks: [
    { credits: 1000, priceCents: 1500 },
    { credits: 5000, priceCents: 6000 },
  ],
  lowBalanceThresholds: [200, 50],
  meteredOperations: { estimate: true, photo_batch: true, audio_minutes: true, price_research: true },
  absorbedChatRateLimitPerMin: 20,
}

export async function getBillingConfig(): Promise<BillingConfig> {
  const svc = createServiceClient()
  if (!svc) return DEFAULT_BILLING_CONFIG // null-safe: static build / no env (mirror getSelectedAIProvider)
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'billing_config')
    .maybeSingle()
  const stored = (data?.metadata ?? null) as Partial<BillingConfig> | null
  if (!stored) return DEFAULT_BILLING_CONFIG
  // Shallow-merge so a row written before a field existed still resolves (backfill discipline,
  // mirrors getBranding's heroImageUrl backfill). Deep-merge tiers/packs explicitly.
  return {
    ...DEFAULT_BILLING_CONFIG,
    ...stored,
    tiers: { ...DEFAULT_BILLING_CONFIG.tiers, ...(stored.tiers ?? {}) },
  }
}
```
> Add a 30s TTL cache + cache key to `getBillingConfig()` mirroring `getSelectedAIProvider` is optional but recommended for the hot path (the ledger/fee will call it per-operation in later phases). Wire its invalidation into the existing `invalidatePlatformConfig()`.

### Pattern 2: New `billing` category + inline config form (the write/UI mechanism)
**What:** Register a `billing` category (no encrypted `providers`, like `price-research`) with a `showBillingConfig: true` flag; render an inline `BillingConfigForm` from `integration-category-content.tsx`.
**When to use:** BILLCFG-02. The category auto-appears in the integrations nav (`IntegrationsNav` maps `CATEGORIES`) and gets a real URL `/admin/integrations/billing`.
**Example:**
```typescript
// Source: lib/admin/integrations-providers.ts CATEGORIES (mirror the 'price-research' entry)
{
  slug: 'billing',
  title: 'Billing',
  navLabel: 'Billing',
  description:
    'Platform billing parameters — markup, credit denomination, per-tier grants and prices, top-up packs, Whisper rate, estimate fee %, low-balance thresholds. Applied at runtime, no redeploy. Tenants never see these controls.',
  showBillingConfig: true,
  providers: [], // metadata-only — no encrypted API key, exactly like price-research
}
```
Then in `integration-category-content.tsx`, add (mirroring the `showPriceResearchConfig` block):
```typescript
let billingConfig = DEFAULT_BILLING_CONFIG
if (category.showBillingConfig) {
  const svc = requireServiceClient()
  const { data } = await svc.from('platform_integrations')
    .select('metadata').eq('provider', 'billing_config').maybeSingle()
  billingConfig = { ...DEFAULT_BILLING_CONFIG, ...((data?.metadata as Partial<BillingConfig>) ?? {}) }
}
// …and in JSX:
{category.showBillingConfig && <BillingConfigForm current={billingConfig} />}
```
**Anti-pattern to avoid:** Do NOT extend `/admin/billing/actions.ts` (force-tier / bonus-credits) for this. That route is per-company operational tooling reading `companies`; the platform-parameter store is a different concern. Keep them separate to avoid the collision called out in the additional context.

### Pattern 3: `requireAdmin`-gated writer with zod (the validation mechanism)
**What:** A `saveBillingConfig()` server action: `requireAdmin()` FIRST → zod `safeParse` → upsert metadata-only row → `invalidatePlatformConfig()` → `revalidatePath('/admin/integrations')` → `logAdminAction`.
**Example:**
```typescript
// Source: mirrors setPriceResearchSource / setActiveAIProvider in app/admin/integrations/actions.ts
'use server'
export async function saveBillingConfig(input: unknown): Promise<ActionResult> {
  const ctx = await requireAdmin()                     // BILLCFG-03 gate — notFound() for non-admins
  const parsed = billingConfigSchema.safeParse(input)  // validate-before-trust
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const svc = requireServiceClient()
  const { error } = await svc.from('platform_integrations').upsert(
    {
      provider: 'billing_config',
      ciphertext: null, iv: null, auth_tag: null,        // metadata-only row (CHECK permits this)
      metadata: parsed.data,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    },
    { onConflict: 'provider' },
  )
  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()                              // runtime apply, no deploy
  revalidatePath('/admin/integrations')
  void logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: 'billing_config.save',
    targetType: 'billing_config', targetId: 'billing_config' })
  return { ok: true, message: 'Billing config saved.' }
}
```
> **Audit action type:** `logAdminAction`'s `action`/`targetType` are typed (the STATE log notes a prior `price_research.set` `AuditAction` mismatch caused tsc noise). Check `lib/admin/audit-log.ts`'s `AuditAction` union and **add `'billing_config.save'`** (and any `targetType`) there so tsc stays clean.

### Zod schema shape (recommendation)
```typescript
// lib/schemas/admin.ts — positive, bounded numbers; arrays validated element-wise
const tierBillingSchema = z.object({
  monthlyCreditGrant: z.number().int().min(0),
  subscriptionPriceCents: z.number().int().min(0),
})
export const billingConfigSchema = z.object({
  markup: z.number().positive().max(100),
  creditUnitUsd: z.number().positive().max(1),
  whisperUsdPerMinute: z.number().min(0).max(10),
  estimateFeePct: z.number().min(0).max(1),         // 0..1 (1 = 100%)
  estimateFeeMinCents: z.number().int().min(0),
  tiers: z.object({
    free: tierBillingSchema, trial: tierBillingSchema, pro: tierBillingSchema, business: tierBillingSchema,
  }),
  topUpPacks: z.array(z.object({ credits: z.number().int().positive(), priceCents: z.number().int().positive() })).max(10),
  lowBalanceThresholds: z.array(z.number().int().min(0)).max(5),
  meteredOperations: z.record(z.string(), z.boolean()),
  absorbedChatRateLimitPerMin: z.number().int().min(0).max(1000),
})
export type BillingConfigInput = z.infer<typeof billingConfigSchema>
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storing runtime config | A new table + RLS policies + loader | Metadata-only `platform_integrations` row | Table already exists, already RLS-deny-all, already supports metadata-only rows (`20260517000002`). Zero migration. |
| Super-admin gate | A custom auth check | `requireAdmin()` | Identical gating to all admin pages → BILLCFG-03 satisfied by reuse, not reinvention. |
| Cache invalidation after write | A custom revalidate scheme | `invalidatePlatformConfig()` + `revalidatePath` | Already the established post-write step; wire billing cache into it. |
| Form plumbing | react-hook-form for one panel | `useState` + `useTransition` + server action | Matches every other `/admin/integrations` form; less surface, consistent UX. |
| Defaults when DB empty | Throwing / 503 before admin seeds | `DEFAULT_BILLING_CONFIG` merge (null-safe reader) | Mirrors `getBranding`/`getSelectedAIProvider` null-safety so the system works pre-seed (the consumers in 112-116 never crash on an unconfigured store). |

**Key insight:** Every primitive this phase needs is a copy-paste-and-rename of an in-repo precedent (`ai_config`, `price_research`). The risk is NOT technical novelty; it's (a) accidentally wiring a consumer (out of scope), (b) putting the panel on the wrong route, or (c) an `AuditAction` type drift. All three are avoidable with the patterns above.

## Common Pitfalls

### Pitfall 1: Wiring a consumer this phase
**What goes wrong:** Tempting to "finish the job" by making `whisper-cost.ts` or `record-ai-cost.ts` read `getBillingConfig()`. That belongs to Phases 112/114/116 and would start charging logic before calibration (violates the locked "calibrate before charging").
**How to avoid:** Phase 111 ships `getBillingConfig()` as an **importable, tested reader only.** Acceptance: `grep -rl "getBillingConfig" lib/ app/ components/` returns ONLY the reader's own module + its test (no production importer) — mirroring how Phase 106's cache shipped dormant.
**Warning signs:** A diff touching `whisper-cost.ts`, `record-ai-cost.ts`, `entitlements.ts`, `invoice-service.ts`, or any Stripe path.

### Pitfall 2: `platform_integrations` CHECK constraint on half-set rows
**What goes wrong:** Upserting with some-but-not-all crypto columns set fails the `platform_integrations_data_shape_check`.
**How to avoid:** For the metadata-only billing row, set `ciphertext: null, iv: null, auth_tag: null` explicitly and `metadata: <config>`. The CHECK permits exactly this shape (all-null crypto + metadata set). Do NOT send `metadata: null`.

### Pitfall 3: `AuditAction` / `targetType` type drift (tsc noise)
**What goes wrong:** `logAdminAction({ action: 'billing_config.save' })` fails tsc because the literal isn't in the `AuditAction` union (the STATE log records this exact class of error for `price_research.set`).
**How to avoid:** Add `'billing_config.save'` to the `AuditAction` union (and the `targetType` enum if one exists) in `lib/admin/audit-log.ts` as part of the plan. Run `tsc --noEmit` on the touched files.

### Pitfall 4: Money as floats
**What goes wrong:** Storing prices as dollars (`29.0`) invites float rounding when Stripe amounts (integer cents) are computed later, and `estimateFeePct × amount` with a $0 result is rejected by Stripe.
**How to avoid:** Store **prices in integer cents** (`subscriptionPriceCents`, `priceCents`, `estimateFeeMinCents`) and **percentages as 0..1 decimals** (`estimateFeePct: 0.01`). The `estimateFeeMinCents` floor is in the schema now so Phase 114 has it (FEE-04). Credits are integers. Only `markup`, `creditUnitUsd`, `whisperUsdPerMinute` are non-integer (multiplier / unit-cost) — bound them in zod.

### Pitfall 5: Stale read after save (no runtime apply)
**What goes wrong:** A TTL cache (or React `cache`) serves the old config after an admin saves, looking like "the change didn't take" — the BILLCFG-02 "applied at runtime without deploy" requirement fails perceptually.
**How to avoid:** Call `invalidatePlatformConfig()` in the save action (and extend that function to clear the billing cache if you add a TTL cache). `revalidatePath('/admin/integrations')` re-renders the form with fresh values.

### Pitfall 6: Deep vs shallow merge dropping nested defaults
**What goes wrong:** A spread merge `{ ...DEFAULT, ...stored }` replaces the whole `tiers`/`topUpPacks`, so a stored row missing one tier loses that tier's defaults.
**How to avoid:** Deep-merge the nested objects explicitly (`tiers: { ...DEFAULT.tiers, ...stored.tiers }`). Arrays (`topUpPacks`, `lowBalanceThresholds`) are replace-whole by design (the admin edits the full list), which is correct — just don't let `undefined` slip through (the schema requires them, and the reader falls back to default when `stored` is null).

## Code Examples

### Reading the config in a future consumer (Phase 112+ — illustrative, NOT this phase)
```typescript
// Source: the reader this phase ships; shown to confirm the import surface is ready
import { getBillingConfig } from '@/lib/billing/billing-config'
const cfg = await getBillingConfig()
const debitCredits = Math.ceil((realCostUsd * cfg.markup) / cfg.creditUnitUsd) // Phase 112 owns this
```

### Client form skeleton (mirror `price-research-config-form.tsx`)
```typescript
// app/admin/integrations/billing-config-form.tsx — 'use client'
// useState per field group + useTransition + saveBillingConfig() + toast; grouped fieldsets:
//   Markup & Credits | Per-tier grants & prices | Top-up packs (add/remove rows) | Cost rates | Fee | Thresholds
// Save button calls: startTransition(async () => { const r = await saveBillingConfig(payload); r.ok ? toast.success(...) : toast.error(r.message) })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whisper rate as env-overridable module const (`WHISPER_USD_PER_MINUTE`) | Sourced from `billing_config.whisperUsdPerMinute` | Reader ships in 111; consumer switches in 116 | Phase 110 const becomes the FALLBACK; no behavior change in 111 |
| Count-based tier limits (`maxEstimatesPerMonth`) as the only billing lever | Credit grants + prices in `billing_config.tiers` (parallel-run) | Store in 111; consumed 112-116 | Counts stay as secondary guard-rails (MIG-01) |
| Billing numbers implied/hard-coded | Single `billing_config` store, super-admin editable, no env vars | This phase | Non-negotiable per SEED-035 Principle 6 |

**Deprecated/outdated:** nothing removed this phase. The `WHISPER_USD_PER_MINUTE` env var stays as a documented fallback until a later phase wires the config read.

## Open Questions

1. **Should `getBillingConfig()` use a 30s TTL cache?**
   - What we know: `getSelectedAIProvider`/`getOpenRouterDefaultModel` read fresh (no TTL); `getBranding`/`getIntegrationKey` use a 30s TTL. The ledger/fee will call `getBillingConfig()` on a hot path in later phases.
   - Recommendation: Add a 30s TTL cache now (cheap, and future-proofs the hot path) and wire its clear into `invalidatePlatformConfig()`. Low risk either way; read-fresh is acceptable for v1 since no consumer exists yet.

2. **Include `meteredOperations` toggle + `absorbedChatRateLimitPerMin` UI now, or schema-only?**
   - What we know: SEED-035 lists them as lower-priority; the additional context says "capture the schema shape so they fit, implementation can be minimal/deferred."
   - Recommendation: Include in the **schema with defaults** (so the row shape is final and consumers in 112 fit), but ship **minimal or no UI** for them this phase (a single read-only note is enough). Avoids a schema migration later.

3. **Exact default tier grants/prices.**
   - What we know: SEED-035 explicitly says the example numbers are illustrative; real numbers come from calibration (Phase 116).
   - Recommendation: Seed *plausible placeholders* clearly commented "illustrative — calibrate before charging (CALIB-02)." They must be present (null-safe reader) but are NOT the final numbers.

## Environment Availability

Step 2.6: SKIPPED — Phase 111 is a code/config-only change. It introduces no new external tool, service, runtime, or CLI dependency. It reuses the already-provisioned Supabase `platform_integrations` table and the existing service-role client. No probe needed.

## Runtime State Inventory

Not applicable — Phase 111 is additive (a new config store + panel), not a rename/refactor/migration of existing state. No stored data, live-service config, OS-registered state, secrets, or build artifacts carry a string being changed. **Nothing to inventory — verified: no rename/replace/migration in scope.**

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Vitest** (281 test files / 1967 tests green at the Phase-110 baseline) |
| Config file | `vitest.config.*` at repo root (existing — tests run via `npx vitest run`) |
| Quick run command | `npx vitest run tests/unit/billing/billing-config.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILLCFG-01 | `getBillingConfig()` returns `DEFAULT_BILLING_CONFIG` when the row is absent (null-safe) | unit | `npx vitest run tests/unit/billing/billing-config.test.ts` | ❌ Wave 0 |
| BILLCFG-01 | `getBillingConfig()` merges stored metadata over defaults (deep-merge `tiers`; missing field backfilled) | unit | (same) | ❌ Wave 0 |
| BILLCFG-02 | `billingConfigSchema` rejects invalid input (negative markup, fee > 1, non-int cents, empty tiers) | unit | (same) | ❌ Wave 0 |
| BILLCFG-02 | `billingConfigSchema` accepts a valid full config; round-trips `DEFAULT_BILLING_CONFIG` | unit | (same) | ❌ Wave 0 |
| BILLCFG-03 | Reader is `server-only` and uses `requireServiceClient`/`createServiceClient` (no browser path); save action calls `requireAdmin` first | unit (static/structural — mirror `measure-only-invariant` style assertion) | `npx vitest run tests/unit/billing/billing-config.test.ts` | ❌ Wave 0 |
| BILLCFG-03 (dormancy) | No production module imports `getBillingConfig` yet (reader ships dormant) | static grep assertion | `grep -rl "getBillingConfig" lib app components` → reader + test only | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/billing-config.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/billing` (the existing billing suite — ensure no regression to the 13 existing files)
- **Phase gate:** `npx vitest run` full suite green + `npx tsc --noEmit -p tsconfig.json` clean on touched files before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/billing/billing-config.test.ts` — covers BILLCFG-01/02/03 (defaults, merge, schema, server-only/admin-gate structure, dormancy grep). The `tests/unit/billing/` directory and Vitest infra already exist; only this file is new.
- [ ] Confirm `lib/admin/audit-log.ts` `AuditAction` union includes `'billing_config.save'` before writing the save action (prevents the known tsc-drift pitfall — verify during planning).

*(No framework install needed — Vitest is configured and 281 files run today.)*

## Sources

### Primary (HIGH confidence — read directly in-repo)
- `lib/platform-config.ts` (`getSelectedAIProvider`/`getOpenRouterDefaultModel` metadata read at L350-380; `getIntegrationKey` crypto path; `invalidatePlatformConfig` L283; TTL/cache pattern) — THE pattern to mirror.
- `app/admin/integrations/actions.ts` (`setActiveAIProvider`, `setPriceResearchSource`, `saveTwilioFromPhone` — the metadata-only upsert + requireAdmin + invalidate + revalidate + audit recipe).
- `app/admin/integrations/integration-category-content.tsx` (how `show*Config` flags load metadata + render inline forms).
- `app/admin/integrations/price-research-config-form.tsx` (the client-form convention to copy).
- `lib/admin/integrations-providers.ts` (`CATEGORIES` shape; `price-research` metadata-only category; `loadCategoryInitials`).
- `lib/auth/admin-context.ts` (`requireAdmin`/`getAdminContext` — the BILLCFG-03 gate) + `app/admin/layout.tsx` (non-admin `redirect('/api/logout')`).
- `supabase/migrations/20260419000001_platform_admin.sql` (table def, RLS deny-all, metadata jsonb) + `20260517000002_platform_integrations_nullable_ciphertext.sql` (metadata-only row CHECK — confirms no migration needed).
- `lib/billing/whisper-cost.ts` (the Phase-110 const + its own doc comment pointing at Phase 111) + `lib/billing/record-ai-cost.ts` (measure-only invariant — confirms consumers stay untouched).
- `lib/entitlements.ts` (`TierName` union free/trial/pro/business — the tier keys for `billing_config.tiers`).
- `.planning/REQUIREMENTS.md` (BILLCFG-01/02/03 + locked decisions) + `.planning/seeds/SEED-035` (Principle 6 param list) + `SEED-036` (fee param) + `.planning/STATE.md` (current status, Phase 110 complete, 111 next).
- `.planning/config.json` (`nyquist_validation: true`, `commit_docs: true`).

### Secondary (MEDIUM)
- Existing `tests/unit/billing/*` file inventory (Vitest framework + `measure-only-invariant.test.ts` style for the structural assertion).

### Tertiary (LOW)
- None. This phase required no external/web sources — every mechanism is an in-repo precedent verified by direct read.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero new deps; all modules read directly in-repo.
- Architecture: **HIGH** — exact precedent (`ai_config`, `price_research`) read and mirrored; no migration confirmed by reading the CHECK constraint.
- Pitfalls: **HIGH** — drawn from in-repo precedent and the STATE log's own recorded `AuditAction` drift + null-vs-0/money discipline already established in Phase 110.
- Validation: **HIGH** — Vitest infra + billing test dir confirmed present.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable — internal patterns, no fast-moving external dependency). Re-verify only if `platform_integrations` schema or the admin-integrations UI structure changes.
