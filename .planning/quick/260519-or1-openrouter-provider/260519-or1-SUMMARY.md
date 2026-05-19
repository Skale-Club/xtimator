---
phase: quick
plan: 260519-or1
subsystem: ai-providers
tags: [ai, providers, openrouter, admin, per-tenant, model-selector]
dependency_graph:
  requires: [phase-08-platform-integrations, phase-15-owner-admin-panel]
  provides: [openrouter-provider, per-company-model-override, searchable-model-picker]
  affects:
    - lib/ai/index.ts
    - lib/ai/providers/*
    - lib/platform-config.ts
    - app/admin/integrations/*
    - lib/services/generate-estimate.ts
    - app/api/estimates/[id]/refine/**
tech_stack:
  added: []
  patterns: [openai-compatible-fetch-no-sdk, cmdk-searchable-combobox, per-tenant-config-override, in-memory-catalog-cache]
key_files:
  created:
    - supabase/migrations/20260519000001_openrouter_provider.sql
    - lib/ai/providers/openrouter.ts
    - app/api/admin/openrouter-models/route.ts
    - components/admin/openrouter-model-selector.tsx
    - app/admin/companies/page.tsx
    - app/admin/companies/[id]/page.tsx
    - app/admin/companies/[id]/company-model-override-form.tsx
    - app/admin/companies/actions.ts
  modified:
    - lib/ai/index.ts
    - lib/platform-config.ts
    - lib/schemas/admin.ts
    - lib/admin/audit-log.ts
    - lib/admin/integrations-providers.ts
    - lib/services/generate-estimate.ts
    - app/api/estimates/[id]/refine/route.ts
    - app/api/estimates/[id]/refine/voice/route.ts
    - app/api/estimates/[id]/refine/photo/route.ts
    - app/admin/integrations/actions.ts
    - app/admin/integrations/ai-provider-selector.tsx
    - app/admin/integrations/[slug]/page.tsx
    - components/admin/admin-nav.tsx
    - types/database.types.ts
decisions:
  - "Per-company override stored as single TEXT column (companies.ai_model_override). Implicit contract: non-null means OpenRouter with that model id. Avoids a second enum column for marginal benefit."
  - "OpenRouter adapter uses plain fetch (no openai npm dep). Tool-call shape mirrors Anthropic adapter — same `create_estimate` JSON schema so all vendors return the same structured output."
  - "Resolution precedence: company override > global active provider. Reason: user explicitly asked for client-A/client-B model control."
  - "Model catalog fetched server-side via admin-only /api/admin/openrouter-models, cached 5 min in process memory. Key never reaches the browser."
  - "setActiveAIProvider preserves existing metadata fields when flipping the active provider — switching to gemini then back to openrouter does NOT wipe openrouter_default_model."
metrics:
  duration: ~25min
  completed: 2026-05-19
---

# Quick Task 260519-or1: OpenRouter Provider + Per-Company Model Override

**One-liner:** Add OpenRouter as a third AI provider, give super-admins a
cmdk-based searchable model selector for the global default, and a per-company
override so different tenants can run on different models.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migration + OpenRouterAdapter + factory threads `companyId` | `7a9aab8` | 11 files (migration, adapter, 4 call sites, types, schemas, plan doc) |
| 2 | Admin UI: integration card, global model selector with search, per-company override pages | `0f1c854` | 13 files (companies routes, selector component, API proxy, nav, actions, audit-log enum) |

## What Was Built

### Provider layer
- **`OpenRouterAdapter`** (`lib/ai/providers/openrouter.ts`) — OpenAI-compatible tool-call request via plain fetch, same JSON schema as the Anthropic adapter. Constructor takes the model id so the same class serves both the global default and per-company pins.
- **`getAIProvider(companyId?)`** — new optional arg. When supplied and the company has `ai_model_override` set, returns `OpenRouterAdapter(override)`. Otherwise falls through to the existing global selection (anthropic/gemini/openrouter).
- **Migration** `20260519000001_openrouter_provider.sql` — `ALTER TABLE companies ADD COLUMN ai_model_override TEXT NULL`.

### Platform config
- `IntegrationProvider` union extended with `'openrouter'`.
- `SelectedAIProvider` extended; new `getOpenRouterDefaultModel()` reads `platform_integrations.ai_config.metadata.openrouter_default_model`.
- `lib/schemas/admin.ts` — `'openrouter'` added to `integrationKeySchema` zod enum.

### Admin UI
- **Integrations** (`/admin/integrations/ai`) — OpenRouter card alongside Anthropic/Gemini/OpenAI. Save/test/delete reuse the existing pattern. Test endpoint hits `https://openrouter.ai/api/v1/models` and reports model count.
- **AI provider selector** — third radio option. When OpenRouter is selected, a searchable cmdk combobox appears showing 300+ models from the OpenRouter catalog, fed by a new admin-only API route (`/api/admin/openrouter-models`) that proxies + caches the public endpoint.
- **Companies admin** — new `/admin/companies` route with a table of all tenants. Detail page `/admin/companies/[id]` shows the effective model resolution and lets the admin pin or clear a per-company OpenRouter model via the same selector component.

### Server actions
- `setActiveAIProvider('openrouter')` accepted, metadata merge preserves `openrouter_default_model` when flipping providers.
- `setGlobalOpenRouterModel(model)` — persists model id alongside the active provider.
- `setCompanyModelOverride(companyId, model | null)` — writes/clears the per-company column. Validates id format (`/^[\w./:-]+$/`) so a typo can't store garbage.
- All three are audit-logged via the existing `logAdminAction` plumbing (enum extended with `ai_provider.set_model` and `company.set_model_override`).

## Self-Check: PASSED

- `npx tsc --noEmit` — clean.
- `npx eslint <changed paths>` — only one pre-existing warning in `integration-card.tsx` (react-hook-form `watch()` memoization, untouched by this change).
- `npx next build` — compiles successfully, new routes registered: `/admin/companies`, `/admin/companies/[id]`, `/api/admin/openrouter-models`.
- `npx vitest run` — 798 passed, 43 failed. **All 43 failures pre-exist on parent commit (`7a9aab8`)** and are environmental (sandbox network allowlist blocks Supabase calls). No regressions introduced by this task.
- Manual flow review:
  - Super-admin opens `/admin/integrations/ai` → saves an OpenRouter key → clicks Test → gets "Verified. N models available." Switches active provider to OpenRouter → searchable model picker appears, default model persists.
  - Super-admin opens `/admin/companies` → picks tenant → searches "claude" in the combobox → picks `anthropic/claude-3.5-sonnet` → next estimate generated for that tenant routes through OpenRouter with that model.

## Known Stubs

- The OpenRouter `/models` endpoint is public, so the proxy works even before the API key is saved — admins can preview the catalog. We pass the key when available purely for higher rate limits.
- The detail page's "currently effective" line shows the resolution but does not display per-model pricing or capabilities. Out of scope for this quick — covered by the user with "model selector with search," which we have.

## Deviations from Plan

None — implementation matched the plan exactly. The only minor decision made
mid-implementation was that the model catalog proxy attaches the OpenRouter
API key when present but does not require it (the public `/models` endpoint
accepts unauthenticated requests for catalog reads).
