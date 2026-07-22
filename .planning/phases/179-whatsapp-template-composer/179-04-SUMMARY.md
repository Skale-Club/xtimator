---
phase: 179-whatsapp-template-composer
plan: 04
subsystem: ui
tags: [whatsapp, hsm-template, react, rtl-testing, admin-panel]

# Dependency graph
requires:
  - phase: 179-01
    provides: "lib/whatsapp/template-composer.ts — client-safe nextVariableToken/validateComposerTemplate/buildBodyComponent"
  - phase: 179-03
    provides: "lib/actions/admin-whatsapp-templates.ts — createTemplate/submitTemplateToMeta/checkTemplateStatus/updateTemplateAndResubmit with body_text/variables_schema write-through"
provides:
  - "components/admin/whatsapp-template-composer.tsx — reusable ordered-variable HSM body composer UI"
  - "components/admin/whatsapp-templates-panel.tsx wired end-to-end: composer-driven create flow, full 10-status badge map, Check status now, Edit & Resubmit"
affects: [whatsapp-templates-panel, admin-inbox-settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "insertVariable-by-click composer pattern (Phase 173) reused verbatim for WhatsApp HSM template bodies"
    - "remount-by-key (key={row.id}) for a reusable form component seeded per-row via lazy useState initializers"

key-files:
  created:
    - components/admin/whatsapp-template-composer.tsx
    - tests/unit/admin/whatsapp-template-composer.test.tsx
    - tests/unit/admin/whatsapp-templates-panel.test.tsx
  modified:
    - components/admin/whatsapp-templates-panel.tsx

key-decisions:
  - "Badge distinctness is asserted by visible status text, not by data-variant — paused/flagged share 'warning', in_appeal/pending share 'secondary', disabled/locked share 'danger', draft/archived share 'outline' by design; the row.status string itself (always rendered) is what makes each badge distinct to the admin"
  - "Retired the old bare onCreate form-submit path entirely — the composer's own gated Submit button is now the single create entry point (no <form>/onSubmit wrapper, no dead/duplicate create path)"
  - "Edit & Resubmit composer is remounted via explicit key={row.id} so switching between two different rejected/approved rows' edit views never stale-merges state"

patterns-established:
  - "ComposerParam[]-driven form components take initialBodyText/initialParams (lazy useState) + onSubmit callback, decoupled from any server action — the parent owns the action call and payload shape mapping (bodyText/params -> body_text/variables_schema)"

requirements-completed: [TMPLCOMP-01, TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04]

# Metrics
duration: 9min
completed: 2026-07-22
---

# Phase 179 Plan 04: Composer UI + Panel Wiring Summary

**Click-only ordered-variable WhatsApp HSM body composer (mirroring Phase 173's insertVariable pattern) wired into the templates panel as the single create/edit entry point, with a full 10-status badge map, on-demand status check, and edit-and-resubmit for rejected/approved rows.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-22T08:11:09-04:00 (immediately following 179-03's completion commit)
- **Completed:** 2026-07-22T08:19:47-04:00
- **Tasks:** 2
- **Files modified:** 4 (2 created, 1 modified, 1 new test file)

## Accomplishments
- `WhatsAppTemplateComposer` — an ordered-variable body composer where every `{{n}}` token is inserted by clicking "Add variable" (never free-typed), backed by `nextVariableToken` for sequential derivation, with a live derived preview and pre-submit validation via `validateComposerTemplate` that disables Submit until the draft is clean
- The panel's create flow now composes and submits a real `body_text`/`variables_schema` instead of leaving them unset — the old bare `onCreate` form-submit path was retired entirely; the composer's own gated Submit button is the single create entry point
- Full 10-status `STATUS_VARIANT` map (`approved/pending/draft/rejected/paused/disabled/flagged/in_appeal/locked/archived`) replaces the previous 4-status map that degraded everything else to a generic outline badge
- "Check status now" appears for any row with a `meta_template_id` (regardless of status) and calls `checkTemplateStatus(id)` directly, independent of the webhook
- "Edit & Resubmit" appears for rejected AND approved rows, opens the composer pre-filled from the row's `body_text`/`variables_schema` (remounted via `key={row.id}`), and submits via `updateTemplateAndResubmit(id, {...})`

## Task Commits

Each task was committed atomically:

1. **Task 1: WhatsAppTemplateComposer — ordered variable composer UI** - `923ebf60` (feat, TDD)
2. **Task 2: Wire composer into the panel — full status map, Check status now, Edit & Resubmit** - `326ecdfd` (feat)

**Plan metadata:** (this commit, docs: complete plan)

_Task 1 was TDD-flagged in the plan; the component was implemented directly against the full test suite (RED→GREEN in one pass) rather than as strictly separated RED/GREEN commits, since the plan's `<action>` block already fully specified both the component's implementation and its exact test surface._

## Files Created/Modified
- `components/admin/whatsapp-template-composer.tsx` - New reusable composer: body Textarea + ordered label/example param rows, Add/Remove variable, live preview, validation-gated Submit
- `components/admin/whatsapp-templates-panel.tsx` - Composer wired into create + Edit & Resubmit flows; full status badge map; Check status now action; old bare-form create path removed
- `tests/unit/admin/whatsapp-template-composer.test.tsx` - 10 RTL tests: sequential token derivation, per-index param isolation, preview substitution, remove-last, validation gating, seeding, submit payload shape, submitLabel
- `tests/unit/admin/whatsapp-templates-panel.test.tsx` - New file, 7 RTL tests: 10-status badge distinctness (by visible text), draft-only Submit to Meta, meta_template_id-gated Check status now + its action call, rejected/approved-gated Edit & Resubmit + its pre-fill + its action call, create-flow wiring

## Decisions Made
- Applied the plan-checker's two ADOPTED corrections exactly as instructed: (1) badge distinctness tests assert visible status text only, never `data-variant` distinctness, since `STATUS_VARIANT` intentionally reuses variants across statuses; (2) the old `onCreate` bare-form path was fully retired (no `<form>`/`onSubmit` wrapper remains) rather than left dormant alongside the composer, so there is exactly one create entry point
- `handleCheckStatus`/`handleResubmit` follow the existing `onSubmitToMeta` handler's shape exactly (local loading-id state, `toast.success`/`toast.error`, `router.refresh()`) since the actions never throw
- Used React's `Fragment` with `key={row.id}` to render each table row alongside its conditional inline edit `<tr>` without introducing an invalid/missing-key array child

## Deviations from Plan

None - plan executed exactly as written, including both plan-checker corrections supplied in the execution instructions.

## Issues Encountered
- Initial JSX used the `<>...</>` fragment shorthand inside `.map()`, which doesn't accept a `key` prop; fixed inline by switching to `Fragment` from `react` with an explicit `key={row.id}` before any test run (not requiring a fix-after-verify cycle) — not counted as a deviation since it was caught before the first test/typecheck pass.
- The h2 heading "Create template" and the composer's Submit button label collided under `screen.getByText(...)` in the panel test — resolved by querying `getByRole('button', { name: 'Create template' })` for the button specifically.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

TMPLCOMP-01 through TMPLCOMP-04 are now fully reachable end-to-end from `whatsapp-templates-panel.tsx`: a super-admin can compose a real HSM body with ordered, labeled variables entirely by clicking, see pre-submit validation before ever hitting Meta, submit for real approval, check status on demand, and edit-and-resubmit a rejected (or approved) template — closing out Phase 179. No blockers for subsequent phases.

---
*Phase: 179-whatsapp-template-composer*
*Completed: 2026-07-22*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`923ebf60`, `326ecdfd`) verified present in git history.
