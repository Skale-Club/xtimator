---
phase: 94-estimate-invoice-decoupling
plan: 05
subsystem: estimates
tags: [estimates, invoices, consolidate-removal, always-editable, supabase, whatsapp, share-page, refactor]

# Dependency graph
requires:
  - phase: 94-01
    provides: Wave 0 RED contract test (estimate-save-no-gate.test.ts) defining the always-editable target
  - phase: 94-04
    provides: GenerateInvoiceDialog + IssuedInvoicesPanel in the editor (so consolidate CTA could be safely removed)
provides:
  - Always-editable estimates — the consolidate lock is fully retired
  - saveEstimate writes with no workflow_status pre-check
  - No workflow_status==='consolidated' gate on share page / send / send-sms / send-whatsapp / refine / pdf routes
  - consolidateEstimate + createNewDraftVersion server actions deleted
  - one_active_draft_per_project unique index dropped (migration)
  - WhatsApp inbox lists every estimate as sendable (consolidated filter removed)
  - Estimate type + share query no longer carry workflow_status/consolidated_* fields
affects: [94-06, invoices, estimate-editing, whatsapp-inbox, share-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dormant-column retirement: drop reads/gates that enforce a lock while KEEPING the underlying NOT-NULL-DEFAULT columns so existing writers (WhatsApp confirm, MCP read, generate-estimate, profile-field-map) keep compiling"
    - "Index-only migration: retire a behavioral constraint by dropping its unique index, not its columns"

key-files:
  created:
    - supabase/migrations/20260619000002_phase94_drop_consolidate_index.sql
  modified:
    - lib/actions/estimate.ts
    - lib/queries/estimate.ts
    - lib/queries/share.ts
    - lib/actions/whatsapp-inbox.ts
    - app/estimate/[token]/page.tsx
    - app/api/estimates/[id]/send/route.ts
    - app/api/estimates/[id]/send-sms/route.ts
    - app/api/estimates/[id]/send-whatsapp/route.ts
    - app/api/estimates/[id]/refine/route.ts
    - app/api/estimates/[id]/pdf/route.ts
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-floating-actions.tsx
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-header.tsx
    - components/workspace/send/send-tab.tsx
    - components/workspace/project-header.tsx
    - components/workspace/estimate-version-context.tsx
    - tests/unit/share-query.test.ts
    - tests/unit/utils/estimate-template.test.ts
    - scripts/seed-demo-workspace.mjs

key-decisions:
  - "KEEP workflow_status / consolidated_at / consolidated_by COLUMNS dormant (NOT NULL DEFAULT 'draft') — only reads/gates removed; live writers (confirm-actions, mcp read, generate-estimate, profile-field-map) keep compiling"
  - "KEEP is_current / version columns — independent of consolidate; the editor always opens the single current estimate"
  - "Drop ONLY the one_active_draft_per_project unique index; no column drops"
  - "Demo seed stops writing the retired 'consolidated' value so demo data matches the always-editable model (coherence cleanup aligned with D-01)"

patterns-established:
  - "Lock retirement via gate removal + dormant columns: when a status value is woven through many writers, retire the lock by deleting the read gates and keeping the column with a safe default, rather than dropping the column"

requirements-completed: [INVOICE-01]

# Metrics
duration: ~45min
completed: 2026-06-19
---

# Phase 94 Plan 05: Retire the Estimate Consolidate Lock Summary

**Estimates are now always editable — the consolidate lock is fully retired: the single-draft unique index is dropped, all 6 server-side `workflow_status==='consolidated'` gates plus the save write-block are gone, `consolidateEstimate`/`createNewDraftVersion` and their UI are deleted, and the WhatsApp inbox lists every estimate as sendable — all while keeping the `workflow_status`/`consolidated_*` columns dormant so dependent writers still compile (net −547 lines).**

## Performance

- **Duration:** ~45 min (continuation session for Task 4 + coherence cleanup; Tasks 1-3 committed in a prior session)
- **Started:** 2026-06-19T14:48:13Z (first 94-05 commit)
- **Completed:** 2026-06-19T15:32:16Z
- **Tasks:** 4 of 4
- **Files modified:** 21 (20 plan-enumerated + 1 deviation: demo seed)

## Accomplishments
- Dropped the `one_active_draft_per_project` unique index (index-only migration; no column drops) so a project can hold one always-editable current estimate.
- Removed every server-side consolidate gate: the `saveEstimate` write-block ("This estimate is consolidated…") and the `workflow_status !== 'consolidated'` checks on the share page and the send / send-sms / send-whatsapp / refine / pdf routes.
- Deleted the `consolidateEstimate` and `createNewDraftVersion` server actions and all their UI: the consolidate button, ConsolidateAlert, draft-lock card, workflow-status badge/pill, and the retired version-switch chrome (version Select + version dropdown).
- Fixed the WhatsApp inbox sendability filter — removed `.eq('workflow_status','consolidated')` from `listSendableEstimates` so the always-editable model still surfaces sendable estimates (would otherwise return zero rows).
- Slimmed the `Estimate` type and share query (dropped `workflow_status`/`consolidated_at`/`consolidated_by`; cleaned the share `Omit`, destructure, and `getShareLinkState` select) and updated both test fixtures to match.
- Turned the Wave 0 RED contract `tests/unit/actions/estimate-save-no-gate.test.ts` GREEN with zero new test regressions across the full suite.

## Task Commits

Each task was committed atomically (git hooks enabled; gitleaks passed on every commit):

1. **Task 1: Drop single-draft index + remove server gates + delete consolidate actions** - `669862f` (feat)
2. **Task 2: Remove consolidate UI + version-switch chrome; fix WhatsApp inbox sendability** - `290a5b8` (feat)
3. **Task 3: Drop consolidate fields from Estimate type, share query + fixtures** - `d0d81d9` (test)
4. **Task 4: Full-suite green gate** - verification only (no source change required); the demo-seed coherence cleanup landed in `8923e5e` (chore)

_Task 4 produced no source-gate changes because Tasks 1-3 already satisfied the green gate; the only Task-4 commit is the deviation cleanup below._

## Files Created/Modified
- `supabase/migrations/20260619000002_phase94_drop_consolidate_index.sql` - Drops ONLY `one_active_draft_per_project`; explicitly leaves the consolidate columns dormant.
- `lib/actions/estimate.ts` - Removed the `saveEstimate` write-block and the `consolidateEstimate` + `createNewDraftVersion` actions; `createBlankEstimate` still inserts the dormant `workflow_status: 'draft'`.
- `lib/queries/estimate.ts` - Dropped `workflow_status`/`consolidated_at`/`consolidated_by` from the `Estimate` interface; KEEP `is_current`/`version`.
- `lib/queries/share.ts` - Removed `consolidated_by` from the `Omit`, dropped the `_consolidatedBy` destructure, and `getShareLinkState` now selects only `share_expires_at`.
- `lib/actions/whatsapp-inbox.ts` - Removed the `consolidated` sendability filter from `listSendableEstimates`.
- `app/estimate/[token]/page.tsx` - Deleted the consolidated `notFound()` gate so the live estimate renders (D-05).
- `app/api/estimates/[id]/{send,send-sms,send-whatsapp,refine,pdf}/route.ts` - Deleted the 409/consolidated gates; dropped `workflow_status` from selects that fetched it only for the gate.
- `components/workspace/estimate/estimate-editor.tsx` - Removed consolidate imports/handlers, simplified `isReadOnly` to `!state.is_current`, and dropped consolidate props from `EstimateFloatingActions`; KEEP the Plan-04 GenerateInvoiceDialog/IssuedInvoicesPanel.
- `components/workspace/estimate/estimate-floating-actions.tsx` - Deleted ConsolidateAlert + the consolidated render branch + consolidate props (now renders only the draft branch).
- `components/workspace/estimate/use-estimate-reducer.ts` - Removed `workflow_status` from state + both initState paths.
- `components/workspace/estimate/estimate-header.tsx` - Removed the read-only/consolidated Badge and the retired version Select.
- `components/workspace/send/send-tab.tsx` - Removed `isDraft` (driven by workflow_status), the draft-lock Card, and the `disabled` props.
- `components/workspace/project-header.tsx` - Removed the workflow-status pill and the retired version dropdown.
- `components/workspace/estimate-version-context.tsx` - Removed `workflowStatus` from `VersionSlot`.
- `tests/unit/share-query.test.ts`, `tests/unit/utils/estimate-template.test.ts` - Fixtures updated to the slimmed `Estimate` type.
- `scripts/seed-demo-workspace.mjs` - Stopped seeding the retired `'consolidated'` value (deviation — see below).

## Decisions Made
- **Kept the consolidate columns dormant, removed only the reads/gates.** Per the plan's KEY DECISION (RESEARCH Open Question 2): dropping `workflow_status` would break four un-enumerated live writers/readers (`lib/whatsapp/confirm-actions.ts`, `lib/mcp/tools/read.ts`, `lib/services/generate-estimate.ts`, `lib/estimate/profile-field-map.ts`). The `NOT NULL DEFAULT 'draft'` keeps all existing INSERTs valid; the lock is gone because nothing reads the value to gate behavior anymore. Verified all four writers/readers still reference the column post-change.
- **Kept `is_current`/`version`** — independent of consolidate; the editor always opens the single current estimate (versioning UI retired, columns harmless).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical / coherence] Demo seed stopped writing the retired `consolidated` value**
- **Found during:** Task 4 (full-suite green gate) — cross-checking RESEARCH §4 blast radius, which flagged `scripts/seed-demo-workspace.mjs` as writing `workflow_status: 'consolidated'` + `consolidated_at`/`consolidated_by`.
- **Issue:** The demo seed still wrote the retired `'consolidated'` value to the now-dormant column. Not a compile/test break (the seed is a standalone Node script, not in the vitest run, and the columns still exist), but it contradicts D-01 ("consolidate concept removed entirely") and would seed demo data into a dead lock state.
- **Fix:** Removed the `consolidated` variable and the three retired-field assignments so demo estimates take the dormant `DEFAULT 'draft'`; updated the stale comment to "always-editable". Verified `node --check` passes and `demoUserId` is still used elsewhere (no unused-variable fallout).
- **Files modified:** scripts/seed-demo-workspace.mjs
- **Verification:** `node --check scripts/seed-demo-workspace.mjs` → SYNTAX OK; grep confirms no `'consolidated'` value-write remains.
- **Committed in:** `8923e5e` (chore)

---

**Total deviations:** 1 auto-fixed (1 coherence/missing-critical)
**Impact on plan:** The single deviation removes a dead consolidate writer to keep the codebase coherent with the locked decision. No scope creep, no behavior change to running app code.

## Issues Encountered
None during the consolidate removal itself. The full-suite gate surfaced 25 PRE-EXISTING failing files unrelated to this plan — see Deferred Issues.

## Deferred Issues

**Pre-existing environment failures (NOT caused by this plan) — 24 test files + tsc errors from uninstalled optional deps.**
- A set-diff of failing test files between `main` and the pre-94-05 baseline commit `9fd0fb6` shows **zero new regressions** from the consolidate removal. The only delta is `tests/unit/actions/estimate-save-no-gate.test.ts` going RED→GREEN (the intended outcome).
- Root cause: `langfuse`, `@sentry/nextjs`, `@modelcontextprotocol/sdk`, `@langchain/*` are declared in `package.json` but not installed in `node_modules` in this local env → `Failed to resolve import` / `TS2307`. Affects the `mcp-*`, `inngest/*`, `whatsapp/*`, `ai/provider-factory`, `errors/*` suites, plus pre-existing fixture drift (`onboarding-survey`, `theme-toggle`, `landing-actions`, `capture-attempt-lineage`, `account-emails`).
- Also pre-existing and expected: `tests/unit/billing/invoices-backfill-migration.test.ts` (owned by Plan 94-06, still pending).
- Logged in `.planning/phases/94-estimate-invoice-decoupling/deferred-items.md`. Resolution: run a full `npm install`; the fixture-drift tests are unrelated to this milestone and triaged separately.

## Known Stubs
None — this plan is a removal; no placeholder data or unwired components were introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 94-06 (backfill + retirement) can proceed: it creates `supabase/migrations/20260619000003_phase94_backfill_invoices.sql` (turns the pre-existing backfill RED GREEN) and retires the `/estimate/[token]/pay` Checkout route.
- The consolidate concept is fully retired from app code; the dormant columns remain for history/backfill and can be dropped later if ever desired (would first require migrating the four remaining writers off them).
- Local note: a full `npm install` is needed before the suite runs fully green (missing optional deps are an environment gap, not a code defect from this milestone).

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260619000002_phase94_drop_consolidate_index.sql`
- FOUND: `.planning/phases/94-estimate-invoice-decoupling/94-05-SUMMARY.md`
- FOUND commits: `669862f`, `290a5b8`, `d0d81d9`, `8923e5e`

---
*Phase: 94-estimate-invoice-decoupling*
*Completed: 2026-06-19*
