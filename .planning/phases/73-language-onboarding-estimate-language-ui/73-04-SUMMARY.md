---
phase: 73-language-onboarding-estimate-language-ui
plan: 04
subsystem: estimate-ui
tags: [i18n, language, estimate, flag-chip, settings, client]
dependency_graph:
  requires:
    - lib/i18n/resolve-estimate-language.ts (EstimateLanguage, LANGUAGE_LABELS)
    - components/app-shell/flags.tsx (FlagUS, FlagBR, FlagES)
    - estimates.language (column, Phase 52/SEED-016)
    - companies.default_estimate_language (column, Phase 52)
    - clients.preferred_language (column, Phase 52)
  provides:
    - LanguageFlagChip in estimate-view.tsx (share page flag chip)
    - LanguageFlagChip in estimate-preview.tsx (Send tab flag chip)
    - defaultEstimateLanguage Select in company-info-form.tsx
    - preferred_language Select in client-sheet.tsx
  affects:
    - lib/queries/company.ts (CompanySettings type)
    - lib/queries/clients.ts (ClientDetail type)
    - lib/schemas/client.ts (clientSchema)
    - lib/actions/settings.ts (updateCompanySettings)
    - lib/actions/client.ts (createClientAction, updateClientAction)
tech_stack:
  added: []
  patterns:
    - Inline LanguageFlagChip helper defined per consuming file (no shared file — keep change minimal)
    - FLAG_MAP_LANG Record for lang→ComponentType mapping with FlagUS fallback
    - English-first: empty string or null in DB maps to English default (no explicit 'en' stored for company default)
    - as 'en' | 'pt' | 'es' | '' cast for zod literal union + react-hook-form defaultValues compatibility
key_files:
  created: []
  modified:
    - components/share/estimate-view.tsx
    - components/workspace/send/estimate-preview.tsx
    - components/settings/company-info-form.tsx
    - components/clients/client-sheet.tsx
    - lib/schemas/client.ts
    - lib/actions/settings.ts
    - lib/actions/client.ts
    - lib/queries/company.ts
    - lib/queries/clients.ts
decisions:
  - Flag chip defined inline in each consuming file rather than extracted to a shared component — keeps change minimal per plan guidance
  - ComponentType<{ className?: string }> used instead of React.ComponentType to avoid requiring a React namespace import in files that don't already have it
  - As-cast ('en' | 'pt' | 'es' | '') for defaultValues to satisfy zod literal union type — consistent with zodResolver as any pattern used in client-sheet and Resolver<T> cast in company-info-form
  - CompanySettings.default_estimate_language added as string | null (not EstimateLanguage union) — consistent with existing nullable TEXT column pattern; no Docker for type regen (Phase 19 pattern)
metrics:
  duration: 8min
  completed: "2026-05-19"
  tasks: 2
  files: 9
---

# Phase 73 Plan 04: Language UI — Flag Chips + Settings Selectors Summary

Flag chips added to the estimate share view and Send tab preview; language selector fields added to Company Settings and Client edit form, both persisting to existing Phase 52 DB columns.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Flag chips in share view and send preview | 16258c3 | components/share/estimate-view.tsx, components/workspace/send/estimate-preview.tsx |
| 2 | Language selectors in Company Settings and Client form | 160213b | components/settings/company-info-form.tsx, components/clients/client-sheet.tsx, lib/schemas/client.ts, lib/actions/settings.ts, lib/actions/client.ts, lib/queries/company.ts, lib/queries/clients.ts |

## What Was Built

**Task 1 — Flag chips:**
- `LanguageFlagChip` component defined inline in both consuming files (module-level helper, not exported)
- `FLAG_MAP_LANG` maps `'en' | 'pt' | 'es'` to `FlagUS | FlagBR | FlagES` with FlagUS as fallback for unknown values
- In `estimate-view.tsx` (share page): chip renders next to estimate date/version in the project info card
- In `estimate-preview.tsx` (Send tab): chip renders in the header row alongside company and project name
- `estimate.language` already typed as `'en' | 'pt' | 'es'` on `Estimate` (Phase 52) — no type changes needed

**Task 2 — Language selectors:**
- `CompanySettings` type extended with `default_estimate_language: string | null`
- `ClientDetail` type extended with `preferred_language: string | null`
- `companyInfoSchema` adds `defaultEstimateLanguage: z.enum(['en', 'pt', 'es']).optional().or(z.literal(''))`
- `clientSchema` adds `preferred_language: z.enum(['en', 'pt', 'es']).optional().or(z.literal(''))`
- Company Settings form: "Default estimate language" Select (options: English default / Português / Español), persisted via `updateCompanySettings` → `companies.default_estimate_language`
- Client edit form: "Preferred estimate language" Select (options: Not set / English / Português / Español), persisted via `updateClientAction` → `clients.preferred_language`
- Both DB columns exist from Phase 52 — no migrations needed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wired to real DB columns.

## Self-Check: PASSED

- components/share/estimate-view.tsx: FOUND (modified, LanguageFlagChip rendered)
- components/workspace/send/estimate-preview.tsx: FOUND (modified, LanguageFlagChip rendered)
- components/settings/company-info-form.tsx: FOUND (modified, defaultEstimateLanguage Select)
- components/clients/client-sheet.tsx: FOUND (modified, preferred_language Select)
- lib/actions/settings.ts: FOUND (modified, default_estimate_language persisted)
- lib/actions/client.ts: FOUND (modified, preferred_language persisted)
- Commit 16258c3: FOUND
- Commit 160213b: FOUND
- TypeScript: clean (excluding pre-existing validator.ts + turnstile errors unrelated to this plan)
