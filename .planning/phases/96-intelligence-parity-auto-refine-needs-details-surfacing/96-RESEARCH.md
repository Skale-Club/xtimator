# Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing — Research

**Researched:** 2026-06-20
**Domain:** LangGraph back-edge loops, shared estimate graph extension, DB status fields
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Graph topology — cap=1 refine loop**
Replace `.addEdge('assess', 'finalize')` with `checkVagueAfterAssessEdge`:
```
assess → checkVagueAfterAssessEdge:
  (!state.isVague)                                    → 'finalize'
  (state.isVague && (state.refineAttempts ?? 0) < 1)  → 'autoRefine'
  (state.isVague && (state.refineAttempts ?? 0) >= 1) → 'finalize'
```
Loop: `autoRefine → generate → checkGenerated → assess → checkVagueAfterAssessEdge`. `checkVagueAfterAssessEdge` in `lib/estimate/graph/nodes/decide.ts`.

**D-02: autoRefine node — shared core**
New file: `lib/estimate/graph/nodes/auto-refine.ts`.
1. Increment `refineAttempts` (undefined → 1).
2. Delete $0 estimate + revert project to `draft` via shared `revertVagueEstimate` (moved to `lib/estimate/quality/revert.ts` per D-05).
3. Reset `estimateId: undefined` and `isVague: undefined`.
4. Append refinement hint to `prompts`.
Uses `requireServiceClient()`. `companyId` from `state.companyId` (trusted closure input to graph).

**D-03: ChannelAdapter surface — keep 3-fn**
`ingest | finalize | onError` unchanged. `finalize` is the branching point:
- `isVague === false` → success (no-op for web/MCP, sendConfirmation for WhatsApp)
- `isVague === true && refineAttempts >= 1` → needs_details path (web/MCP: persist `awaiting_details`, set `needsDetails: true`; WhatsApp: existing ask-details)
- `isVague === true && refineAttempts < 1` → won't reach finalize (D-01 routes to `autoRefine`)

**D-04: State additions**
Add one field to `lib/estimate/graph/state.ts`:
```typescript
needsDetails: Annotation<boolean | undefined>(),
```
`refineAttempts` already scaffolded (Phase 94).

**D-05: revertVagueEstimate relocation**
Move from `lib/whatsapp/ask-details.ts` → `lib/estimate/quality/revert.ts`.
Re-export from `lib/whatsapp/ask-details.ts` for backward compatibility.

**D-06: Web/MCP needs_details surfacing (SMART-03/04)**
Default adapter `finalize` updated to handle vague-after-refine path:
persist `awaiting_details` to projects, return `{ needsDetails: true }`.
MCP inherits automatically — no `lib/mcp/tools/write.ts` changes needed.

**D-07: WhatsApp behavior preserved (SMART-05)**
WhatsApp adapter `finalize` is UNCHANGED. After Phase 96, it is reached only after `refineAttempts >= 1` (or success). The one auto-refine now runs before the human is asked.

**D-08: QA-02 multi-tenant isolation test**
New file: `tests/unit/estimate/auto-refine-isolation.test.ts`.
Tests A (no LLM-suppliable companyId), B (`.eq('company_id', companyId)` uses closed-over value), C (extend graph-neutrality.test.ts to include auto-refine.ts).

### Claude's Discretion
- Exact wording of the refinement prompt appended to `prompts`.
- Whether `revertVagueEstimate` in `autoRefine` swallows errors (recommended: swallow).
- Whether `checkVagueAfterAssessEdge` is a named export from `decide.ts` or inlined in `index.ts`.
- Whether `auto-refine-isolation.test.ts` uses source-text anchor pattern or behavioral mocking.

### Deferred Ideas (OUT OF SCOPE)
- Web UI prompt component for `awaiting_details` (backend-only this phase).
- MCP `needsDetails` tool description update (`lib/mcp/tools/write.ts` docs) — Phase 97 or standalone.
- Langfuse traces per channel — Phase 97.
- Full durability granularity (each AI node = own `step.run`) — Phase 97.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMART-01 | Engine makes exactly ONE auto-refine attempt when vague (hard cap=1) | D-01 topology confirmed compilable (verified live); `refineAttempts` already scaffolded in state.ts |
| SMART-02 | Quota charged only for delivered estimate, not per internal attempt | Current `recordUsage` call is AFTER `step.run('orchestrate-estimate')` returns — the graph result is what's returned; the charge fires once regardless of how many AI calls ran inside the graph |
| SMART-03 | Web surfaces `needs_details` as persisted `projects.status = 'awaiting_details'` | `projects.status` is plain TEXT with no CHECK constraint — no migration needed |
| SMART-04 | MCP surfaces `needs_details` as structured status in job poll result | `/api/jobs/[jobId]` returns `run.output` as-is when `state: 'completed'`; `needsDetails: true` will appear in `output` automatically |
| SMART-05 | WhatsApp's existing ask-details behavior preserved | WhatsApp adapter `finalize` unchanged; behavior improved (auto-refine runs first) |
| QA-02 | Multi-tenant isolation preserved across new autoRefine surface | `makeSupabaseMock` + T-lrf-01 pattern already in `query-tools.test.ts`; mirror exactly for new test file |
</phase_requirements>

---

## Summary

Phase 96 extends the shared estimate graph with a cap=1 evaluator-optimizer loop. The core change is replacing the direct `assess → finalize` edge with a conditional edge that routes to a new `autoRefine` node when `isVague=true` and `refineAttempts < 1`. The `autoRefine` node then routes BACK to `generate`, completing a loop. After one failed refinement, the graph proceeds to `finalize` with `isVague=true && refineAttempts >= 1`, and the adapter handles the channel-appropriate `needs_details` outcome.

The implementation is well-scoped: all decisions are locked in CONTEXT.md, the scaffolding for `refineAttempts` is already in place, `revertVagueEstimate` already exists and only needs to move, and the `projects.status` field requires no migration (it is unconstrained TEXT). The `autoRefine → generate` back-edge is a valid LangGraph `StateGraph` pattern — confirmed by live runtime test against LangGraph 1.3.6.

**Primary recommendation:** Follow CONTEXT.md decisions verbatim. The only non-trivial implementation decision is whether `autoRefine` swallows its DB-revert errors (recommended: yes, swallow — best-effort revert, consistent with WhatsApp adapter pattern). Use Wave 0 (RED stubs) before Wave 1 (production code) per Phase 94/95 pattern.

---

## Standard Stack

### Core (unchanged — inherited from Phases 94/95)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | 1.3.6 (installed) | Graph topology with cycles | Already in use; back-edges supported |
| `vitest` | 4.1.4 (installed) | Unit test framework | Project standard; RED/GREEN wave pattern |
| `@supabase/supabase-js` | (installed) | DB writes in autoRefine + default adapter | Service-role pattern already established |

### No New Dependencies
Phase 96 introduces zero new npm packages. All required tools are already installed.

---

## Architecture Patterns

### Graph Topology — The Loop

The Phase 96 graph topology verified to compile and execute correctly against LangGraph 1.3.6:

```
START → ingest → (checkInputsEdge) → generate → (checkGeneratedEdge)
      → assess → (checkVagueAfterAssessEdge)
            [isVague=false]   → finalize → END
            [vague, attempts<1] → autoRefine → generate  ← BACK-EDGE (loop)
            [vague, attempts>=1] → finalize → END
      onError → END
```

**Key verified fact:** `addConditionalEdges('assess', fn, ['finalize', 'autoRefine'])` combined with `addEdge('autoRefine', 'generate')` compiles successfully and executes the loop. LangGraph 1.3.6 supports this pattern natively. The loop terminates because `refineAttempts` increments to 1 on the first pass through `autoRefine`, and the conditional edge then routes to `finalize` instead of back to `autoRefine`.

### Changes to `lib/estimate/graph/index.ts`

Three changes only:
1. Remove `.addEdge('assess', 'finalize')`
2. Add `.addNode('autoRefine', autoRefineNode)`
3. Add `.addConditionalEdges('assess', checkVagueAfterAssessEdge, ['finalize', 'autoRefine'])`
4. Add `.addEdge('autoRefine', 'generate')`

The comment already on line 57 (`// Phase 96 splits a dedicated refine edge`) is the exact anchor for where to make the change.

### New Node: `lib/estimate/graph/nodes/auto-refine.ts`

```typescript
// Source: CONTEXT.md D-02
import { requireServiceClient } from '@/lib/supabase/service'
import { revertVagueEstimate } from '@/lib/estimate/quality/revert'
import type { EstimateStateType } from '../state'

const REFINE_HINT =
  'Note: the previous estimate was flagged as too vague or incomplete. ' +
  'Please generate a more detailed estimate with specific line items, ' +
  'quantities, material specs, and realistic unit pricing.'

export const autoRefineNode = async (
  state: EstimateStateType
): Promise<Partial<EstimateStateType>> => {
  const supabase = requireServiceClient()
  // Best-effort revert — swallow errors (consistent with WhatsApp adapter pattern).
  try {
    await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
  } catch {
    // non-fatal
  }
  return {
    refineAttempts: (state.refineAttempts ?? 0) + 1,
    estimateId: undefined,
    isVague: undefined,
    prompts: [...(state.prompts ?? []), REFINE_HINT],
  }
}
```

### Conditional Edge: `checkVagueAfterAssessEdge`

```typescript
// In lib/estimate/graph/nodes/decide.ts (alongside checkGeneratedEdge)
export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < 1) return 'autoRefine'
  return 'finalize'
}
```

### File: `lib/estimate/quality/revert.ts` (moved from ask-details.ts)

The `revertVagueEstimate` function body is identical — only location changes. Re-export from `lib/whatsapp/ask-details.ts` keeps backward compatibility for WhatsApp adapter and existing tests.

### Default Adapter `finalize` Update

```typescript
// lib/estimate/adapters/default.ts — Phase 96 adds body to the previously no-op finalize
async finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  if (state.isVague && (state.refineAttempts ?? 0) >= 1) {
    const supabase = /* from closure */
    await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
    await supabase
      .from('projects')
      .update({ status: 'awaiting_details' })
      .eq('id', state.projectId)
      .eq('company_id', companyId)  // companyId from closure, NOT state
    return { needsDetails: true }
  }
  return {}
}
```

The factory signature `makeDefaultAdapter({ companyId, supabase })` already captures both values in the closure — no signature change needed.

### Recommended Project Structure Changes

```
lib/estimate/
├── graph/
│   ├── index.ts              # MODIFY: topology wiring
│   ├── state.ts              # MODIFY: add needsDetails field
│   └── nodes/
│       ├── decide.ts         # MODIFY: add checkVagueAfterAssessEdge
│       └── auto-refine.ts    # NEW
├── adapters/
│   └── default.ts            # MODIFY: finalize body
└── quality/
    ├── vagueness.ts           # UNCHANGED
    └── revert.ts              # NEW (moved from lib/whatsapp/ask-details.ts)

lib/whatsapp/
└── ask-details.ts             # MODIFY: add re-export of revertVagueEstimate

tests/unit/estimate/
├── graph-neutrality.test.ts   # MODIFY: add auto-refine.ts to anchor check
└── auto-refine-isolation.test.ts  # NEW (QA-02)
```

### Anti-Patterns to Avoid

- **Import `revertVagueEstimate` from `lib/whatsapp/ask-details` in the auto-refine node.** The ENGINE-01 neutrality gate forbids `lib/whatsapp/*` in core. The function must be imported from `lib/estimate/quality/revert.ts`.
- **Pass `companyId` as a graph state field in the default adapter's finalize.** It must come from the closure (`_args.companyId`), not `state.companyId`. Confirmed by D-06 and QA-02.
- **Add a 4th method to ChannelAdapter.** D-03 explicitly locks the surface at 3 functions.
- **Use `addEdge('assess', 'autoRefine')` without conditional logic.** The edge must be conditional (`checkVagueAfterAssessEdge`) to enforce the cap and handle the non-vague path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph cycle / back-edge | Custom retry wrapper outside graph | `addEdge('autoRefine', 'generate')` in StateGraph | LangGraph 1.3.6 natively supports back-edges via `addConditionalEdges` + `addEdge`; verified compilable |
| Estimate vagueness gate | Re-implement scoring logic | `isVagueEstimate` from `lib/estimate/quality/vagueness.ts` | Already extracted to shared core in Phase 94; ENGINE-03 |
| DB revert of $0 estimate | Inline delete + project update | `revertVagueEstimate` (moving to `lib/estimate/quality/revert.ts`) | Already tested via WhatsApp path; cascade deletes sections/items |
| Multi-tenant query isolation | Re-design | `.eq('company_id', companyId)` from closure | Established pattern from Phase 94 (makeQueryTools / T-lrf-01) |

---

## Common Pitfalls

### Pitfall 1: Back-Edge Requires the Loop Node to Be Reachable
**What goes wrong:** Calling `g.addEdge('autoRefine', 'generate')` without `autoRefine` being reachable from START causes LangGraph to throw "Node `autoRefine` is not reachable" at compile time.
**Why it happens:** LangGraph validates graph reachability at `compile()`. Nodes only listed in `addEdge()` targets but never as sources of `addConditionalEdges` are flagged.
**How to avoid:** `autoRefine` must appear as a target in `addConditionalEdges('assess', ..., ['finalize', 'autoRefine'])` AND as a source in `addEdge('autoRefine', 'generate')`. Order does not matter for compilation.
**Verified:** Live test against LangGraph 1.3.6 confirms the topology compiles successfully.

### Pitfall 2: `projects.status` — No DB Migration Needed
**What goes wrong:** Planning a migration for `awaiting_details` on the `projects` table.
**Why it happens:** `whatsapp_sessions.state` DID require a migration (20260529000002) to add `awaiting_details` to its CHECK constraint. It is easy to assume the same applies to `projects.status`.
**How to avoid:** `projects.status` is defined as `TEXT NOT NULL DEFAULT 'draft'` with **no CHECK constraint** in the initial schema migration. Any string value can be written. No migration needed for Phase 96.

### Pitfall 3: ENGINE-01 Neutrality — `auto-refine.ts` Must Not Import from `lib/whatsapp/*`
**What goes wrong:** Importing `revertVagueEstimate` directly from `lib/whatsapp/ask-details.ts` in `auto-refine.ts`.
**Why it happens:** It is the current home of the function; Phase 96 moves it.
**How to avoid:** D-05 explicitly moves it to `lib/estimate/quality/revert.ts`. The autoRefine node imports from there. The `graph-neutrality.test.ts` anchor check will catch any violation statically.
**Warning signs:** TypeScript compiles but `graph-neutrality.test.ts` goes RED.

### Pitfall 4: `recordUsage` Is Already Correctly Scoped — No Change Needed
**What goes wrong:** Moving `recordUsage` inside the graph step thinking it should only charge once per delivered estimate, not per AI call.
**Why it happens:** SMART-02 says "quota is charged only for a delivered estimate, not per internal attempt." This might suggest `recordUsage` placement needs to change.
**How to avoid:** The current Inngest job calls `recordUsage` in `step.run('record-usage')` AFTER `step.run('orchestrate-estimate')` returns. The graph (including any auto-refine) completes entirely inside `orchestrate-estimate`. `recordUsage` fires once after the whole graph finishes — whether 1 or 2 AI calls ran inside. SMART-02 is already satisfied by the current structure. No changes to `generate-estimate.ts` quota logic.

### Pitfall 5: WhatsApp `finalize` — Now Reached Only After `refineAttempts >= 1`
**What goes wrong:** Assuming WhatsApp behavior is identical to before.
**Why it happens:** SMART-05 says "preserve WhatsApp's existing behavior," which might be read as "no behavioral change."
**How to avoid:** The behavioral NET EFFECT changes slightly: WhatsApp jobs where the estimate is vague now run one auto-refine pass before `finalize` sends the ask-details message. This is an INTENTIONAL improvement per CONTEXT.md Deferred Ideas (explicitly called out: "not a scope creep — SMART-01 says the engine makes one attempt before involving the human"). The ask-details message is preserved; it just fires one iteration later.

### Pitfall 6: `needsDetails` in Job Poll — No MCP Code Changes Needed
**What goes wrong:** Planning changes to `lib/mcp/tools/write.ts` to expose `needsDetails`.
**Why it happens:** SMART-04 requires MCP to surface `needsDetails`, so it seems like the MCP tool needs updating.
**How to avoid:** `/api/jobs/[jobId]/route.ts` returns `{ state: 'completed', output: run.output ?? null }` where `run.output` is the raw Inngest function return value. The Inngest job returns `result` from `graph.invoke(...)`. When the graph returns `{ needsDetails: true }` from the default adapter's `finalize`, that field appears in `result` and therefore in `output`. MCP callers already read this poll response. Zero MCP code changes needed. SMART-04 satisfied automatically.

### Pitfall 7: QA-01 Frozen Test — `revertVagueEstimate` Mock Path Changes
**What goes wrong:** `tests/unit/whatsapp/never-reply-regression.test.ts` currently mocks `revertVagueEstimate` from `@/lib/whatsapp/ask-details`. After D-05 moves the function, the mock must continue to work.
**Why it happens:** D-05 adds a re-export from `lib/whatsapp/ask-details.ts`. If the re-export is via `export { revertVagueEstimate } from '@/lib/estimate/quality/revert'`, the mock at `@/lib/whatsapp/ask-details` stays valid because vi.mock intercepts the entire module.
**How to avoid:** The existing QA-01 test mocks `@/lib/whatsapp/ask-details` and spreads `...actual` (only overriding `revertVagueEstimate`). As long as the re-export is in place (D-05), this mock remains fully functional with no changes to the test.

---

## Code Examples

### Verified: LangGraph 1.3.6 Back-Edge Loop

```typescript
// Source: Live verification against LangGraph 1.3.6 installed in this repo
// Pattern: autoRefine → generate back-edge in StateGraph
const g = new StateGraph(TestState)
g.addNode('generate', generateNode)
g.addNode('assess', assessNode)
g.addNode('autoRefine', autoRefineNode)
g.addNode('finalize', finalizeNode)

// The critical conditional edge — MUST list all possible targets as 3rd arg
g.addConditionalEdges('assess', checkVagueAfterAssessEdge, ['finalize', 'autoRefine'])
// The back-edge: autoRefine feeds back into generate
g.addEdge('autoRefine', 'generate')
// This topology compiles successfully — verified.
const compiled = g.compile()  // ✓ No error
```

### Verified: `projects.status` Accepts `awaiting_details` Without Migration

```sql
-- From supabase/migrations/20260409000001_initial_schema.sql line 60:
-- status TEXT NOT NULL DEFAULT 'draft'
-- No CHECK constraint — any TEXT value is valid including 'awaiting_details'
```

```typescript
// Safe to write in default adapter finalize:
await supabase
  .from('projects')
  .update({ status: 'awaiting_details' })
  .eq('id', state.projectId)
  .eq('company_id', companyId)  // companyId from closure
```

### QA-02 Test Pattern (mirroring T-lrf-01)

```typescript
// Source: tests/unit/whatsapp/query-tools.test.ts — mirror this pattern
// Test A: source-text anchor — no LLM-suppliable companyId field
it('autoRefineNode uses state.companyId directly (not overrideable parameter)', () => {
  const src = readFileSync(resolve(ROOT, 'lib/estimate/graph/nodes/auto-refine.ts'), 'utf8')
  // companyId must come from state, not a function parameter
  expect(src).toContain('state.companyId')
  expect(src).not.toMatch(/function.*companyId|companyId.*=.*params|companyId.*input/)
})

// Test B: behavioral — awaiting_details write uses closure-captured companyId
it('default adapter finalize awaiting_details write chains .eq(company_id, closureValue)', () => {
  // Use makeSupabaseMock pattern to capture .eq('company_id', ...) calls
  // and verify it matches the closure-captured value, not state.companyId
})

// Test C: extend graph-neutrality.test.ts
// Add 'lib/estimate/graph/nodes/auto-refine.ts' to REQUIRED_CORE_FILES
// and ensure it has no lib/whatsapp/* references
```

### Graph Invocation — needsDetails Flows Through Automatically

```typescript
// lib/inngest/functions/generate-estimate.ts (NO CHANGES NEEDED)
const result = await step.run('orchestrate-estimate', async () => {
  const graph = buildEstimateGraph(adapter)
  return graph.invoke({ companyId, projectId, channel: 'web', ... })
})
// result will be { needsDetails: true, ... } when vague after refine
// Inngest stores result as run.output
// /api/jobs/[jobId] returns { state: 'completed', output: run.output }
// Polling client reads output.needsDetails === true — SMART-04 satisfied
return result  // line 185 of generate-estimate.ts — unchanged
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WhatsApp-only vagueness gate | Shared `isVagueEstimate` in core | Phase 94 | All channels have quality detection |
| Direct `assess → finalize` | Conditional with autoRefine loop | Phase 96 | One automatic self-refine attempt |
| WhatsApp-only ask-details revert | Shared `revertVagueEstimate` in `lib/estimate/quality/` | Phase 96 | Core node can revert without channel import |
| Web/MCP passthrough finalize | Default adapter finalize handles needs_details | Phase 96 | Web persists status, MCP exposes needsDetails |

---

## Open Questions

1. **Refinement prompt wording (Claude's Discretion)**
   - What we know: Must be generic (no LLM-as-judge per REQUIREMENTS.md); signals "try harder" to generate node
   - What's unclear: Exact wording; should it mention specific failure reasons or stay fully generic?
   - Recommendation: Use the literal from CONTEXT.md D-02 as the default — it is already approved language

2. **autoRefine error handling (Claude's Discretion)**
   - What we know: `revertVagueEstimate` is best-effort in WhatsApp adapter (catch-and-continue)
   - What's unclear: Whether a completely failed revert should set `state.failure` or swallow
   - Recommendation: Swallow (consistent with WhatsApp pattern; a failed revert is non-fatal — the generate loop can still run without the revert completing)

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — this is a pure code/graph extension phase; no new services, no new CLIs, no new databases).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/estimate/` |
| Full suite command | `npx vitest run tests/unit/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMART-01 | autoRefine fires exactly once when vague; second vague result routes to finalize | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 |
| SMART-02 | recordUsage unchanged — fires after graph completes, not per AI call | unit (implicit — existing generate-estimate coverage) | `npx vitest run tests/unit/estimate/` | ✅ (no new test needed) |
| SMART-03 | default adapter finalize writes `awaiting_details` to projects on vague+refineAttempts>=1 | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 |
| SMART-04 | `needsDetails: true` appears in graph return value | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 |
| SMART-05 | WhatsApp QA-01 still passes (never-throw/always-reply) | unit (frozen) | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ (must stay GREEN) |
| QA-02 | Multi-tenant isolation in autoRefine + default adapter finalize | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 |
| ENGINE-01 | auto-refine.ts has no WhatsApp imports | unit (static anchor) | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/estimate/`
- **Per wave merge:** `npx vitest run tests/unit/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/estimate/auto-refine-isolation.test.ts` — covers SMART-01, SMART-03, SMART-04, QA-02 (Tests A, B, C from D-08)
- [ ] Extend `tests/unit/estimate/graph-neutrality.test.ts` — add `lib/estimate/graph/nodes/auto-refine.ts` to `REQUIRED_CORE_FILES` and neutrality scan

---

## Runtime State Inventory

This section is omitted — Phase 96 is not a rename/refactor/migration phase. No stored data, live service config, OS registrations, secrets, or build artifacts reference symbols being renamed or moved (the `revertVagueEstimate` move adds a re-export that preserves the old import path; nothing downstream breaks).

---

## Sources

### Primary (HIGH confidence)
- Live runtime test: LangGraph 1.3.6 installed at `node_modules/@langchain/langgraph` — back-edge topology compiled and invoked successfully
- `supabase/migrations/20260409000001_initial_schema.sql` — confirmed `projects.status` is unconstrained TEXT, no migration needed
- `lib/estimate/graph/index.ts` — confirmed current topology and the Phase 96 comment placeholder on `assess → finalize`
- `lib/estimate/graph/state.ts` — confirmed `refineAttempts` scaffolded, `needsDetails` absent (to be added)
- `lib/estimate/graph/nodes/decide.ts` — confirmed `checkGeneratedEdge` pattern to follow; `checkVagueEdge` (different split) already exists
- `lib/estimate/adapters/default.ts` — confirmed no-op finalize, factory signature `{ companyId, supabase }`
- `lib/estimate/adapters/whatsapp.ts` — confirmed `isVague` branching in finalize, `revertVagueEstimate` import path
- `lib/whatsapp/ask-details.ts` — confirmed `revertVagueEstimate` function body to move
- `app/api/jobs/[jobId]/route.ts` — confirmed `run.output` pass-through in completed state (SMART-04 automatic)
- `lib/inngest/functions/generate-estimate.ts` — confirmed `recordUsage` fires after graph returns (SMART-02 already satisfied); confirmed `return result` on line 185 passes graph output through
- `tests/unit/estimate/graph-neutrality.test.ts` — confirmed REQUIRED_CORE_FILES and FORBIDDEN token scan pattern
- `tests/unit/whatsapp/query-tools.test.ts` — confirmed `makeSupabaseMock` + T-lrf-01 test pattern for QA-02 to mirror

### Secondary (MEDIUM confidence)
- `supabase/migrations/20260529000002_whatsapp_sessions_awaiting_details.sql` — confirmed `awaiting_details` exists only on `whatsapp_sessions.state`, not `projects.status`

---

## Metadata

**Confidence breakdown:**
- Graph topology (loop support): HIGH — verified live against installed LangGraph 1.3.6
- DB migration requirements: HIGH — read actual migration SQL; no CHECK constraint on projects.status
- Test patterns: HIGH — read source files for all referenced test patterns
- SMART-02 quota scoping: HIGH — traced code path in generate-estimate.ts confirming recordUsage placement
- SMART-04 MCP surfacing: HIGH — traced route.ts code path confirming output pass-through

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (LangGraph API stable; DB schema stable)
