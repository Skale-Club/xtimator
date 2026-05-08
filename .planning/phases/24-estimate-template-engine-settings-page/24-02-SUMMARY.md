---
phase: 24-estimate-template-engine-settings-page
plan: 02
subsystem: ui, settings, server-actions
tags: [estimate-template, server-action, react-hook-form, zod, sonner, supabase]

# Dependency graph
requires:
  - phase: 24-estimate-template-engine-settings-page
    plan: 01
    provides: estimateTemplateSchema, EstimateTemplateFormValues, TEMPLATE_DEFAULTS, CompanySettings with template columns
provides:
  - lib/actions/estimate-template.ts — saveEstimateTemplate server action
  - components/settings/estimate-template-form.tsx — EstimateTemplateForm 'use client' component
affects: [24-03, 25-plain-text-estimate-output]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getAuthContext duplicated per action file (not imported) — established convention (STATE.md Phase 20)"
    - "Empty string to null via || null before DB update (Pitfall 3 — empty = revert to default)"
    - "(revalidateTag as any)('company') cast pattern — consistent with settings.ts"
    - "useTransition + server action + toast + router.refresh() form pattern"
    - "zodResolver cast as Resolver<T> — consistent with defaults-form.tsx"
    - "form.watch() for lightweight live preview — no extra state"
    - "database.types.ts manually extended when migration applied but types not regenerated"

key-files:
  created:
    - lib/actions/estimate-template.ts
    - components/settings/estimate-template-form.tsx
  modified:
    - types/database.types.ts

key-decisions:
  - "saveEstimateTemplate returns { success: true } | { error: string } discriminated union (consistent with other action files)"
  - "ctx.error cast as string to satisfy explicit return type annotation (literal union vs string mismatch)"
  - "Added 4 estimate_template_* columns to database.types.ts (Rule 1 fix — migration applied in Plan 01 but types not regenerated)"
  - "Live preview uses form.watch() — lightweight, no extra state, updates as user types"

patterns-established:
  - "saveEstimateTemplate: getAuthContext + .update({ col: val || null }) + revalidateTag + revalidatePath"
  - "EstimateTemplateForm: useTransition + zodResolver cast + defaultValues null-to-'' + onSubmit '' to null before action call"

requirements-completed: [PLAINTEXT-05]

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 24 Plan 02: Estimate Template Engine + Settings Page — Server Action + Form Summary

**saveEstimateTemplate server action and EstimateTemplateForm client component with 4 textarea fields, variable documentation, live preview, and empty-string-to-null persistence.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-08T14:06:56Z
- **Completed:** 2026-05-08T14:14:56Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Created `saveEstimateTemplate` server action with getAuthContext, empty-string-to-null conversion, and revalidateTag/revalidatePath
- Created `EstimateTemplateForm` client component with 4 labeled textarea fields (greeting/opener/closer/signature), variable documentation per field, live read-only preview, and toast + router.refresh() success path
- Added 4 estimate_template_* columns to database.types.ts so Supabase client types include the new columns (Rule 1 — migration was applied in Plan 01 but types were not regenerated)

## Task Commits

1. **Task 1: Create saveEstimateTemplate server action** - `98773a3` (feat)
2. **Task 2: Create EstimateTemplateForm client component** - `44bc115` (feat)

## Files Created/Modified

- `lib/actions/estimate-template.ts` — saveEstimateTemplate server action with getAuthContext, null-coercion, revalidation
- `components/settings/estimate-template-form.tsx` — EstimateTemplateForm 'use client' component with 4 textarea fields, variable descriptions, live preview
- `types/database.types.ts` — Added estimate_template_greeting/opener/closer/signature to companies Row/Insert/Update types

## Decisions Made

- `ctx.error as string` cast needed because explicit `Promise<{ success: true } | { error: string }>` return type annotation and TypeScript's narrowing of `'error' in ctx` yields `string | undefined`; the cast is safe since both error return paths are string literals
- Live preview built with `form.watch()` — lightweight, zero extra state, updates in real time as user types. Fits "only if trivially cheap" clause in CONTEXT.md

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing estimate_template_* columns to database.types.ts**
- **Found during:** Task 1 (saveEstimateTemplate server action)
- **Issue:** Migration was applied to Supabase in Plan 01 but `types/database.types.ts` was not regenerated — Supabase `update()` call failed TypeScript because the 4 new columns were unknown to the generated type
- **Fix:** Manually added `estimate_template_greeting`, `estimate_template_opener`, `estimate_template_closer`, `estimate_template_signature` as `string | null` to companies `Row`, `Insert`, and `Update` interfaces in `types/database.types.ts`
- **Files modified:** `types/database.types.ts`
- **Verification:** `npx tsc --noEmit` exits 0 after fix
- **Committed in:** `98773a3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix)
**Impact on plan:** Necessary for TypeScript compilation; no scope creep. Same pattern as Plan 19 (STATE.md: "Used Supabase REST API OpenAPI introspection for type generation on Windows").

## Issues Encountered

None — TypeScript error resolved by extending database types as the fix (Rule 1).

## Known Stubs

None — all fields are fully wired to real CompanySettings data. No hardcoded empty values or placeholder text in created files.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `saveEstimateTemplate` and `EstimateTemplateForm` are complete and compile clean
- Plan 03 can now import `EstimateTemplateForm` from `@/components/settings/estimate-template-form` and render it in the `/settings/estimate-templates` page
- 73/73 test files pass, 403 tests GREEN, 0 regressions

---
*Phase: 24-estimate-template-engine-settings-page*
*Completed: 2026-05-08*
