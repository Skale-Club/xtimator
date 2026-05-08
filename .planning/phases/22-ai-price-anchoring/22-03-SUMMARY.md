---
phase: 22-ai-price-anchoring
plan: 03
subsystem: ai-provider-layer + admin-panel
tags: [wave-2, route-refactor, admin-ui, price-source, provider-switch]
dependency_graph:
  requires:
    - "Phase 22 Plan 02 — lib/ai/ provider layer (getAIProvider, EstimateInput, EstimateOutput)"
    - "Phase 20 — getPriceBookItems() query"
    - "Phase 19 — estimate_items.price_source column"
  provides:
    - "app/api/generate-estimate/route.ts — thin route: no direct Anthropic SDK, uses getAIProvider()"
    - "app/admin/integrations/actions.ts — setActiveAIProvider server action"
    - "app/admin/integrations/page.tsx — Gemini key card + AIProviderSelector rendered"
    - "app/admin/integrations/ai-provider-selector.tsx — client component with radio buttons"
    - "estimate_items.price_source persisted from adapter output on every generation"
  affects:
    - "estimate_items table — price_source now populated from AI adapter output"
    - "admin/integrations UI — Gemini card visible, active provider selector rendered"
tech_stack:
  added: []
  patterns:
    - "Thin route pattern (D-09): auth → context → getAIProvider() → generateEstimate() → persist"
    - "ai_config row filter in decrypt loop (Pitfall 6) — prevents toBuffer(null) crash"
    - "setActiveAIProvider upserts platform_integrations with provider='ai_config' and metadata.selected_ai_provider"
    - "AIProviderSelector uses useTransition + toast for optimistic UI with error revert"
key_files:
  created:
    - "app/admin/integrations/ai-provider-selector.tsx — client radio component for active AI provider"
  modified:
    - "app/api/generate-estimate/route.ts — refactored to thin route using getAIProvider()"
    - "app/admin/integrations/actions.ts — added setActiveAIProvider export"
    - "app/admin/integrations/page.tsx — Gemini in PROVIDERS, ai_config filter, AIProviderSelector rendered"
    - "tests/unit/api/generate-estimate-name-patch.test.ts — updated mocks to use @/lib/ai instead of Anthropic SDK"
decisions:
  - "generate-estimate route no longer imports Anthropic SDK — all AI logic delegated to getAIProvider() factory (D-09)"
  - "getPriceBookItems called before prerequisite check so empty price book still passes (D-10)"
  - "ai_config row filtered from decrypt loop via .filter(r => r.provider !== 'ai_config') — null ciphertext would crash toBuffer()"
  - "generate-estimate-name-patch.test.ts updated to mock @/lib/ai (Rule 1 auto-fix) — old test mocked @anthropic-ai/sdk which is no longer used in route"
metrics:
  duration: "13min"
  tasks_completed: 2
  files_created: 1
  files_modified: 4
  completed_date: "2026-05-08"
requirements: [AIPRICE-01, AIPRICE-02, AIPRICE-03]
---

# Phase 22 Plan 03: Route Wiring + Admin Panel Extension Summary

Thin generate-estimate route using getAIProvider() factory with price_source persisted to estimate_items, plus admin panel extended with Google Gemini key card, setActiveAIProvider action, and AIProviderSelector radio component — closing the Phase 22 loop.

## Tasks Executed

### Task 1: Refactor generate-estimate route to use getAIProvider() and persist price_source

**Commit:** `54981b1`

Refactored `app/api/generate-estimate/route.ts` from 432 lines to a thin route:

- Removed `import Anthropic from '@anthropic-ai/sdk'` — no direct SDK import in route
- Added `import { getAIProvider, type EstimateInput } from '@/lib/ai'`
- Added `import { getPriceBookItems } from '@/lib/queries/price-book'`
- Added `priceBookItems` load after company fetch and before prerequisite check (D-10, AIPRICE-02)
- Built `EstimateInput` object and replaced Steps 2-4 (prompt build + Anthropic call + extraction) with `const provider = await getAIProvider(); const aiEstimate = await provider.generateEstimate(estimateInput)`
- Added `price_source: item.price_source` to the `itemRows` map (D-16, AIPRICE-03)
- `...item` spread in `calculatedSections` already carries `price_source` from `LineItemOutput`

### Task 2: Extend admin panel with Gemini card, provider selector, and full regression gate

**Commit:** `4810b2b`

**app/admin/integrations/actions.ts:**
- Added `setActiveAIProvider(provider: 'anthropic' | 'gemini'): Promise<ActionResult>` — upserts `platform_integrations` row with `provider='ai_config'` and `metadata: { selected_ai_provider: provider }`. Calls `invalidatePlatformConfig()` and `revalidatePath()` after success.

**app/admin/integrations/page.tsx:**
- Added `{ id: 'gemini', title: 'Google Gemini', description: '...' }` to PROVIDERS array
- Imported `getSelectedAIProvider` from `@/lib/platform-config`
- Imported `AIProviderSelector` from `./ai-provider-selector`
- Fetched `activeProvider` in parallel with existing DB query via `Promise.all`
- Added `.filter(r => r.provider !== 'ai_config')` before the decrypt loop (Pitfall 6 — null ciphertext would crash `toBuffer()`)
- Rendered `<AIProviderSelector current={activeProvider} />` below `IntegrationsTabs`

**app/admin/integrations/ai-provider-selector.tsx (new):**
- `'use client'` component with `useState` + `useTransition`
- Radio buttons for 'anthropic' and 'gemini'
- Calls `setActiveAIProvider()` in transition on change, shows toast on success/error, reverts on error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated generate-estimate-name-patch.test.ts to mock @/lib/ai instead of @anthropic-ai/sdk**
- **Found during:** Task 2 full regression gate
- **Issue:** The existing test `tests/unit/api/generate-estimate-name-patch.test.ts` mocked `@anthropic-ai/sdk` and `getIntegrationKey` directly, matching the old route implementation. After the route refactor, the route no longer uses Anthropic SDK or getIntegrationKey — it calls `getAIProvider()`. Also, the test mock didn't include `company_price_book` table, causing `getPriceBookItems` to fail with "order is not a function". This produced 3 new test failures.
- **Fix:** Rewrote test mocks to: (1) mock `@/lib/ai` with `getAIProvider: vi.fn()` returning a fake provider, (2) add `company_price_book` table to `makeSupabaseMock` with full `.select().eq().order().order()` chain, (3) update test assertions to verify the new interface (provider called, priceBookItems passed). Test description updated to reflect D-09 pattern.
- **Files modified:** `tests/unit/api/generate-estimate-name-patch.test.ts`
- **Commit:** `4810b2b` (same task commit)

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Phase 22 unit suite | `npx vitest run tests/unit/ai/` | 17/17 PASS |
| Full suite | `npx vitest run` | 9 pre-existing failures, 0 new (380 pass) |
| TypeScript clean | `npx tsc --noEmit` | 0 errors (clean) |
| No Anthropic import in route | `grep "import Anthropic" app/api/generate-estimate/route.ts` | ok - no match |
| price_source in itemRows | `grep "price_source.*item\.price_source" route.ts` | confirmed |
| No new env vars | `grep -r "GEMINI_API_KEY" app/admin/ lib/ai/ app/api/generate-estimate/` | no new env refs |
| ai_config filter in page | `grep "ai_config" app/admin/integrations/page.tsx` | confirmed |
| AIProviderSelector exists | `ls app/admin/integrations/ai-provider-selector.tsx` | FOUND |
| setActiveAIProvider exported | `grep "setActiveAIProvider" actions.ts` | confirmed |
| gemini in PROVIDERS | `grep "gemini" app/admin/integrations/page.tsx` | confirmed |

## Known Stubs

None — all plan goals implemented and verified.

## Self-Check: PASSED

- FOUND: `app/api/generate-estimate/route.ts` — no Anthropic import, uses getAIProvider()
- FOUND: commit `54981b1` (Task 1)
- FOUND: `app/admin/integrations/actions.ts` — setActiveAIProvider exported
- FOUND: `app/admin/integrations/page.tsx` — gemini in PROVIDERS, ai_config filter, AIProviderSelector rendered
- FOUND: `app/admin/integrations/ai-provider-selector.tsx` — client component
- FOUND: commit `4810b2b` (Task 2)
- FOUND: 17/17 tests GREEN in tests/unit/ai/
- FOUND: 0 new TypeScript errors
- FOUND: 0 new test failures vs baseline (9 pre-existing remain)
