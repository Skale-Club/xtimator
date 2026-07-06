---
phase: quick-260704-slv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/unit/services/generate-estimate.test.ts
  - tests/unit/services/generate-estimate-research.test.ts
  - tests/eval/harness.test.ts
  - tests/eval/price-research-regression.test.ts
  - tests/unit/share-query.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "CI's Typecheck + unit/eval suite job passes on branch dev with 0 test failures"
    - "The 5 named test files exercise the new version-carry-forward query and estimate_photos query against realistic mock chains instead of throwing TypeErrors"
  artifacts:
    - path: "tests/unit/services/generate-estimate.test.ts"
      provides: "estimates table select mock branches on cols to support both version-lookup and id-carry-forward queries"
    - path: "tests/unit/services/generate-estimate-research.test.ts"
      provides: "estimates table select mock branches on cols to support both version-lookup and id-carry-forward queries"
    - path: "tests/eval/harness.test.ts"
      provides: "estimates table select mock adds an id-carry-forward branch alongside the existing estimate_sections branch"
    - path: "tests/eval/price-research-regression.test.ts"
      provides: "estimates table select mock adds an id-carry-forward branch alongside the existing estimate_sections branch"
    - path: "tests/unit/share-query.test.ts"
      provides: "installMock adds an estimate_photos table branch returning a select().eq().order() chain"
  key_links:
    - from: "tests/unit/services/generate-estimate.test.ts (estimates.select mock)"
      to: "lib/services/generate-estimate.ts previousCurrent query (select('id').eq().eq().maybeSingle())"
      via: "mockImplementation branching on cols === 'id'"
      pattern: "cols === 'id'"
    - from: "tests/unit/share-query.test.ts (installMock)"
      to: "lib/queries/estimate-photo.ts getEstimatePhotos (select('sort_order, photo:photos(*)').eq().order())"
      via: "serviceClientMock.from branch for table === 'estimate_photos'"
      pattern: "estimate_photos"
---

<objective>
Fix 27 failing tests across 5 test files in CI (run 28724325069, "Typecheck + unit/eval suite" job on branch dev). Two production features shipped without matching mock updates: (1) a new version-carry-forward query in generate-estimate.ts that runs a second `.eq()` against the `estimates` table mock, which only supports one; (2) share.ts now calling getEstimatePhotos against an `estimate_photos` table that share-query.test.ts's mock has no branch for.

Purpose: Unblock CI on dev — these are stale test mocks, not production bugs. The production code is correct as shipped.
Output: All 5 test files updated with mock chains matching the actual (new) Supabase query shapes; full CI-equivalent gate passes clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Production code these tests mock against — confirmed via Read, unchanged, source of truth for what the mocks must support -->

From lib/services/generate-estimate.ts (lines 405-436), inside the same function, in this order:
```typescript
// 1. Existing REPLACE-BLANK delete
await supabase.from('estimates').delete().eq('project_id', projectId).eq('is_current', true)
  .eq('workflow_status', 'draft').is('summary', null).eq('total', 0)

// 2. NEW — version carry-forward capture (Quick-260704-pt2). Second, distinct select() on 'estimates'.
const { data: previousCurrent } = await supabase
  .from('estimates')
  .select('id')
  .eq('project_id', projectId)
  .eq('is_current', true)
  .maybeSingle()

// 3. Existing — version reset
await supabase.from('estimates').update({ is_current: false }).eq('project_id', projectId)

// 4. Existing — version lookup (select('version').eq().order().limit())
const { data: existingEstimates } = await supabase
  .from('estimates')
  .select('version')
  .eq('project_id', projectId)
  .order('version', { ascending: false })
  .limit(1)

// Later (line 546-547):
if (previousCurrent?.id) {
  await copyEstimatePhotos(supabase, previousCurrent.id, estimateId, companyId)
}
```

From lib/queries/estimate-photo.ts (lines 5-19):
```typescript
export async function getEstimatePhotos(
  supabase: SupabaseClient,
  estimateId: string
): Promise<Photo[]> {
  const { data } = await supabase
    .from('estimate_photos')
    .select('sort_order, photo:photos(*)')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true })
  if (!data) return []
  return data.map((row) => row.photo as unknown as Photo | null).filter((p): p is Photo => p !== null)
}
```
`lib/queries/share.ts` now calls `getEstimatePhotos`, which is why `tests/unit/share-query.test.ts` needs an `estimate_photos` mock branch.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync all 5 stale Supabase test mocks with the new production queries</name>
  <files>tests/unit/services/generate-estimate.test.ts, tests/unit/services/generate-estimate-research.test.ts, tests/eval/harness.test.ts, tests/eval/price-research-regression.test.ts, tests/unit/share-query.test.ts</files>
  <action>
Make ONLY the following mock edits. Do not touch any other file (in particular, leave components/workspace/send/send-dialog.tsx and components/workspace/send/send-form.tsx completely alone — unrelated uncommitted work). Do not touch any production/lib code.

**1. tests/unit/services/generate-estimate.test.ts** (estimates block, currently lines 153-175):
Replace the `select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: ..., limit: ... }) })` for the `estimates` table with a `mockImplementation` that branches on the `cols` argument:
```typescript
select: vi.fn().mockImplementation((cols: string) => {
  if (cols === 'id') {
    return {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }
  }
  return {
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }
}),
```
Keep every other key in the `estimates` mock object (`delete`, `update`, `insert`) unchanged.

**2. tests/unit/services/generate-estimate-research.test.ts** (estimates block, currently lines 168-193):
Apply the identical `select` conversion as above (same cols-branching mockImplementation). Keep `delete`, `update`, `insert` (including the `captured.estimateInsert` capture logic) unchanged.

**3. tests/eval/harness.test.ts** (estimates block, currently lines 193+):
The `select` mock is already a `mockImplementation((cols: string) => {...})` with an `if (cols.includes('estimate_sections'))` branch followed by a fallback return. Add a new sibling branch for `cols === 'id'` before the fallback:
```typescript
select: vi.fn().mockImplementation((cols: string) => {
  if (cols.includes('estimate_sections')) {
    return {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { total: capture.total, sections: capture.sections },
          error: null,
        }),
      }),
    }
  }
  if (cols === 'id') {
    return {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }
  }
  return {
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }
}),
```
Do not alter the `estimate_sections.includes` branch or the final fallback branch — only insert the new `cols === 'id'` branch between them.

**4. tests/eval/price-research-regression.test.ts** (estimates block, currently lines 305-345):
Apply the identical `cols === 'id'` sibling-branch addition as harness.test.ts (same shape: `if (cols.includes('estimate_sections'))` branch stays, new `if (cols === 'id')` branch added before the fallback, fallback unchanged, `insert` with `capture.subtotal`/`capture.total` unchanged).

**5. tests/unit/share-query.test.ts** (`installMock` function, currently lines 23-72):
Add a new branch for `table === 'estimate_photos'` before the final `return { select: vi.fn() }` fallback (line 70):
```typescript
if (table === 'estimate_photos') {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
    })),
  }
}
return { select: vi.fn() }
```
Do not modify the `estimates`, `estimate_sections`, `estimate_items`, `projects`, or `companies` branches.

**Why these fixes are safe:**
- Returning `data: null` for the `previousCurrent` carry-forward query causes `if (previousCurrent?.id)` to be falsy, skipping `copyEstimatePhotos` — no other assertion in these 4 files depends on that call happening.
- Returning `data: []` for `estimate_photos` in share-query.test.ts causes `getEstimatePhotos` to return `[]` — none of the failing `getEstimateByShareToken` tests assert on attached photos, only on estimate/company/project fields.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/services/generate-estimate.test.ts tests/unit/services/generate-estimate-research.test.ts tests/eval/harness.test.ts tests/eval/price-research-regression.test.ts tests/unit/share-query.test.ts</automated>
  </verify>
  <done>All 5 targeted test files pass with 0 failures (27 previously-failing tests now green). Then run the full CI-equivalent gate: `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` — must pass clean with no new regressions, confirming the fix is isolated to stale mocks and no other test relies on the old single-eq() or missing-table mock shapes.</done>
</task>

</tasks>

<verification>
1. `npx vitest run tests/unit/services/generate-estimate.test.ts tests/unit/services/generate-estimate-research.test.ts tests/eval/harness.test.ts tests/eval/price-research-regression.test.ts tests/unit/share-query.test.ts` — 0 failures.
2. `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` — full CI-equivalent gate passes clean.
3. `git diff --stat` shows changes ONLY to the 5 named test files — no production/lib code touched, no changes to components/workspace/send/send-dialog.tsx or send-form.tsx.
</verification>

<success_criteria>
- All 27 previously-failing tests pass.
- Full `tests/unit` + `tests/eval` suite plus typecheck passes with zero failures.
- Only the 5 named test files are modified; production code and the unrelated in-progress send-dialog/send-form changes remain untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/260704-slv-fix-ci-test-failures-sync-supabase-mocks/260704-slv-SUMMARY.md`
</output>
