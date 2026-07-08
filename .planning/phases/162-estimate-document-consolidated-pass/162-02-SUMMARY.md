---
phase: 162-estimate-document-consolidated-pass
plan: 02
subsystem: workspace-editor

tags: [client-picker, docux, consolidation, tdd, wave-1, popover, cmdk]

# Dependency graph
requires:
  - phase: 162-estimate-document-consolidated-pass
    provides: "9 it.todo scaffolds in tests/unit/clients/client-picker.test.tsx (162-01), turned RED then GREEN here"
provides:
  - "components/clients/client-picker.tsx — the ONE consolidated ClientPicker (4 variants: card / button / inline / billTo) with a first-class Unlink footer; the load-bearing contract 162-03 consumes via variant=\"billTo\""
  - "DocumentClient.id: string — the interface widening that unblocks 162-03's Bill To pencil affordance (Unlink action needs the currently-linked client id)"
  - "DOCUX-03 grep gate green — zero external references to LinkClientInline / LinkClientButton / LinkClientCard remain outside components/clients/client-picker.tsx"
affects: [162-03-bill-to-and-inline-project-name, 162-04-gear-and-settings-panel, 162-05-mobile-line-item-parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consolidated component with a discriminated `variant` prop union — variants are enumerated in the type; no arbitrary render-prop escape hatches (PITFALLS.md #4). New capabilities land as first-class props with their own tests."
    - "cmdk `shouldFilter={false}` + owner-side substring filter — the legacy pickers all shared a latent bug (cmdk's built-in filter runs over `value={c.id}` (a UUID) which clobbers name/email search); the consolidated picker owns filtering and turns cmdk's off."
    - "TDD RED-then-GREEN with test-todo conversion — inherited scaffold's 9 it.todo entries were rewritten as real RTL assertions on the failing tree (RED commit), then made green in the same session by landing the component (GREEN commit)."

key-files:
  created:
    - components/clients/client-picker.tsx
  modified:
    - tests/unit/clients/client-picker.test.tsx
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/overview-tab.tsx
    - components/workspace/client-tab.tsx
    - components/share/estimate-view.tsx
    - lib/queries/share.ts
    - .planning/phases/162-estimate-document-consolidated-pass/deferred-items.md
  deleted:
    - components/workspace/link-client-button.tsx
    - components/workspace/link-client-card.tsx

key-decisions:
  - "cmdk `shouldFilter={false}` on the consolidated picker — the plan's skeleton left cmdk's default filter enabled, but with `value={c.id}` a UUID-based match against the search string would clobber the visible list. Auto-fixed as Rule 1 (latent bug the three legacy pickers all shared, unnoticed because their test coverage never exercised typed search)."
  - "Extended DocumentClient with `id: string` (not `id: string | null`) even though the share renderer doesn't display it — widening surfaces every call site that was silently omitting the id (share-page mapping + share.ts type + share.ts Supabase select). The type discipline forces the plumbing to be complete before 162-03 lands."
  - "Deleted the three legacy pickers outright (no re-export shims) — Q2 of 162-RESEARCH.md's PITFALLS analysis says shims just delay cleanup. Grep gate green with zero external references."

patterns-established:
  - "`variant: 'card' | 'button' | 'inline' | 'billTo'` as the enumeration point for the four call sites — new variants land in the union, never as a per-call-site escape hatch."
  - "`shouldFilter={false}` + owner-side manual filter as the correct cmdk pattern when items carry non-searchable value props (like UUIDs)."

requirements-completed: [DOCUX-02, DOCUX-03]

# Metrics
duration: 20min
completed: 2026-07-08
---

# Phase 162 Plan 02: Consolidated ClientPicker Summary

**ONE `<ClientPicker>` (four variants + first-class Unlink) replaces LinkClientInline / LinkClientButton / LinkClientCard; DOCUX-03 grep gate green; DocumentClient widened with `id: string` and plumbed end-to-end so the 162-03 Bill To pencil affordance can wire an in-canvas Unlink action against the currently-linked client.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-08T16:03:25-04:00
- **Completed:** 2026-07-08T16:22:55-04:00
- **Tasks:** 3 (plus one RED-phase test commit for TDD sequencing = 4 code commits)
- **Files created:** 2 (`components/clients/client-picker.tsx`, `.planning/.../deferred-items.md`)
- **Files modified:** 5 (call sites + share/query type widening + test suite conversion)
- **Files deleted:** 2 (both legacy pickers, no shims)

## Accomplishments

- **The consolidated ClientPicker exists** with all 4 variants (`card`, `button`, `inline`, `billTo`) wired to the existing `linkProjectToClient` / `unlinkProjectFromClient` server actions and a first-class Unlink footer that only renders when `currentClientId !== null`. The three legacy pickers had no unlink at all — `unlinkProjectFromClient` was uncalled in production; this consolidation makes it live.
- **All 9 client-picker tests are real (not `.todo`) and green** — the 162-01 scaffold's `it.todo` markers were rewritten as full RTL assertions in the RED commit (`86558729`), then the component landed in the GREEN commit (`9b869ea9`) to satisfy them all. Assertions cover: 4 variant DOM shapes, the link server-action dispatch, the conditional unlink footer visibility + call, the case-insensitive name/email substring search, and the `CommandEmpty` render for an empty client list.
- **`DocumentClient.id: string` widened end-to-end** through 4 seams: the interface itself (`estimate-document.tsx`), the editor's project mapping (`overview-tab.tsx`), the share-view's client mapping (`estimate-view.tsx`), and the share query's type + both Supabase select strings (`lib/queries/share.ts`). Zero non-test tsc errors post-change (identical to baseline).
- **All 3 external call sites swapped** to `<ClientPicker variant="…">`: `overview-tab.tsx` (button, floating pill slot), `client-tab.tsx` (card, no-client empty state), and the estimate-document inline block (retired — the `variant="inline"` will be wired by 162-03 in the same file's Bill To section).
- **Both legacy files deleted** (`link-client-button.tsx`, `link-client-card.tsx`) with no re-export shims. The dead inline `LinkClientInline` + `ClientSearchList` + `ClientSearchItem` block inside `estimate-document.tsx` was purged in the same atomic edit; 6 orphaned imports were removed (UserPlus, the entire `Command*` family, `useTransition`, `useRouter`, `toast`, `linkProjectToClient`).
- **DOCUX-03 grep gate green:** `grep -rE 'LinkClientInline|LinkClientButton|LinkClientCard' components/ app/ lib/ | grep -v 'client-picker.tsx'` returns zero hits.

## Task Commits

1. **Task 1 RED — failing tests for consolidated ClientPicker** — `86558729` (test)
2. **Task 1 GREEN — implement consolidated ClientPicker (DOCUX-03)** — `9b869ea9` (feat)
3. **Task 2 — extend DocumentClient with id + plumb through call sites** — `8c32b95f` (feat)
4. **Task 3 — swap 3 call sites to ClientPicker + delete legacy pickers** — `d5868c03` (refactor)

## Files Created/Modified

- `components/clients/client-picker.tsx` (created) — the ONE consolidated picker (~245 lines): 4 variants + shared `Popover` / `Command` internals + a first-class Unlink footer + `linkProjectToClient` / `unlinkProjectFromClient` dispatch via `useTransition` + optimistic `toast.success` + `router.refresh()` after success. `shouldFilter={false}` on `Command` because the internal `ClientList` does its own name/email substring filter (see Decisions).
- `tests/unit/clients/client-picker.test.tsx` (modified) — 9 `it.todo` scaffolds turned into 9 real `it(...)` tests covering variant DOM, link/unlink server-action dispatch, unlink-footer conditional visibility, case-insensitive search, and `CommandEmpty`.
- `components/workspace/estimate/estimate-document.tsx` (modified) — (a) `DocumentClient` widened with `id: string` as the first field; (b) the dead LinkClientInline + ClientSearchList + ClientSearchItem block (was L1335-L1415) fully removed; (c) 6 orphaned imports purged.
- `components/workspace/overview-tab.tsx` (modified) — `LinkClientButton` import + JSX swapped to `<ClientPicker variant="button">`; `id: project.client.id` added to the client mapping.
- `components/workspace/client-tab.tsx` (modified) — `LinkClientCard` import + JSX swapped to `<ClientPicker variant="card">`.
- `components/share/estimate-view.tsx` (modified) — `documentClient` mapping extended with `id: client.id`.
- `lib/queries/share.ts` (modified) — `ShareEstimateData.client` type + both `clientRaw` type assertions extended with `id: string`; both Supabase select strings extended to include `id` from the `clients` join.
- `components/workspace/link-client-button.tsx` (deleted) — no shim.
- `components/workspace/link-client-card.tsx` (deleted) — no shim.
- `.planning/phases/162-estimate-document-consolidated-pass/deferred-items.md` (created) — records out-of-scope failures found during the full unit-test regression sweep (see Deferred Issues).

## Decisions Made

- **`shouldFilter={false}` on the consolidated picker's cmdk `Command`.** The plan's skeleton left cmdk's default filter enabled while binding `value={c.id}` on each item. cmdk substring-matches search against the item's `value` prop — with UUID ids, typing "brav" wouldn't match Bravo's id → cmdk would hide the row even though our owner-side filter passed it through. All three legacy pickers shared this latent bug (unnoticed because their test coverage never exercised typed search). We own the filter now via `ClientList`'s manual name/email substring match, so cmdk's is turned off.
- **`id: string` (required), not `id?: string | null`.** The share renderer doesn't display the client id, but the shared `DocumentClient` interface makes the field mandatory so every construction site is surfaced by the typechecker. This forced the ShareEstimateData query to select `id` and forced the mapping to pass it — the plumbing is complete before 162-03 wires the Bill To pencil.
- **Deleted the legacy files outright, no re-export shims.** Q2 of 162-RESEARCH.md's PITFALLS analysis argued shims just delay cleanup. The DOCUX-03 grep gate is a hard invariant — a shim would satisfy imports but leave the retired names in `grep`, muddying the acceptance signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Added `shouldFilter={false}` to cmdk `Command`.**
- **Found during:** Task 1 test writing (test 8 — search filter by name)
- **Issue:** The plan skeleton's `<CommandItem key={c.id} value={c.id}>` binds a UUID as cmdk's search key. cmdk's built-in filter substring-matches the input value against `value` — typing "brav" wouldn't match Bravo's UUID, so cmdk would hide Bravo even though our owner-side filter passes it through. The three legacy pickers shared this latent bug (unnoticed because their test coverage never exercised typed search).
- **Fix:** Added `shouldFilter={false}` to the `<Command>` wrapper. Our `ClientList` component's manual name/email substring filter is now the ONE filter authority.
- **Files modified:** `components/clients/client-picker.tsx`
- **Commit:** `9b869ea9`

**2. [Rule 3 — Blocking] React 19 removed the global `JSX` namespace.**
- **Found during:** Task 2 `npx tsc --noEmit` verification.
- **Issue:** The plan skeleton's `JSX.Element` return-type annotation errors under React 19 (`Cannot find namespace 'JSX'`).
- **Fix:** Switched to `React.JSX.Element` and added `import * as React from 'react'`. Same runtime shape, just the type reference that React 19 exposes.
- **Files modified:** `components/clients/client-picker.tsx`
- **Commit:** `8c32b95f`

**3. [Rule 2 — Missing critical functionality] Widened `ShareEstimateData.client` type and both `clientRaw` type assertions in `lib/queries/share.ts`.**
- **Found during:** Task 2 `npx tsc --noEmit` verification.
- **Issue:** The `DocumentClient` widening surfaced two mismatches in `lib/queries/share.ts` (lines 269, 452 — `client` field of the returned object). The share query was selecting fields WITHOUT `id` and the typed `clientRaw` assertion didn't include it either. Without this, the share renderer would fail to construct a `DocumentClient` literal at type-check time.
- **Fix:** Added `id: string` to `ShareEstimateData.client`, added `id` to both `clientRaw` type assertions, and updated both Supabase select strings to include `id` from the `clients` join. This is the same discipline as Phase 161-02's `stateToDocumentData` widening pass — each surfaced error was a hidden regression the loose typing was masking.
- **Files modified:** `lib/queries/share.ts`
- **Commit:** `8c32b95f`

**4. [Rule 2 — Missing critical functionality] Purged 6 additional orphaned imports from `estimate-document.tsx`.**
- **Found during:** Task 3 (post-purge grep audit for the plan's own `useUnusedLocals` sweep).
- **Issue:** After deleting `LinkClientInline` + `ClientSearchList` + `ClientSearchItem`, the plan called out `UserPlus`, `Command*`, and `linkProjectToClient` as candidates for removal. The audit surfaced 3 additional orphans: `useTransition`, `useRouter`, and `toast` were only used by the deleted code.
- **Fix:** Removed all 6 orphaned imports in Task 3's atomic edit.
- **Files modified:** `components/workspace/estimate/estimate-document.tsx`
- **Commit:** `d5868c03`

### Note on grep-gate comment scrubs

Two follow-up edits scrubbed literal substrings from developer comments so the grep gates hit zero:
- The initial `ClientPicker` comment mentioned "no `renderTrigger` escape hatch" — `renderTrigger` was substring-matched by the anti-escape-hatch grep even inside comments. Rephrased to "no arbitrary render-prop escape hatches".
- The initial dead-code purge marker inside `estimate-document.tsx` referenced `LinkClientInline` by name — which hit the DOCUX-03 grep gate. Rephrased to describe the inline "no client linked" popover implementation without the literal name.

No test-file content or component behavior was changed — these were prose-only scrubs to align with the plan's literal-substring grep gates.

## Issues Encountered

**None that impacted the plan.** Full unit-test regression sweep post-Task 3 surfaced 4 pre-existing test failures — none introduced by 162-02:

- `tests/unit/ci/warning-regressions.test.ts > gives every dialog an accessible description` — pre-existing failure in `components/workspace/project-workspace.tsx` (unrelated to 162-02). Verified failing on the pre-162-02 tree via `git stash && npx vitest run ...`. Logged to `deferred-items.md`.
- 3 known Windows parallel-import flakes (`cleanup-route-auth`, `empty-output-guards`, `transcribe-fallback`) that pass in isolation. Documented at the v4.11 milestone ship-notes and reproduced here on the pre-162-02 tree. Logged to `deferred-items.md`.

Gitleaks pre-commit clean on all 4 commits.

## Deferred Issues

None specific to the plan's scope. Two pre-existing issues (dialog-description miss + Windows parallel-import flakes) are logged in `.planning/phases/162-estimate-document-consolidated-pass/deferred-items.md` for whichever future plan touches those surfaces.

## User Setup Required

None — no external service configuration required. The consolidated ClientPicker uses the existing `/api/clients` route + the existing `linkProjectToClient` / `unlinkProjectFromClient` server actions, all in production.

## Next Phase Readiness

- **162-03 (Bill To pencil + InlineProjectName underline)** can now start:
  - The `variant="billTo"` trigger is landed and tested (opacity-0 → group-hover:opacity-100 pattern).
  - `DocumentClient.id` is available end-to-end so the Bill To pencil can pass `currentClientId={client.id}` and the Unlink footer will render.
  - The `document-bill-to.test.tsx` scaffold's 7 `it.todo`s stay untouched (belong to 162-03).
- **162-04 (Gear + settings panel)** unaffected by 162-02 — its `it.todo`s in `estimate-floating-actions.test.tsx` + `presentation-settings-panel.test.tsx` remain intact.
- **162-05 (Mobile line-item)** unaffected — its `mobile-line-item.test.tsx` `it.todo`s are untouched.

## Self-Check: PASSED

- `components/clients/client-picker.tsx` verified on disk.
- Both legacy files verified absent (`components/workspace/link-client-button.tsx`, `components/workspace/link-client-card.tsx`).
- All 4 task commits verified in `git log`: `86558729` (test), `9b869ea9` (feat), `8c32b95f` (feat), `d5868c03` (refactor).
- DOCUX-03 grep gate: 0 hits.
- `npx tsc --noEmit`: 0 non-test errors (identical to baseline).
- `npx vitest run tests/unit/clients/client-picker.test.tsx`: 9/9 GREEN.

---
*Phase: 162-estimate-document-consolidated-pass*
*Completed: 2026-07-08*
