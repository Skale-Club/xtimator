---
phase: quick-260624-ajz
plan: 01
subsystem: admin-integrations / price-research
tags: [admin, price-research, platform-integrations, server-action, i18n]
requires:
  - lib/estimate/price-research/provider.ts (getActiveResearchSource reader contract)
  - app/admin/integrations/actions.ts (ActionResult + requireAdmin/service-client pattern)
  - lib/admin/integrations-providers.ts (Category config-only pattern)
provides:
  - setPriceResearchSource server action (requireAdmin-gated price_research upsert)
  - admin 'Price Research' config card (enable + source + engine)
affects:
  - getPriceResearchProvider() / getPriceResearchProviderChain() resolution (now DB-configurable, no redeploy)
tech-stack:
  added: []
  patterns:
    - config-only integration category (empty providers[] + show*Config flag)
    - disable-as-dormant (persist research_source:null so the live reader returns null)
key-files:
  created:
    - app/admin/integrations/price-research-config-form.tsx
    - tests/unit/admin/price-research-config.test.ts
  modified:
    - app/admin/integrations/actions.ts
    - lib/admin/integrations-providers.ts
    - app/admin/integrations/integration-category-content.tsx
decisions:
  - "Disable persists research_source:null (a non-matching value) rather than deleting the row — keeps research_engine for re-enable; getActiveResearchSource() returns null → dormant."
  - "Single Save button (mirrors xphere-config-form) instead of instant-on-change, avoiding 3 separate writes."
  - "Config-only category: empty providers[] + showPriceResearchConfig flag, so NO encrypted IntegrationCard renders (price_research reuses existing OpenRouter/Anthropic keys — no new credential)."
metrics:
  duration: ~5m
  completed: 2026-06-24
  tasks: 2
  files: 5
  commits: 2
---

# Quick 260624-ajz: Super-Admin Price-Research Source Control Summary

Adds the deferred super-admin control that configures the v4.6 price-research source live from `/admin/integrations/price-research` — a requireAdmin-gated `setPriceResearchSource` server action that upserts `platform_integrations(provider='price_research', metadata={research_source, research_engine})`, plus an EN/PT/ES config card (enable toggle + source select + engine select) wired to it. The readers (`getActiveResearchSource` / `getPriceResearchProvider`) query the DB live, so enabling/disabling/switching source takes effect with no redeploy.

## What Was Built

**Task 1 — `setPriceResearchSource` server action + unit test** (commit `69ab2529`)
- Appended to `app/admin/integrations/actions.ts`, mirroring `setActiveAIProvider` exactly: `requireAdmin()` FIRST (the gate), inline enum validation (`source ∈ {openrouter_web, anthropic_web}`, `engine ∈ {exa, native}`), best-effort prev-metadata read, service-role upsert `onConflict: 'provider'`, `invalidatePlatformConfig()` + `revalidatePath('/admin/integrations')` + `logAdminAction('price_research.set')`.
- ENABLE persists the activating `research_source`; DISABLE persists `research_source: null` (a non-matching value) so `getActiveResearchSource()` returns null → `getPriceResearchProvider()` resolves null (dormant, safe Phase-108 no-op). `research_engine` is preserved either way so re-enabling restores the prior engine.
- `tests/unit/admin/price-research-config.test.ts` — 5 tests copying the `save-seo.test.ts` mock harness (requireAdmin mock, chainable `from()` capturing `lastUpsertPayload`, platform-config/audit-log/next-cache mocks): enable-openrouter+exa shape, enable-anthropic+native shape, disable→`research_source` null, invalid-source→`ok:false` + no upsert, non-admin→rejects + no upsert.

**Task 2 — price-research category + config card UI** (commit `eaf1d5c3`)
- `lib/admin/integrations-providers.ts`: added `showPriceResearchConfig?: boolean` to the `Category` type and a new config-only `price-research` category (empty `providers: []` + the flag) after `crm` — no encrypted `IntegrationCard` renders.
- `app/admin/integrations/price-research-config-form.tsx` (NEW, `'use client'`): mirrors `ai-provider-selector` (`useTranslation` for EN/PT/ES) + `xphere-config-form` (card shell + `useTransition` + `toast` + Save button). Enable checkbox + source `<select>` + engine `<select>`, all disabled while pending, seeded from `current`, calling `setPriceResearchSource({ enabled, source, engine })`.
- `app/admin/integrations/integration-category-content.tsx`: server-side read of the `price_research` metadata row → `{ enabled, source, engine }` (enabled iff source ∈ the activating set), rendering `<PriceResearchConfigForm current={priceResearch} />` under `category.showPriceResearchConfig`.

## Verification

- `npx vitest run tests/unit/admin/price-research-config.test.ts` → 5/5 pass (RED confirmed before the action existed, GREEN after).
- Scoped `npx tsc --noEmit -p tsconfig.json` over the three Task-2 files → SCOPED-CLEAN.
- FULL `npx vitest run` → **276 files passed | 3 skipped, 1937 passed | 2 skipped | 33 todo** (baseline 275/1932; +1 file / +5 assertions — no regressions).
- Acceptance greps: `setPriceResearchSource` fn count = 1, `provider: 'price_research'` = 1, disable-null clause present, `showPriceResearchConfig` = 2 (type + flag), `slug: 'price-research'` = 1, form imports the action + uses `useTranslation`, content imports + renders the form.
- gitleaks ran on both commits (normal hooked — no `--no-verify`), no leaks found. No remote DB writes (no migration; the upsert is exercised only against the mocked client in tests).
- Reader contract trace (no live DB): persisted `metadata.research_source` ∈ {openrouter_web, anthropic_web} on enable (→ `getPriceResearchProvider()` resolves) and `null` on disable (→ returns null), matching `getActiveResearchSource()` exactly.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: app/admin/integrations/price-research-config-form.tsx
- FOUND: tests/unit/admin/price-research-config.test.ts
- FOUND commit 69ab2529 (Task 1)
- FOUND commit eaf1d5c3 (Task 2)
