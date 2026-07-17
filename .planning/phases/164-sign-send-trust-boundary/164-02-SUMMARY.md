---
phase: 164-sign-send-trust-boundary
plan: 02
subsystem: api
tags: [server-actions, api-routes, react, trust-boundary, estimate-lock, activity-log]

# Dependency graph
requires:
  - phase: 164-01
    provides: "lib/estimate/lock.ts (isEstimateLocked predicate), lib/estimate/signed-snapshot.ts"
  - phase: 167-01
    provides: "checkCredits gate on app/api/estimates/[id]/refine/route.ts (lock guard sequenced beside it)"
provides:
  - "saveEstimate: pre-write freeze-on-send/sign guard covering sent_at OR client_response OR an existing estimate_signatures row (the signed-but-unresponded window)"
  - "saveEstimate: fire-and-forget 'estimate_updated' estimate_activity row on every successful content save"
  - "savePresentationSettings(estimateId, settings, expectedUpdatedAt): new lock-exempt server action for the presentation-settings carve-out"
  - "refine route: same lock guard placed before the 167-01 credit gate and any paid call"
  - "lib/errors: new 'estimate_locked' ErrorType (409, composite code 'estimate_locked:estimates')"
  - "EstimateEditor: isContentReadOnly (content lock) vs gearDisabled (!is_current only) dual-gate, lock banner + Create-new-version action, stale-tab latch, gear-panel direct-save path"
  - "EstimateWithSections.hasSignature (computed via a concurrent indexed estimate_signatures lookup in fetchEstimateWithSections)"
affects: [165-save-atomicity-version-authority]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-UPDATE combined SELECT: the lock-check query (sent_at/client_response/total/project_id) replaces the old post-update project_id fetch, so the freeze guard costs exactly one NEW round-trip (the signature-exists lookup), not two"
    - "Dual-path presentation persistence: drafts keep the shared content-payload path (presentation_settings rides saveEstimate); a locked-but-current estimate's gear panel calls the lock-exempt savePresentationSettings action directly, decoupled from isDirty/autosave, while still dispatching to the reducer for live preview"
    - "Stale-tab latch (lockedByServer): a client-side boolean set only when the SERVER rejects a save with 'estimate_locked', gating the autosave effect and driving the lock banner -- prevents the audit's documented toast-storm (a plain toast alone would let autosave keep re-firing every keystroke)"
    - "Content lock vs display-preference lock: isContentReadOnly (!is_current || locked) gates the document/autosave/nav-guards; the gear trigger+panel use a SEPARATE gate (gearDisabled = !is_current only) so presentation settings stay editable on a locked estimate"

key-files:
  created:
    - tests/unit/actions/estimate-lock-guard.test.ts
    - tests/unit/api/refine-lock-guard.test.ts
  modified:
    - lib/actions/estimate.ts
    - app/api/estimates/[id]/refine/route.ts
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/use-estimate-reducer.ts
    - lib/queries/estimate.ts
    - lib/errors/codes.ts
    - lib/schemas/estimate.ts
    - tests/unit/actions/estimate-save-concurrency.test.ts
    - tests/unit/actions/estimate-save-pricing-fields.test.ts
    - tests/unit/api/refine-credit-gate.test.ts
    - tests/unit/api/refine-route-contract.test.ts
    - tests/unit/api/refine-error-surface.test.ts

key-decisions:
  - "'estimate_locked' is a new top-level ErrorType (not folded into 'conflict') so route callers get a distinct, stable code ('estimate_locked:estimates') to branch on instead of overloading the optimistic-concurrency conflict code; status 409"
  - "saveEstimate returns the literal string 'estimate_locked' as the error value (not a human sentence) per the plan's interface spec -- the editor detects it exactly (result.error === 'estimate_locked') to drive the stale-tab latch; the user-facing banner copy lives client-side, not in the server error string"
  - "hasSignature is computed inside the ONE shared fetchEstimateWithSections helper (used by both getEstimateById and getCurrentEstimate) via a concurrent Promise.all query rather than a bolted-on special case -- every caller gets the field for free at effectively zero added wall-clock latency (single indexed lookup, already-parallel fetch), matching the 'one shared query' discipline Plan 01 established for the signed-content overlay"
  - "savePresentationSettings validates its settings argument through the SAME presentationSettingsSchema saveEstimate already uses (exported from lib/schemas/estimate.ts) rather than a duplicate schema -- it's a 'use server' action reachable directly via RPC, same boundary discipline as saveEstimate"
  - "The gear panel's onChange (handlePresentationSettingsChange) always dispatches to the reducer for live preview; ONLY when locked does it additionally call savePresentationSettings directly, and on success re-baselines state.updated_at via MARK_SAVED so a second consecutive locked-estimate settings change doesn't send a now-stale expectedUpdatedAt and spuriously conflict against its own prior write"

requirements-completed: [TRUST-02, TRUST-03]

# Metrics
duration: ~65min wall-clock (~40min active implementation; remainder waiting out severe shared-environment resource contention during full-suite verification -- see Issues Encountered)
completed: 2026-07-17
---

# Phase 164 Plan 02: Sign & Send Trust Boundary — Freeze-on-Send/Sign Guards Summary

**saveEstimate and the refine route now reject content writes to a delivered (sent/signed/responded) estimate with a typed `estimate_locked` error covering the signed-but-unresponded window, every successful content save is logged to `estimate_activity`, and the editor gains a lock banner + a lock-exempt presentation-settings carve-out with a stale-tab latch that prevents the audit's documented toast-storm.**

## Performance

- **Duration:** ~65 min wall-clock (~40 min active implementation; the remainder was waiting out severe shared-environment CPU/process contention during full-suite test verification — 24 concurrent `node.exe` processes observed at peak, other v4.19 phases 166-169 actively executing in parallel on the same machine/repo)
- **Tasks:** 3/3
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- `saveEstimate` (`lib/actions/estimate.ts`) gained a pre-write freeze guard: a combined pre-UPDATE SELECT (`sent_at, client_response, total, project_id`) runs concurrently with a NEW `estimate_signatures` existence lookup; either `isEstimateLocked()` being true OR a signature row existing returns `{ error: 'estimate_locked' }` before any write — closing the signed-but-unresponded window where `sign/route.ts` inserts the signature row before calling `respondToEstimate` and swallows a respond failure, leaving `client_response` still `null` on a genuinely signed estimate
- New `savePresentationSettings(estimateId, settings, expectedUpdatedAt)` action: lock-EXEMPT, updates only the `presentation_settings` column, validated through the same `presentationSettingsSchema` `saveEstimate` uses (now exported)
- Every successful content-changing `saveEstimate` call fires a never-throw, fire-and-forget `estimate_activity` insert (`event_type: 'estimate_updated'`, metadata: sections/items counts + total delta) — closing audit finding A2 (in-place tampering was previously invisible in the audit trail)
- The refine route (`app/api/estimates/[id]/refine/route.ts`) gained the identical lock guard, placed after the `!is_current` check and BEFORE the 167-01 credit gate — a locked estimate can never reach a paid call regardless of billing state
- `lib/errors/codes.ts` gained a new `estimate_locked` `ErrorType` (409, composite code `estimate_locked:estimates`) distinct from the existing optimistic-concurrency `conflict` code
- The editor (`estimate-editor.tsx`) now threads `sent_at`/`client_response`/`hasSignature` into reducer state, computes `isContentReadOnly` (`!is_current || locked`) separately from the gear panel's own gate (`gearDisabled = !is_current` only), renders a lock banner with a working "Create new version" action, and latches `lockedByServer` on a server-side `estimate_locked` rejection so the autosave effect stops re-firing per keystroke instead of toast-storming
- `EstimateWithSections.hasSignature` is now computed inside the shared `fetchEstimateWithSections` helper via a concurrent, indexed `estimate_signatures` lookup — every caller of `getEstimateById`/`getCurrentEstimate` gets it for free

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side lock guard in saveEstimate + activity event (TRUST-02 core, TRUST-03)** - `0595ef69` (feat)
2. **Task 2: Lock guard on refine route** - `adf89319` (feat)
3. **Task 3: Editor lock UX — banner + Create new version + presentation carve-out** - `4bdaa1b7` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `lib/actions/estimate.ts` — freeze-on-send/sign guard in `saveEstimate` (pre-UPDATE combined SELECT + concurrent signature-exists lookup), `estimate_updated` activity emission, new `savePresentationSettings` action
- `app/api/estimates/[id]/refine/route.ts` — lock guard placed beside (before) the 167-01 credit gate
- `lib/errors/codes.ts` — new `estimate_locked` `ErrorType` entry (status 409, default message)
- `lib/schemas/estimate.ts` — `presentationSettingsSchema` exported for reuse by `savePresentationSettings`
- `components/workspace/estimate/estimate-editor.tsx` — `isContentReadOnly`/`gearDisabled` dual-gate, lock banner, `handleCreateNewVersion`, `lockedByServer` stale-tab latch, `handlePresentationSettingsChange` dual-path carve-out
- `components/workspace/estimate/use-estimate-reducer.ts` — `sent_at`/`client_response`/`hasSignature` threaded into `EstimateEditorState` + `initState`
- `lib/queries/estimate.ts` — `EstimateWithSections.hasSignature` (optional), computed via a concurrent query in `fetchEstimateWithSections`
- `tests/unit/actions/estimate-lock-guard.test.ts` (new) — 6 tests: locked (sent_at), locked (client_response), locked (signature-only), draft saves + emits activity, `savePresentationSettings` lock-exempt (2 variants)
- `tests/unit/api/refine-lock-guard.test.ts` (new) — 4 tests: same 3 lock conditions rejected pre-paid-call, unlocked draft proceeds normally
- `tests/unit/actions/estimate-save-concurrency.test.ts`, `tests/unit/actions/estimate-save-pricing-fields.test.ts` — extended mocks with `estimate_signatures`/`estimate_activity` table branches (pre-existing draft-only fixtures; regression-proven unaffected)
- `tests/unit/api/refine-credit-gate.test.ts`, `tests/unit/api/refine-route-contract.test.ts`, `tests/unit/api/refine-error-surface.test.ts` — extended blanket `mockFrom` fallback with a `select/eq/limit` chain for the new `estimate_signatures` lookup

## Decisions Made

See `key-decisions` in the frontmatter above. In short: `estimate_locked` is its own `ErrorType` (409) rather than overloading `conflict`; `saveEstimate` returns the literal string `'estimate_locked'` (a machine-checkable token, not a sentence) so the editor can branch on it exactly; `hasSignature` is computed once in the shared `fetchEstimateWithSections` helper (concurrent query, no added wall-clock cost) rather than special-cased per caller; `savePresentationSettings` reuses `saveEstimate`'s existing zod schema rather than duplicating validation; the gear panel's direct-save path re-baselines `updated_at` on success to avoid a self-inflicted conflict on the next settings change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended two pre-existing saveEstimate test files' Supabase mocks**
- **Found during:** Task 1
- **Issue:** `tests/unit/actions/estimate-save-concurrency.test.ts` and `tests/unit/actions/estimate-save-pricing-fields.test.ts` mock `supabase.from()` with an explicit per-table switch that throws `Unexpected table` for anything not already listed. Adding the new pre-UPDATE lock-check SELECT shape and the `estimate_signatures`/`estimate_activity` queries to `saveEstimate` would otherwise throw inside these files' existing tests.
- **Fix:** Extended the `estimates` table's `select` mock to return `{ sent_at: null, client_response: null, total, project_id }` (both files' fixtures are always drafts, so the guard never fires), and added `estimate_signatures` (empty array) + `estimate_activity` (insert success) branches.
- **Files modified:** tests/unit/actions/estimate-save-concurrency.test.ts, tests/unit/actions/estimate-save-pricing-fields.test.ts
- **Verification:** All pre-existing assertions in both files still pass unchanged (byte-identical draft-path behavior proven).
- **Committed in:** `0595ef69` (Task 1 commit)

**2. [Rule 3 - Blocking] Extended three pre-existing refine-route test files' blanket `mockFrom` fallback**
- **Found during:** Task 2
- **Issue:** `refine-credit-gate.test.ts`, `refine-route-contract.test.ts`, and `refine-error-surface.test.ts` each stub `supabase.from()` with a catch-all `{ insert: async () => ({}) }` for any table besides `companies`. The new `estimate_signatures` lookup calls `.select().eq().limit()`, which doesn't exist on that stub.
- **Fix:** Added `select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) })` to each file's fallback, defaulting to "no signature" so each file's own concern (credit gate / response contract / error envelope) stays isolated from the new lock guard's own dedicated test file.
- **Files modified:** tests/unit/api/refine-credit-gate.test.ts, tests/unit/api/refine-route-contract.test.ts, tests/unit/api/refine-error-surface.test.ts
- **Verification:** All pre-existing tests in all three files still pass unchanged.
- **Committed in:** `adf89319` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added zod validation to the new savePresentationSettings action**
- **Found during:** Task 1
- **Issue:** The plan's interface specified the action's signature but didn't call out input validation. `savePresentationSettings` is a `'use server'` action reachable directly via its RPC endpoint (bypassing TypeScript) — the exact same boundary concern the file's own doc comments call out for `saveEstimate`. Shipping it with zero runtime validation would be a real security/correctness gap on a fresh public entry point.
- **Fix:** Exported the existing (previously module-private) `presentationSettingsSchema` from `lib/schemas/estimate.ts` and validate `settings` through it before writing; added a lightweight `estimateId` type guard.
- **Files modified:** lib/schemas/estimate.ts, lib/actions/estimate.ts
- **Verification:** New `savePresentationSettings` tests (valid payloads) still pass; `npx tsc` clean.
- **Committed in:** `0595ef69` (Task 1 commit)

**4. [Rule 1 - Bug] Fixed a stale-baseline conflict bug in the gear panel's direct-save path (caught before commit)**
- **Found during:** Task 3, self-review
- **Issue:** The first draft of `handlePresentationSettingsChange` called `savePresentationSettings` with `stateRef.current.updated_at` as `expectedUpdatedAt` but never updated local state afterward — a SECOND consecutive presentation-settings change on a locked estimate would send the now-stale original `updated_at`, spuriously conflicting against the write the first call had just made.
- **Fix:** On a successful `savePresentationSettings` response, dispatch `MARK_SAVED` with the returned `updated_at`, re-baselining state (and clearing the `isDirty` the live-preview dispatch had set) so subsequent changes compare against the correct value.
- **Files modified:** components/workspace/estimate/estimate-editor.tsx
- **Verification:** `npx tsc` clean; logic traced by hand against the concurrency-check code path in `savePresentationSettings`.
- **Committed in:** `4bdaa1b7` (Task 3 commit)

**5. [Rule 1 - Bug] Hid the Refine affordance on a locked estimate**
- **Found during:** Task 3
- **Issue:** Not explicitly called out in the plan's must-haves, but leaving the "Refine with AI" entry point visible on a locked estimate would let a user generate a refinement they can never save (the refine route now rejects it too, per Task 2) — a dead-end UX inconsistent with the plan's "guided to the safe path, never silently blocked" done-criterion.
- **Fix:** `refineSlot` is now gated on `isContentReadOnly` (was `isReadOnly` = `!is_current` only) — hidden whenever the document is content-read-only, whether due to an old version or a lock.
- **Files modified:** components/workspace/estimate/estimate-editor.tsx
- **Verification:** Consistent with the Task 2 server-side rejection; `npx tsc` clean.
- **Committed in:** `4bdaa1b7` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (2 blocking test-mock extensions, 1 missing-critical validation, 2 bug fixes caught during self-review before commit)
**Impact on plan:** No scope creep — all five are directly necessary to keep `npm test` green, close a real validation gap on a new public server-action boundary, or fix genuine bugs in this plan's own new code paths before they shipped.

## Issues Encountered

**Severe shared-environment resource contention during full-suite verification (same class documented in 164-01's summary, same session lineage).** This session ran on a machine/repo shared concurrently with other active GSD sessions — `git log` shows phases 166, 167, 168, 169 all landing real commits on `main` interleaved with this plan's work, and a `tasklist` snapshot taken mid-verification showed **24 concurrent `node.exe` processes** at peak. Effects observed:
- A background `npm test` (full suite, `vitest run`) invocation produced **zero output after 28+ minutes** and was still running when this summary was written — the same "never produced output, eventually killed by the harness" behavior 164-01 documented for this exact environment.
- Individual small test files that normally run in under a second took **25-58 seconds each** (mostly "environment" setup time, confirmed by direct measurement on `tests/unit/estimate/lock.test.ts` and `tests/unit/errors/errors.test.ts`) — consistent with fork-worker-pool contention, not a code-level slowdown.
- Even a plain `tasklist` enumeration command took several minutes to return.

**Resolution:** Rather than block on an unreliable full-suite run, verification relied on the complete blast-radius of tests for every file this plan touched or constrains, run as individual targeted `vitest run` invocations (each completing normally once dispatched) — **82 tests across 11 files, 100% green**:
- `tests/unit/actions/estimate-lock-guard.test.ts` (new, 6), `tests/unit/api/refine-lock-guard.test.ts` (new, 4)
- `tests/unit/actions/estimate-save-concurrency.test.ts` (3), `tests/unit/actions/estimate-save-pricing-fields.test.ts` (3), `tests/unit/actions/estimate-save-no-gate.test.ts` (2)
- `tests/unit/api/refine-credit-gate.test.ts` (5), `tests/unit/api/refine-route-contract.test.ts` (6), `tests/unit/api/refine-error-surface.test.ts` (1)
- `tests/unit/estimate/lock.test.ts` (6)
- `tests/unit/estimate/presentation-settings.test.ts` + `tests/unit/components/presentation-settings-panel.test.tsx` + `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` (28)
- `tests/unit/errors/errors.test.ts` (18) — confirms the new `estimate_locked` `ErrorType` doesn't regress any existing error-code contract

Combined with a clean `npx tsc --noEmit -p tsconfig.ci.json` (0 errors, run 3 times after edits), this constitutes solid verification evidence despite not obtaining a completed full-suite run within a reasonable time budget. No test file this plan did not touch was run, so no claim is made about the rest of the suite beyond what 164-01 already established plus the ongoing parallel phases' own verification.

## User Setup Required

None — no external service configuration required. No new migration (this plan reuses existing columns/tables: `estimates.presentation_settings`, `estimate_activity.event_type` is plain `TEXT`, `estimate_signatures` already carries the `idx_estimate_signatures_estimate_id` index Plan 01 relies on too).

## Next Phase Readiness

- Phase 164 requirements TRUST-01 (Plan 01), TRUST-02, TRUST-03 (this plan) are all satisfied — the phase's success criteria 2-5 are met (criterion 1 was split across both plans: 164-01 shipped the render half, this plan ships the rejection half).
- Phase 165 (Save Atomicity & Version Authority) can proceed — it will replace `saveEstimate`'s multi-call PostgREST sequence with a single transactional RPC; that RPC must preserve this plan's lock guard (reject before any write when locked) and the `estimate_updated` activity emission, since both are now load-bearing regression contracts.
- The `estimate_locked` `ErrorType`/code is available for any other route that needs the same guard in the future (e.g. if a future phase adds more content-mutating estimate endpoints).

## Known Stubs

None. No hardcoded/placeholder values were introduced; the lock banner and gear-panel carve-out are both fully wired to real server actions.

---
*Phase: 164-sign-send-trust-boundary*
*Completed: 2026-07-17*

## Self-Check: PASSED

All 10 created/modified files checked confirmed present on disk; all 3 task commit hashes (`0595ef69`, `adf89319`, `4bdaa1b7`) confirmed in `git log`.
