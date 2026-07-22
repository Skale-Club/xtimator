---
phase: 179-whatsapp-template-composer
plan: 03
subsystem: api
tags: [whatsapp, meta-graph-api, supabase, server-actions, tdd]

# Dependency graph
requires:
  - phase: 179-whatsapp-template-composer (plan 01)
    provides: "validateComposerTemplate / buildBodyComponent — the stored body_text/variables_schema validation + Meta BODY component derivation this plan wires into submitTemplateToMeta/updateTemplateAndResubmit"
  - phase: 179-whatsapp-template-composer (plan 02)
    provides: "createMetaTemplate / getMetaTemplateStatus / updateMetaTemplate / mapMetaEventToStatus — the Meta Graph API wrapper this plan's actions call directly, plus the widened status-mapping table applyTemplateStatusUpdate now shares"
provides:
  - "body_text column on whatsapp_notification_templates (migration, manual-apply pending)"
  - "submitTemplateToMeta: real, validated, non-empty components payload replacing the components:[] stub; variables_schema write-through on success"
  - "checkTemplateStatus(id) — on-demand Meta status GET, shared mapMetaEventToStatus, persists result, never throws"
  - "updateTemplateAndResubmit(id, input) — Pattern 4 edit-and-resubmit against the SAME meta_template_id, validates before any DB read"
  - "closed Wave-0 test gap: submitTemplateToMeta's real success path (and the two new actions) now have actual coverage, not just a stub 'does NOT throw' assertion"
affects: ["179-04 (composer UI — will call createTemplate/submitTemplateToMeta/checkTemplateStatus/updateTemplateAndResubmit with body_text + ComposerParam[] input)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validate STORED state via the same pure validator the UI uses (validateComposerTemplate) BEFORE any network call, returning a distinct reason:'invalid' bucket alongside the existing reason:'scope'/'not_found'"
    - "Write-through discipline: variables_schema is only ever set in the SAME update call that also sets meta_template_id/status/body_text — never as an independent field edit"
    - "requireAdmin() as the literal first statement in every admin-gated action, with validation/DB-read gates ordered after it (not before)"

key-files:
  created:
    - supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql
  modified:
    - types/database.types.ts
    - lib/actions/admin-whatsapp-templates.ts
    - tests/unit/admin/whatsapp-templates.test.ts

key-decisions:
  - "requireAdmin() stays the literal first call in updateTemplateAndResubmit (per must_haves.truths), with validateComposerTemplate running immediately after — still satisfies 'validation before any DB read' since the DB read happens later, in a separate step"
  - "checkTemplateStatus/updateTemplateAndResubmit fetch accessToken via getWhatsAppPlatformConfig() and return a plain { ok:false, error } (no 'reason' field) on a missing token — the plan's literal action signatures for these two functions don't carry a reason union member, unlike submitTemplateToMeta's reason:'scope'"
  - "parseComposerParams degrades any malformed/legacy variables_schema to [] rather than throwing — an empty array then fails validateComposerTemplate with a clear error instead of crashing the action"

patterns-established: []

requirements-completed: [TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04, TMPLCOMP-05]

# Metrics
duration: 15min
completed: 2026-07-22
---

# Phase 179 Plan 03: Real submitTemplateToMeta Payload + Status Check + Resubmit Summary

**submitTemplateToMeta now validates stored body_text/variables_schema and sends Meta a real non-empty components payload (replacing the components:[] stub); checkTemplateStatus and updateTemplateAndResubmit round out Meta's review lifecycle (on-demand status + edit-and-resubmit), both reusing the Plan 179-01/02 validator and Graph API wrapper.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-22T07:56:00-04:00
- **Completed:** 2026-07-22T08:08:45-04:00
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `submitTemplateToMeta` reads the row's `body_text` + `variables_schema`, runs `validateComposerTemplate` BEFORE any network call (an incomplete draft is refused with `reason:'invalid'`, never silently POSTed as `components: []`), then on a valid draft builds a real `components` payload via `buildBodyComponent` + `buildCreatePayload` and calls the real `createMetaTemplate`
- On successful submission, the SAME update call sets `meta_template_id`, `status:'pending'`, AND `variables_schema` (write-through) — making the Phase 174 `expectedVariableCount` guard live for real submissions for the first time
- `checkTemplateStatus(id)` added: on-demand `getMetaTemplateStatus` GET, mapped through the SAME widened `mapMetaEventToStatus` the webhook uses, persisted, never throws
- `updateTemplateAndResubmit(id, input)` added: validates first, then re-POSTs to the SAME `meta_template_id` via `updateMetaTemplate` (Pattern 4, not a new template), flips status back to `pending`, clears `rejection_reason`
- `applyTemplateStatusUpdate` now imports the shared 14-case `mapMetaEventToStatus` from `lib/whatsapp/meta-templates-client.ts` — the local 4-case duplicate is deleted
- `body_text` migration added (idempotent `ADD COLUMN IF NOT EXISTS`) + `types/database.types.ts` widened
- Wave-0 test gap closed: the file's only pre-existing `submitTemplateToMeta` coverage was a stub "does NOT throw" assertion that never exercised a real success path; 17 new tests now cover the real payload, the write-through, both new actions, and every failure branch

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema + real submitTemplateToMeta payload + variables_schema write-through** - `efaaa97e` (feat)
2. **Task 2: checkTemplateStatus + updateTemplateAndResubmit** - `eeee7d85` (feat)

**Plan metadata:** (this commit) `docs(179-03): complete plan`

## Files Created/Modified
- `supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql` - Idempotent `body_text` column + updated column comments; NOT auto-applied (manual per project convention)
- `types/database.types.ts` - `whatsapp_notification_templates` Row/Insert/Update widened with `body_text: string | null`
- `lib/actions/admin-whatsapp-templates.ts` - `TemplateRow`/`CreateTemplateInput` widened; `parseComposerParams` helper; `submitTemplateToMeta` rewritten for real payload + write-through; `checkTemplateStatus` and `updateTemplateAndResubmit` added; local `mapMetaEventToStatus` deleted in favor of the imported widened version
- `tests/unit/admin/whatsapp-templates.test.ts` - Additive: `makeTemplatesClientWithRow` helper + partial `meta-templates-client` mock + `getWhatsAppPlatformConfig` mock; 17 new tests across 4 new `describe` blocks; the 5 pre-existing tests are byte-for-byte unmodified and still pass

## Decisions Made
- See `key-decisions` in frontmatter above (requireAdmin-first ordering, no `reason` field on the two new actions' missing-token path, `parseComposerParams` degrade-to-`[]` behavior).

## Deviations from Plan

None — plan executed exactly as written, including the plan-checker W1 correction (mock `@/lib/platform-config` globally; `checkTemplateStatus`/`updateTemplateAndResubmit` fetch the token via `getWhatsAppPlatformConfig()` before calling their respective Meta client function).

To keep each task's commit truly atomic (Task 1 and Task 2 both touch the same two files), Task 2's code and tests were written after Task 1's verification passed, then temporarily reverted, Task-1-only state was re-verified (`tsc` + `vitest run tests/unit/admin/whatsapp-templates.test.ts` + `tests/unit/admin/ tests/unit/whatsapp/`) and committed, and only then was Task 2's code/tests reapplied, re-verified, and committed separately — so each commit's diff maps exactly to its task's file list, with no cross-task leakage in either commit.

## Issues Encountered
None.

## User Setup Required
**External migration requires manual application.** `supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql` is NOT applied automatically by the deploy pipeline (project convention). Apply to prod via the Supabase MCP server `f2b95485` / project `prmqgcrnpuvpzruyzvuv` (or the SQL editor) BEFORE Plan 179-04's composer UI is used against real data. Verify via:
```sql
select column_name from information_schema.columns
where table_name = 'whatsapp_notification_templates' and column_name = 'body_text';
```

## Next Phase Readiness
`lib/actions/admin-whatsapp-templates.ts` now exposes the full admin action surface Plan 179-04's composer UI needs: `createTemplate`/`listTemplates` (widened for `body_text`), `submitTemplateToMeta` (real payload), `checkTemplateStatus`, and `updateTemplateAndResubmit`. No blockers for 179-04, other than the manual migration apply noted above.

---
*Phase: 179-whatsapp-template-composer*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql
- FOUND: lib/actions/admin-whatsapp-templates.ts
- FOUND: tests/unit/admin/whatsapp-templates.test.ts
- FOUND: .planning/phases/179-whatsapp-template-composer/179-03-SUMMARY.md
- FOUND commit: efaaa97e (feat)
- FOUND commit: eeee7d85 (feat)
