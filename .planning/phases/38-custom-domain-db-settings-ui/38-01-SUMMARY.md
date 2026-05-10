---
phase: 38-custom-domain-db-settings-ui
plan: 01
subsystem: database
tags: [supabase, postgres, zod, server-action, typescript]

requires:
  - phase: 24-estimate-template-engine-settings-page
    provides: "column extension pattern for companies table and focused query pattern"

provides:
  - "Nullable custom_domain TEXT column on companies with partial index"
  - "TypeScript types (Row/Insert/Update) for custom_domain"
  - "customDomainSchema Zod validation (hostname regex, rejects https:// prefix, accepts empty string)"
  - "getCustomDomainSettings focused query (id + custom_domain only)"
  - "saveCustomDomain server action (validate-before-auth, empty→null coercion, revalidateTag('company'))"
  - "7 passing unit tests covering schema + action behavior"

affects:
  - 38-02 (settings UI depends on this data layer)
  - any future phase using custom_domain from companies table

tech-stack:
  added: []
  patterns:
    - "validate-before-auth in server actions (per saveThemePreference pattern)"
    - "empty string → null coercion at DB write time"
    - "focused query function per column set (mirrors getEstimateTemplateSettings pattern)"

key-files:
  created:
    - supabase/migrations/20260510000001_phase38_custom_domain.sql
    - lib/schemas/custom-domain.ts
    - lib/actions/custom-domain.ts
    - tests/unit/custom-domain-action.test.ts
    - tests/unit/schemas/custom-domain.test.ts
  modified:
    - types/database.types.ts
    - lib/queries/company.ts

key-decisions:
  - "NULL initial state with no DEFAULT clause — same pattern as Phase 24 estimate_template_* columns"
  - "hostnameRegex validates bare hostnames; empty string allowed for domain clearing"
  - "Manual TypeScript type extension (not regeneration) — Docker unavailable on Windows, established pattern since Phase 19"
  - "Partial index on custom_domain WHERE NOT NULL — avoids indexing the majority NULL rows"

patterns-established:
  - "Custom domain schema: hostname regex + empty string allowed = clear domain"
  - "saveCustomDomain follows validate-before-auth pattern from saveThemePreference (Phase 09)"

requirements-completed: [DOMAIN-01, DOMAIN-05]

duration: 20min
completed: 2026-05-10
---

# Phase 38 Plan 01: Custom Domain DB + Settings UI Summary

**Nullable custom_domain column on companies with hostnameRegex Zod validation, focused query, and saveCustomDomain server action — data layer ready for Plan 02 UI**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-10T17:30:46Z
- **Completed:** 2026-05-10T17:50:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Applied Supabase migration adding nullable `custom_domain TEXT` column with partial index to companies table
- Manually extended `types/database.types.ts` with custom_domain in Row (required), Insert (optional), Update (optional)
- Implemented `customDomainSchema` with hostname regex — rejects https:// prefix, accepts bare hostnames and empty string for clearing
- Added `getCustomDomainSettings` focused query returning only `id + custom_domain`
- Implemented `saveCustomDomain` server action using validate-before-auth pattern, empty→null coercion, and revalidateTag('company')
- All 7 unit tests GREEN (4 schema + 3 action)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 failing test stubs** - `56357ea` (test)
2. **Task 2: DB migration + TypeScript type extension** - `db31057` (feat)
3. **Task 3: Zod schema + query + server action (TDD GREEN)** - `7bc7e1a` (feat)

## Files Created/Modified
- `supabase/migrations/20260510000001_phase38_custom_domain.sql` - ALTER TABLE companies ADD COLUMN custom_domain + partial index
- `types/database.types.ts` - custom_domain in Row/Insert/Update blocks
- `lib/schemas/custom-domain.ts` - customDomainSchema with hostnameRegex, CustomDomainFormValues type
- `lib/queries/company.ts` - getCustomDomainSettings appended (focused query)
- `lib/actions/custom-domain.ts` - saveCustomDomain server action
- `tests/unit/custom-domain-action.test.ts` - 3 unit tests for saveCustomDomain
- `tests/unit/schemas/custom-domain.test.ts` - 4 unit tests for customDomainSchema

## Decisions Made
- NULL initial state with no SQL DEFAULT — defaults resolved at read time, same as Phase 24 estimate_template_* pattern
- Manual TypeScript type extension (not regeneration) — Docker unavailable on Windows (established since Phase 19)
- Partial index `WHERE custom_domain IS NOT NULL` — efficient for sparse column; avoids indexing majority NULL rows
- validate-before-auth ordering per saveThemePreference pattern (Phase 09 STATE.md)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `bunx` not available on Windows; used `npx supabase db push` instead
- Default DATABASE_URL env var was not set in shell; found credentials in `.env.local` and constructed direct connection URL (`db.{ref}.supabase.co:5432`) required for migrations (pooler URL rejected for DDL)

## User Setup Required
None - no external service configuration required. Migration was applied to the remote Supabase database as part of Task 2.

## Next Phase Readiness
- Plan 02 (settings UI) can proceed: data layer is complete, saveCustomDomain action is ready to wire into a form
- getCustomDomainSettings ready for page.tsx server component
- No blockers

---
*Phase: 38-custom-domain-db-settings-ui*
*Completed: 2026-05-10*
