---
phase: 179-whatsapp-template-composer
plan: 02
subsystem: api
tags: [whatsapp, meta-graph-api, fetch, tdd, webhook]

# Dependency graph
requires:
  - phase: 179-whatsapp-template-composer (plan 01)
    provides: "ordered-param -> BODY component derivation this plan's createMetaTemplate payload will carry (disjoint files, no runtime import between the two plans yet)"
provides:
  - "lib/whatsapp/meta-templates-client.ts: server-only thin typed wrapper around Meta Graph API's template create/status/update endpoints"
  - "createMetaTemplate — real POST /{wabaId}/message_templates payload (parameter_format positional, allow_category_change false by default, fail-closed), never throws"
  - "getMetaTemplateStatus — GET-by-id with defensive dual-field rejection reading (rejected_reason + rejection_reason), normalizes Meta's 'NONE' sentinel to null"
  - "updateMetaTemplate — POST to the item endpoint (Pattern 4 edit+resubmit), distinct URL shape from createMetaTemplate's collection endpoint"
  - "mapMetaEventToStatus — widened to the full documented Meta event vocabulary (14 events), fixing the PAUSED/DISABLED/FLAGGED/LOCKED collapse-to-lowercase-passthrough bug"
affects: ["179-03 (admin-whatsapp-templates.ts server actions — will import this module and delete its own local submitTemplateToMeta components:[] stub and local mapMetaEventToStatus)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Never-throws fetch wrapper returning { ok: true, ... } | { ok: false, status, error } (mirrors lib/whatsapp/client.ts)", "Defensive dual-field JSON reading for LOW-confidence-field-name API responses"]

key-files:
  created:
    - lib/whatsapp/meta-templates-client.ts
    - tests/unit/whatsapp/meta-templates-client.test.ts
  modified: []

key-decisions:
  - "allow_category_change defaults to false (fail-closed) per 179-RESEARCH.md Open Question 2 — Xtimator's consent logic treats UTILITY vs MARKETING as meaningfully different, so a template is never silently recategorized unless the caller explicitly opts in"
  - "UNARCHIVED and REINSTATED both map to 'approved' (Claude's discretion, as documented in the plan) — both are Meta reactivation events for a template that was necessarily approved before archival/disablement"
  - "extractRejectionReason checks rejected_reason before rejection_reason when both carry real values (deterministic precedence, plan-specified)"

patterns-established:
  - "Widened Meta webhook/status event mapping table with an explicit pairwise-distinctness test (Set-size assertion) to structurally prevent status buckets silently re-merging in a future edit"

requirements-completed: [TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04]

# Metrics
duration: 2min
completed: 2026-07-22
---

# Phase 179 Plan 02: Meta Templates Client Summary

**Server-only fetch wrapper for Meta's template create/status/update Graph API endpoints, with `mapMetaEventToStatus` widened from 4 to 14 distinctly-handled events — closing the latent PAUSED/DISABLED/FLAGGED/LOCKED status-collapse bug.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-22T07:50:36-04:00
- **Completed:** 2026-07-22T07:52:56-04:00
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (both new)

## Accomplishments
- `createMetaTemplate` sends a real, non-empty `components` payload (`parameter_format: 'positional'`, `allow_category_change: false` by default) to `POST /{wabaId}/message_templates` — replacing the old `components: []` stub `submitTemplateToMeta` currently sends, never throwing on network/HTTP/malformed-success failures
- `getMetaTemplateStatus` does a GET-by-id, defensively reading both `rejected_reason` and `rejection_reason` (research flagged the exact field name LOW confidence) and normalizing Meta's literal `'NONE'` sentinel to `null`
- `updateMetaTemplate` correctly targets the Pattern 4 item endpoint (`POST /{templateId}`, no `/message_templates` suffix) for the edit-and-resubmit flow, verified via a URL-shape assertion distinguishing it from `createMetaTemplate`'s collection endpoint
- `mapMetaEventToStatus` now resolves all 14 documented Meta `message_template_status_update` events to distinct statuses; `PAUSED`/`DISABLED`/`FLAGGED`/`LOCKED` are provably pairwise-distinct and non-`'approved'` (Set-size assertion), fixing the Pitfall 4 gap where they all fell through to a raw `event.toLowerCase()` passthrough the panel couldn't render meaningfully

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1 (RED): failing tests for meta-templates-client** - `0c3cc0a8` (test)
2. **Task 1 (GREEN): implement meta-templates-client** - `fa121395` (feat)

_No REFACTOR commit needed — implementation was clean on first pass; all 34 tests green without iteration._

## Files Created/Modified
- `lib/whatsapp/meta-templates-client.ts` - New server-only wrapper: `buildCreatePayload`, `createMetaTemplate`, `getMetaTemplateStatus`, `updateMetaTemplate`, `extractRejectionReason`, `mapMetaEventToStatus`, `MetaTemplateStatusResult`
- `tests/unit/whatsapp/meta-templates-client.test.ts` - 34 tests: mocked-`fetch` coverage for all three HTTP calls (success/failure/malformed/network-error paths) plus pure-function coverage for `extractRejectionReason` and the full `mapMetaEventToStatus` event table

## Decisions Made
- `allow_category_change` defaults to `false` (fail-closed) — see key-decisions above
- `UNARCHIVED`/`REINSTATED` -> `'approved'` — see key-decisions above
- Kept the API-version resolution expression (`process.env.META_WHATSAPP_API_VERSION ?? 'v21.0'`) byte-identical to `lib/whatsapp/client.ts` rather than hardcoding a third copy, per 179-RESEARCH.md Pitfall 5

## Deviations from Plan

None — plan executed exactly as written. Sibling plan 179-01 (`lib/whatsapp/template-composer.ts`) was executing concurrently in the same working tree (no worktree isolation, per house rules); commits stayed pathspec-scoped to this plan's two files throughout and the sibling's own commit (`c6c47944`) landed cleanly between this plan's RED and GREEN commits with no overlap or conflict.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This module reuses the existing `platform_integrations`-sourced Meta credentials (caller-supplied `accessToken`/`wabaId` params); no new env vars or dashboard steps introduced.

## Next Phase Readiness
`lib/whatsapp/meta-templates-client.ts` is ready for Plan 179-03 (`admin-whatsapp-templates.ts` server actions) to import directly:
- `submitTemplateToMeta` can replace its inline `components: []` POST with `buildCreatePayload` + `createMetaTemplate`
- `applyTemplateStatusUpdate` can delete its local 4-case `mapMetaEventToStatus` and import this plan's 14-case version
- A new `checkTemplateStatus` server action can wrap `getMetaTemplateStatus` directly
- A new "Resubmit" action can wrap `updateMetaTemplate` directly

No blockers or concerns for 179-03.

---
*Phase: 179-whatsapp-template-composer*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: lib/whatsapp/meta-templates-client.ts
- FOUND: tests/unit/whatsapp/meta-templates-client.test.ts
- FOUND: .planning/phases/179-whatsapp-template-composer/179-02-SUMMARY.md
- FOUND commit: 0c3cc0a8 (test)
- FOUND commit: fa121395 (feat)
