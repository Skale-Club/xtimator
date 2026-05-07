---
phase: 20-price-book-crud-ui
plan: 01
subsystem: price-book
tags: [data-layer, zod, server-actions, wave-0, tdd-red]
requirements: [PB-01, PB-02, PB-03, PB-04, PB-06, PB-07]
dependency_graph:
  requires:
    - "Phase 19 — company_price_book table + RLS deployed (migration 20260506000001)"
    - "Database types regenerated to include company_price_book"
  provides:
    - "priceBookItemSchema + PriceBookItemFormValues type for Wave 1 forms"
    - "PriceBookItem interface for query result + component props"
    - "getPriceBookItems(supabase, companyId) for the price-book page server component"
    - "createPriceBookItem / updatePriceBookItem / deletePriceBookItem server actions for Wave 1 mutations"
    - "16 RED test stubs (10 list + 6 schema) for Wave 1 to turn GREEN"
  affects:
    - "lib/schemas/, lib/queries/, lib/actions/ — new sibling modules following clients.* templates"
tech_stack:
  added: []
  patterns:
    - "z.coerce.number().min(0) for unit_price (Pitfall 1: HTML number inputs return strings)"
    - ".optional().or(z.literal('')) for optional text fields (client.ts convention)"
    - "Discriminated { error } | { data } returns from server actions (client.ts pattern)"
    - "getAuthContext helper duplicated per-domain (project.ts / client.ts established)"
    - "revalidatePath('/settings/price-book') after each mutation"
    - "expect.fail('not implemented') stubs for Wave 0 RED state (Nyquist compliance)"
key_files:
  created:
    - "tests/unit/price-book/price-book-list.test.tsx"
    - "tests/unit/schemas/price-book.test.ts"
    - "lib/schemas/price-book.ts"
    - "lib/queries/price-book.ts"
    - "lib/actions/price-book.ts"
  modified: []
decisions:
  - "Used z.coerce.number() (not z.number() + valueAsNumber) for unit_price — simplest, no special Input prop needed"
  - "PriceBookItem.category typed as `string` (non-null) despite generated types showing `string | null` — runtime DDL is NOT NULL per migration; types/database.types.ts column nullability is a generator limitation (consistent with Phase 19 SUMMARY note)"
  - "Followed lib/actions/client.ts getAuthContext per-file duplication pattern rather than extracting (consistent with established codebase convention since Phase 03)"
metrics:
  duration: "2min"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  completed_date: "2026-05-07"
---

# Phase 20 Plan 01: Price Book Data Layer + Wave 0 RED Stubs Summary

Established the TypeScript data-layer contracts (zod schema, query function, server actions) and Wave 0 failing test stubs for the `/settings/price-book` UI — Wave 1 components clone the `ClientList` + `ClientSheet` patterns and turn the RED stubs GREEN against this contract.

## Tasks Executed

### Task 1: Wave 0 test stubs (RED) for price-book-list and schema

**Commit:** `955f684`

Created the Wave 0 failing tests:

- `tests/unit/price-book/price-book-list.test.tsx` — 10 `expect.fail('not implemented')` stubs covering empty state (PB-06), category headers (PB-01), alphabetical sorting (PB-01/D-04), search by name (PB-07), search by category (PB-07), no-results state (PB-07), add dialog (PB-02), edit dialog (PB-03), delete AlertDialog (PB-04), and delete confirmation flow (PB-04).
- `tests/unit/schemas/price-book.test.ts` — 6 `expect.fail` stubs covering valid input, missing category, missing name, unit_price coercion, negative unit_price rejection, and optional fields accepting empty strings.

Mocks mirror `tests/unit/clients/client-list.test.tsx` exactly: `next/navigation` (`useRouter` returning `refresh`/`push` stubs, `usePathname` → `/settings/price-book`), `next/link` passthrough anchor, `sonner` toast stubs, `@/lib/actions/price-book` with the three server actions stubbed via `vi.fn()`, and a `@/components/price-book/price-book-item-dialog` stub returning `null` when closed.

The `mockItems` fixture has 3 items spanning 2 categories (Labor: General Labor, Supervisor; Materials: PVC Pipe 2in) with mixed `notes` (one `null`, one populated) to exercise rendering both states. Created `tests/unit/price-book/` directory (did not exist before this plan).

**Verification:** `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` → 16/16 tests fail (RED). Wave 0 RED state confirmed.

### Task 2: Data layer contracts — schema, query, server actions

**Commit:** `b6f3dc6`

Created three sibling modules following the `clients` template:

- `lib/schemas/price-book.ts` — `priceBookItemSchema` (zod) with required `category` and `name` (max 200), `z.coerce.number().min(0)` for `unit_price` (handles HTML number-input strings), and `.optional().or(z.literal(''))` for `unit` and `notes`. Exports `PriceBookItemFormValues` via `z.infer`.
- `lib/queries/price-book.ts` — `PriceBookItem` interface (matches the migration's NOT NULL columns; `unit` and `notes` nullable per DDL) and `getPriceBookItems(supabase, companyId)` ordering by `category` then `name` (D-04).
- `lib/actions/price-book.ts` — `'use server'` module with `getAuthContext` helper (mirrors `lib/actions/client.ts:7`) and three exported server actions. Each action:
  1. Calls `getAuthContext()`, returns `{ error }` discriminated union on failure.
  2. Performs the mutation, returns `{ error }` on Supabase failure with a user-facing message.
  3. Calls `revalidatePath('/settings/price-book')` then returns `{ data }`.

The `update` action does not re-check company ownership beyond the auth scope — RLS subquery on `company_price_book` (Phase 19) enforces `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` at the DB layer, so an unauthorized update returns no rows and surfaces as a Supabase error.

**Verification:** `npx tsc --noEmit | grep price-book` → zero errors in the new files (5 pre-existing `@react-pdf/renderer` errors are out of scope per Scope Boundary rule and unrelated to this plan).

## Deviations from Plan

None — plan executed exactly as written. Templates from `lib/schemas/client.ts`, `lib/queries/clients.ts`, `lib/actions/client.ts`, `tests/unit/clients/client-list.test.tsx`, and `tests/unit/schemas/client.test.ts` were the canonical references and the plan's `<interfaces>` block matched their structure verbatim.

## Pre-Existing Out-of-Scope Findings (Deferred)

`npx tsc --noEmit` surfaces 5 pre-existing TypeScript errors unrelated to Phase 20:

- `app/api/estimates/[id]/pdf/route.ts:2` — `Cannot find module '@react-pdf/renderer'`
- `app/api/estimates/[id]/send/route.ts:3` — same
- `components/pdf/estimate-pdf.tsx:8` — same
- `components/pdf/estimate-pdf.tsx:545` (twice) — implicit `any` for `pageNumber`/`totalPages` destructure params

These are environment/dependency installation issues in `@react-pdf/renderer` types, present on `main` before this plan started. Not addressed here per the Scope Boundary rule (only auto-fix issues directly caused by the current task's changes). Should be triaged separately — likely a `bun install` or `@types/react-pdf` issue introduced outside this milestone.

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Wave 0 RED state | `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` | 16/16 fail (intentional — `expect.fail` stubs) |
| TypeScript clean (new files) | `npx tsc --noEmit \| grep price-book` | 0 errors |
| All artifacts created | filesystem check | 5/5 files exist |

## Wave 1 Handoff

Wave 1 (Plan 20-02) consumes:

- `priceBookItemSchema` + `PriceBookItemFormValues` from `@/lib/schemas/price-book` for the dialog form.
- `PriceBookItem` interface from `@/lib/queries/price-book` for component props (`PriceBookList items={items}`, `PriceBookItemDialog item={item}`).
- The three server actions from `@/lib/actions/price-book` for create/update/delete via `useTransition` + `startTransition`.

Test stubs are wired to the same import paths — Wave 1 implementation replaces each `expect.fail('not implemented')` body with real assertions matching the documented behaviors.

## Self-Check: PASSED

- FOUND: `tests/unit/price-book/price-book-list.test.tsx`
- FOUND: `tests/unit/schemas/price-book.test.ts`
- FOUND: `lib/schemas/price-book.ts`
- FOUND: `lib/queries/price-book.ts`
- FOUND: `lib/actions/price-book.ts`
- FOUND: commit `955f684` (Task 1)
- FOUND: commit `b6f3dc6` (Task 2)
