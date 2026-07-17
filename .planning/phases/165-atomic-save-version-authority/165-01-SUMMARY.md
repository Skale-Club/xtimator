---
phase: 165-atomic-save-version-authority
plan: 01
subsystem: database
tags: [postgres, plpgsql, supabase-rpc, zod, estimate-engine, transactions]

# Dependency graph
requires:
  - phase: 164-sign-send-trust-boundary
    provides: "isEstimateLocked predicate + freeze-on-send/sign guard semantics (sent_at/client_response/signature), estimate_updated activity insert pattern, savePresentationSettings lock-exempt carve-out — all absorbed into the RPC's transaction / preserved as-is"
provides:
  - "save_estimate_atomic(...) SECURITY INVOKER plpgsql RPC — one implicit transaction for the entire saveEstimate write set (header compare-and-set, section/item upserts, both orphan-delete passes, project total)"
  - "trg_estimates_set_updated_at BEFORE UPDATE trigger — estimates.updated_at is now DB-authoritative on every update path, not just ones that remember to set it"
  - "saveEstimate rewritten to call the RPC exactly once; returns additive id_map for 165-02's temp-id remap"
  - "zod SAVE-06 bounds (no negative pricing fields; realistic 60x200 section/item caps)"
  - "compute-totals flat tax path now honors per-line taxable (SAVE-07 server half)"
affects: [165-02 (client-side id-map/preview-parity plan, not yet authored), 170-refine-apply-merge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY INVOKER plpgsql RPC for atomic multi-table persistence under RLS (caller's own privileges — no REVOKE-from-authenticated needed, unlike the SECURITY DEFINER credit-ledger template)"
    - "Distinct custom SQLSTATEs (P0001-P0004) per guard, mapped in the calling action via error.code (not error.message) for a reliable typed-error contract through PostgREST/supabase-js"
    - "BEFORE UPDATE trigger as the single source of truth for a version/optimistic-concurrency token column"

key-files:
  created:
    - supabase/migrations/20260717000004_phase165_save_estimate_atomic.sql
    - supabase/migrations/20260717000005_phase165_estimates_updated_at_trigger.sql
    - tests/unit/actions/estimate-atomic-save.test.ts
    - tests/unit/schemas/estimate-bounds.test.ts
    - tests/unit/estimate/compute-totals-taxable-flat.test.ts
  modified:
    - lib/actions/estimate.ts
    - lib/schemas/estimate.ts
    - lib/estimate/compute-totals.ts
    - types/database.types.ts
    - tests/unit/actions/estimate-lock-guard.test.ts
    - tests/unit/actions/estimate-save-concurrency.test.ts
    - tests/unit/actions/estimate-save-pricing-fields.test.ts

key-decisions:
  - "The RPC returns {updated_at, project_total, project_id, previous_total, id_map} — project_id + previous_total replace the pre-UPDATE SELECT this plan removes, since the post-RPC estimate_updated activity insert has a NOT-NULL project_id and needs both for total_delta + revalidatePath (Opus blocker #1)."
  - "Orphan deletes use `id <> ALL(v_incoming_uuid[])`, never `NOT IN (...)` — the empty-array case must delete-all when a kept section/estimate is emptied, matching today's JS exactly (Opus nit #6)."
  - "price_source is resolved in the ACTION (item.isManuallyEdited ? null : price_source) before building the RPC payload — the RPC never sees isManuallyEdited (Opus nit #5)."
  - "Reproduced an undocumented current-code asymmetry exactly: a brand-new section's items get sort_order = their POSITIONAL ARRAY INDEX (ignoring any client-sent item.sort_order); an existing section's items (new or updated) use the client-supplied sort_order verbatim. Found by re-reading lib/actions/estimate.ts:245-253 during Task 2's read_first — not called out in the plan interface, reproduced anyway to satisfy 'reproduce current upsert semantics exactly.'"
  - "GRANT EXECUTE ... TO authenticated (not the credit-ledger template's REVOKE) — this function is SECURITY INVOKER called directly by the authed end user via supabase.rpc, so a REVOKE would make it unreachable."
  - "No real/local Postgres was available in this environment (no Docker, no pglite/testcontainers dep, and DATABASE_URL points at the actual hosted project — not a disposable test DB) — used the plan's documented fallback: a manual-verify note (below) instead of a live integration test."
  - "SAVE-07 marked complete in REQUIREMENTS.md per explicit instruction, but only the SERVER half is actually closed by this plan — see the caveat in REQUIREMENTS.md's SAVE-07 line and 'Known Gaps' below."

requirements-completed: [SAVE-01, SAVE-02, SAVE-06, SAVE-07]

# Metrics
duration: ~50min
completed: 2026-07-17
---

# Phase 165 Plan 01: Atomic Save RPC + Version Authority + SAVE-06/07(server) Summary

**A `save_estimate_atomic` SECURITY INVOKER Postgres RPC now persists the entire saveEstimate write set — header compare-and-set, every section/item upsert, both orphan-delete passes, and the project total — as one atomic transaction, replacing a 6-step non-transactional PostgREST sequence that could leave header totals ≠ items and poison a session with a false "changed elsewhere" conflict after any transient failure.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3/3 completed
- **Files modified:** 12 (2 new migrations, 5 new test files, 5 modified source/test files)

## Accomplishments

- Closed audit findings B1 (non-atomic save), B2 (session-poisoning false conflicts), B3 (silent write to a superseded version), B7 (unbounded/negative pricing inputs), and the server half of B8 (flat-path `taxable` no-op)
- `save_estimate_atomic`: one plpgsql function, `SECURITY INVOKER`, re-checks the freeze-on-send/sign lock + `is_current` + the `updated_at` compare-and-set all INSIDE the same transaction that then does the writes — a RAISE at any guard rolls back everything, so there is no window where a header write can commit without its items (or vice versa)
- `trg_estimates_set_updated_at` (BEFORE UPDATE trigger) makes `updated_at` DB-authoritative for every write path to `estimates`, including `createBlankEstimate`'s supersede flip (`is_current = false`) — a stale tab holding a just-superseded version now fails the optimistic-concurrency check instead of silently writing through
- `saveEstimate` rewritten to a single `supabase.rpc('save_estimate_atomic', ...)` call; verified by grep that its body contains zero `.from('estimates').update` / `.from('estimate_sections')` / `.from('estimate_items')` / `.from('projects').update` calls (the only remaining `.from()` call in its body is the pre-existing fire-and-forget `estimate_activity` audit insert, which is not part of the core write set)
- zod bounds (SAVE-06): `quantity`/`unit_price`/`discount`/`cost`/`markup_pct` reject negatives; `MAX_SECTIONS` 200→60, `MAX_ITEMS_PER_SECTION` 500→200
- `compute-totals`'s flat tax path (SAVE-07 server half) now excludes `taxable === false` lines from the taxable base, with the global discount prorated onto that base — an all-taxable estimate (the default) stays byte-identical

## Task Commits

Each task was committed atomically:

1. **Task 1: updated_at trigger + zod bounds + flat-path taxable** - `7339bfd2` (feat)
2. **Task 2: The atomic RPC migration + regenerate types** - `3c84f9f3` (feat)
3. **Task 3: Rewrite saveEstimate to call the RPC once** - `d6c86b7d` (feat)

_No separate plan-metadata commit yet — this SUMMARY + REQUIREMENTS.md/STATE.md/ROADMAP.md updates land in the final commit below._

## Files Created/Modified

- `supabase/migrations/20260717000004_phase165_save_estimate_atomic.sql` - the atomic RPC (SECURITY INVOKER, plpgsql)
- `supabase/migrations/20260717000005_phase165_estimates_updated_at_trigger.sql` - BEFORE UPDATE trigger on `estimates`
- `lib/actions/estimate.ts` - `saveEstimate` rewritten to call the RPC once; `savePresentationSettings` and every other action untouched
- `lib/schemas/estimate.ts` - SAVE-06 bounds
- `lib/estimate/compute-totals.ts` - SAVE-07 server-half flat-path taxable fix
- `types/database.types.ts` - hand-added `save_estimate_atomic` Functions entry (local migration, not yet applied remotely — generated from the migration file, not a live DB pull, per the plan's explicit instruction)
- `tests/unit/actions/estimate-atomic-save.test.ts` (new) - the RPC-calling contract: happy path, all 4 SQLSTATE mappings, activity-fires-on-success-only
- `tests/unit/schemas/estimate-bounds.test.ts` (new) - SAVE-06 negative-value + cap tests
- `tests/unit/estimate/compute-totals-taxable-flat.test.ts` (new) - SAVE-07 flat-path taxable tests (byte-identical guard + behavior-change proof)
- `tests/unit/actions/estimate-lock-guard.test.ts`, `estimate-save-concurrency.test.ts`, `estimate-save-pricing-fields.test.ts` (rewritten) - these pre-existing tests mocked the OLD per-table write chain (`.from('estimates').update`, etc.) that saveEstimate no longer calls; rewritten to mock `supabase.rpc()` instead, preserving the same behavioral assertions (see Deviations below)

## Decisions Made

- **RPC return shape carries `project_id` + `previous_total`** (not just `updated_at`/`project_total`/`id_map`) so the action's post-RPC `estimate_activity` insert and `revalidatePath` have what they need without a re-fetch — this was a locked Opus plan-check fix, implemented as specified.
- **`<> ALL(array)` for both orphan-delete passes**, never `NOT IN (...)` — verified the empty-array semantics manually (Postgres: `x <> ALL('{}')` is vacuously TRUE for every row, correctly reproducing "delete everything when the incoming set is empty").
- **price_source resolution moved into the action**, computed once when building `calculatedSections`, so the RPC payload always carries the final value and the RPC has no knowledge of `isManuallyEdited`.
- **Reproduced the sort_order asymmetry found in the current JS exactly**: a brand-new section's items get their sort_order from the array's positional index (`section.items.map((item, idx) => ({ sort_order: idx }))` in the pre-165 code), not from `item.sort_order` — while an existing section's items (new or updated within it) use the client-supplied `item.sort_order`. This wasn't called out in the plan interface; found by re-reading the exact current implementation per Task 2's `read_first` instruction and reproduced to honor "reproducing the CURRENT upsert semantics exactly."
- **No live/local Postgres integration test** — see "Manual Verification Needed" below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rewrote 3 pre-existing tests that would have failed after the RPC rewrite**
- **Found during:** Task 3, immediately after rewriting `saveEstimate`
- **Issue:** `tests/unit/actions/estimate-lock-guard.test.ts`, `estimate-save-concurrency.test.ts`, and `estimate-save-pricing-fields.test.ts` all mocked the OLD per-table write sequence (`.from('estimates').update(...)`, `.from('estimate_sections')`, `.from('estimate_items')`, `.from('projects').update`) that `saveEstimate` no longer calls now that it's a single `supabase.rpc(...)` call. Running them post-rewrite produced `TypeError: supabase.rpc is not a function` (10 failures across 3 files) — these tests are not "pre-existing unrelated failures" (out of scope); they are a direct, mechanical consequence of Task 3's mandated rewrite (the plan's own acceptance criteria required removing every one of those calls from `saveEstimate`'s body).
- **Fix:** Rewrote each file's mock to provide `rpc: vi.fn()` alongside `from()`, and reworked the lock/conflict/pricing-field scenarios to drive them via the mocked RPC's response (`{ data, error }` with `error.code` for lock/conflict cases) instead of a pre-UPDATE SELECT payload. Preserved the exact same behavioral assertions each file existed to prove (locked → zero writes; stale `expectedUpdatedAt` → conflict, never touches items; wrong client totals ignored; new pricing fields persisted; retrocompat totals). `savePresentationSettings`'s own test coverage in `estimate-lock-guard.test.ts` was left untouched (that action wasn't rewritten — still calls `.from('estimates').update` directly, confirmed by asserting `rpcImpl` is never called in those specific tests).
- **Files modified:** `tests/unit/actions/estimate-lock-guard.test.ts`, `tests/unit/actions/estimate-save-concurrency.test.ts`, `tests/unit/actions/estimate-save-pricing-fields.test.ts`
- **Verification:** All 3 files green post-rewrite (15 tests); full `tests/unit/actions/` + `tests/unit/estimate/` + `tests/unit/schemas/` run green (206 tests, 25 files) alongside the rest of the suite.
- **Committed in:** `d6c86b7d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — tests broken by the task's own mandated rewrite, not pre-existing/unrelated)
**Impact on plan:** Necessary to keep the test suite green after Task 3; no scope creep — same assertions, different mock surface.

## Issues Encountered

- **Shared-environment git index contention**: this working tree had multiple other GSD phases (166/167/168) executing concurrently and committing in parallel. Twice during this plan's execution, `git add` staged files were found stripped back to unstaged/untracked between commands (my `types/database.types.ts` edit and the new migration file briefly showed as unstaged/`??` after a concurrent commit landed) — the file contents on disk were intact both times; re-staging and committing with an explicit pathspec (`git commit -m "..." -- <files>`) rather than a bare `git commit` resolved it cleanly and kept the commits scoped to only this plan's files. No data was lost; documented here per the same pattern noted in 164-01/164-02's SUMMARY.
- **`npm test` (full suite) is flaky under this concurrent load**, exactly as flagged in the task prompt: a `tests/unit/actions/` + `tests/unit/estimate/` + `tests/unit/schemas/` directory run produced 41 `[vitest-pool]: Failed to start forks worker ... Timeout waiting for worker to respond` errors, but the actual test results underneath were 100% green (25 test files passed, 206 tests passed, 0 failures). A repo-wide `npm test` was also started per the plan's `<verification>` block but — consistent with every prior phase's note in STATE.md documenting this same severe shared-environment contention (concurrent phases 166/167/168/169 all landing commits during this plan's execution) — produced zero output after 20+ minutes and was abandoned as a signal, exactly as 164-02/167-02/168-02 each documented for their own full-suite attempts. The targeted verification suites in the plan's `<verify>` blocks plus the full scoped-directory run above are the reliable signal.

## Manual Verification Needed

The plan calls for "ONE integration test against a real/local PG if available, else a documented manual-verify note" for the RPC's RAISE→`error.code` surfacing (a mocked-`rpc()` unit test proves the *action's* mapping logic, but cannot prove Postgres actually raises SQLSTATEs P0001-P0004 the way the migration's plpgsql expects, or that PostgREST/supabase-js actually surfaces them as `error.code`).

**No local/real Postgres was available in this environment**: no Docker (`supabase start` requires it), no `pglite`/`pg-mem`/`testcontainers` dependency in `package.json`, and the only Postgres reachable via `DATABASE_URL` is the project's actual hosted Supabase instance (confirmed via `scripts/apply-migration-76-01.mjs`'s existing pattern) — not a disposable test database, and this migration has not been applied there yet (it ships via CI→GHCR→Coolify per this repo's convention, never `supabase db push` from a dev machine). Running a live integration test against it was judged out of scope for this plan and unsafe.

**Manual verification steps** (run once this migration has been deployed to a real/staging Postgres — e.g. after CI→GHCR→Coolify, or in a local `supabase start` stack with Docker available):

```sql
-- 1. estimate_not_found (P0004)
SELECT save_estimate_atomic(
  '00000000-0000-0000-0000-000000000000'::uuid, -- nonexistent id
  '<a real company_id>'::uuid, NULL,
  '{"summary":null,"notes":null,"timeline":null,"payment_terms":null,"warranty_terms":null,
    "discount_type":null,"discount_value":0,"discount_amount":0,"estimate_date":null,
    "estimate_number":null,"tax_rate":0,"tax_amount":0,"subtotal":0,"total":0,
    "deposit_type":"none","deposit_value":null,"balance_due":0,"presentation_settings":null}'::jsonb,
  '[]'::jsonb
);
-- Expect: ERROR, SQLSTATE P0004

-- 2. estimate_locked (P0001) — pick a real estimate id with sent_at set (or an
--    estimate_signatures row), run the same call against it. Expect SQLSTATE P0001.

-- 3. estimate_not_current (P0003) — pick a real is_current=false estimate id.
--    Expect SQLSTATE P0003.

-- 4. estimate_conflict (P0002) — pick a real current/unlocked estimate, pass
--    p_expected_updated_at as a timestamp that does NOT match its current updated_at.
--    Expect SQLSTATE P0002.

-- 5. Happy path — pass a real, current, unlocked estimate's id + its actual
--    updated_at as p_expected_updated_at, a valid p_header, and a p_sections
--    array with one temp- section/item. Expect a jsonb result with
--    {updated_at (new, > the one passed), project_total, project_id, previous_total, id_map}
--    where id_map has one entry mapping the temp- ids to new real uuids.
--    Re-SELECT estimate_sections/estimate_items for that estimate to confirm
--    the new rows exist with the persisted values.

-- 6. From the app: call supabase.rpc('save_estimate_atomic', {...}) via the
--    JS client against a case-2/3/4 scenario and confirm error.code is exactly
--    'P0001'/'P0002'/'P0003' (not just a matching message) -- this is the one
--    step a SQL-only check above cannot prove; it exercises the actual
--    PostgREST error-surfacing path supabase-js relies on.
```

## Next Phase Readiness

- The atomic persistence primitive (`save_estimate_atomic`) and version-authority trigger are in place; `saveEstimate` returns `id_map` for **165-02** (not yet authored — "Plans: TBD" in ROADMAP.md) to consume for the client-side temp-id remap (SAVE-03), dirty-epoch reconciliation (SAVE-04), non-destructive conflict UX (SAVE-05), and the editor preview parity that fully closes SAVE-07 (the reducer's own inline flat-tax math in `use-estimate-reducer.ts` is untouched by this plan).
- **estimate_not_current is a NEW error the editor does not yet special-case** — `estimate-editor.tsx`'s `runSave` only branches on `'estimate_locked'` and `'conflict' in result`; an `estimate_not_current` error currently falls through to the generic `toast.error(result.error)` path (showing the raw string, not a friendly message). This is explicitly deferred to 165-02 per the plan interface ("165-02 handles it like a lock") — not a stub in this plan's own scope, but worth flagging so 165-02 doesn't miss it.
- The migration must be deployed (CI→GHCR→Coolify) before `save_estimate_atomic` exists in any real Postgres — until then, calling `saveEstimate` in a live environment will fail with a "function does not exist" PostgREST error. Confirm deployment before or alongside 165-02's rollout.
- SAVE-07 is only HALF closed (server) — see the REQUIREMENTS.md caveat on that line. Full closure needs 165-02's editor-preview fix.

## Self-Check: PASSED

All created files confirmed on disk (`ls`/`test -f`); all 3 task commit hashes (`7339bfd2`, `3c84f9f3`, `d6c86b7d`) confirmed present in `git log --oneline --all`.

---
*Phase: 165-atomic-save-version-authority*
*Completed: 2026-07-17*
