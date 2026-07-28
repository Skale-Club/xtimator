# Deferred Items — Phase 182

Out-of-scope discoveries logged during execution, per the executor's
deviation Scope Boundary rule (only auto-fix issues directly caused by the
current task's changes).

## Plan 182-04

### `tests/integration/missing-key-ux.test.ts` fails on `unstable_cache` mock — pre-existing, unrelated to this plan

- **Found during:** Task 2 verification (`npx vitest run
  tests/unit/whatsapp/pdf-delivery.test.ts
  tests/unit/estimate/delivery-insert-format.test.ts
  tests/integration/missing-key-ux.test.ts`)
- **Symptom:** `Error: [vitest] No "unstable_cache" export is defined on the
  "next/cache" mock` thrown from `lib/queries/auth.ts:23`
  (`getCachedCompany = unstable_cache(...)`), reached via
  `lib/queries/active-company.ts` → `lib/demo/guard.ts`.
- **Root cause (verified, not caused by 182-04):** `app/api/estimates/[id]/send/route.ts`
  calls `demoGuardResponse()` unconditionally as its FIRST piece of route
  logic (before body parsing, before the Resend-key check, before any
  PDF/resolver code path). `demoGuardResponse` (`lib/demo/guard.ts`)
  imports `getActiveCompanyId` from `lib/queries/active-company.ts` at
  module scope, which imports `unstable_cache` from `next/cache` directly
  (line 4) and re-exports `getCachedCompany` from `lib/queries/auth.ts`
  (also `unstable_cache(...)` at module scope, line 23). The test's
  `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` only stubs
  `revalidatePath`, not `unstable_cache` — so importing the route handler
  at all crashes on this chain, independent of any 182-04 edit.
- **Why out of scope for 182-04:** `demoGuardResponse`'s import and both
  of its call sites in `send/route.ts` are untouched by this plan's Task 2
  diff — the crash occurs before the `attachPdf`/`renderEstimatePdf`
  branch this plan modified is ever reached. Confirmed via `git log`
  that `lib/demo/guard.ts` (Phase "demo Phase 2 read-only enforcement")
  and the `unstable_cache` call in `lib/queries/auth.ts` both predate
  Phase 182 by many commits.
- **Also confirmed non-blocking for CI:** `.github/workflows/test.yml`
  runs `npx vitest run tests/unit tests/eval` only — `tests/integration/`
  is not part of the automated gate, so this test's red state does not
  block deploys.
- **Partial fix applied (in-scope, committed):** added
  `vi.mock('@/components/pdf/estimate-pdf-modern', () => ({ default: () =>
  null }))` to this test file — that specific failure (real
  `estimate-pdf-modern.tsx` loading and crashing on `StyleSheet.create`
  against the test's minimal `@react-pdf/renderer` mock) WAS caused by
  182-04 Task 2 wiring `send/route.ts` through the shared resolver (which
  imports both template components at module scope). After that fix, the
  test still fails on the pre-existing `unstable_cache` issue above.
- **Recommendation:** a future plan touching `lib/demo/guard.ts` or this
  test file should add `unstable_cache: (fn: unknown) => fn` to the
  `next/cache` mock, or mock `@/lib/demo/guard` directly.
- **Action taken:** not fixed (pre-existing, unrelated file's dependency
  chain) — logged here per Scope Boundary rule.
