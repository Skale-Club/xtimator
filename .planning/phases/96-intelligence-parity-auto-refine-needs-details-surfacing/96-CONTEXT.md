---
phase: 96
slug: intelligence-parity-auto-refine-needs-details-surfacing
status: draft
created: 2026-06-20
---

# Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing — Context

**Gathered:** 2026-06-20
**Status:** Ready for planning
**Mode:** `--auto` (decisions auto-selected from research defaults; no gray areas left ambiguous)

<domain>
## Phase Boundary

Turn on the real quality intelligence for web and MCP: the shared graph's `assess` node already runs and sets `state.isVague`, but `finalize` is currently a no-op for both channels. Phase 96 adds an `autoRefine` node (shared core) that fires once when `isVague=true` before the human is involved — deletes the $0 estimate, reverts the project, appends a refinement prompt, and re-runs `generate → assess`. If still vague after the one attempt, the graph ends at a typed `needs_details` verdict surfaced per-channel: web persists `projects.status = 'awaiting_details'`; MCP exposes `needsDetails: true` in the job result; WhatsApp's existing inline ask-details flow is preserved unchanged (now driven by the shared `finalize` branching on the same `isVague` state). Multi-tenant isolation (`companyId` as trusted closure parameter) is verified across the new autoRefine surface.

**In scope (REQs):** SMART-01, SMART-02, SMART-03, SMART-04, SMART-05, QA-02.

**Explicitly NOT in this phase:**
- UI component for the `awaiting_details` prompt in the web capture flow → UI-only work, out of scope; backend persists `projects.status = 'awaiting_details'` which the existing status-aware UI can react to
- MCP elicitation or `interrupt()` → explicitly excluded (REQUIREMENTS.md Key Decisions)
- Multiple refine iterations (SMART-01 hard-capped at 1)
- Langfuse observability → Phase 97
- `interrupt()` / blocking job wait → excluded by Key Decisions
</domain>

<decisions>
## Implementation Decisions

### D-01: Graph topology — cap=1 refine loop

Replace the current direct `assess → finalize` edge with a conditional `checkVagueAfterAssessEdge`:

```
assess → checkVagueAfterAssessEdge:
  (!state.isVague)                                    → 'finalize'
  (state.isVague && (state.refineAttempts ?? 0) < 1)  → 'autoRefine'
  (state.isVague && (state.refineAttempts ?? 0) >= 1) → 'finalize'  ← adapter reads isVague=true
```

The loop: `autoRefine → generate → checkGenerated → assess → checkVagueAfterAssessEdge`.
The cap: `refineAttempts` starts at `undefined` (treated as 0); `autoRefine` increments to 1; a second assess hit with `isVague=true` and `refineAttempts=1` routes to `finalize` instead of looping again.

`lib/estimate/graph/index.ts` changes:
- Remove `.addEdge('assess', 'finalize')`
- Add `.addNode('autoRefine', autoRefineNode)`
- Add `.addConditionalEdges('assess', checkVagueAfterAssessEdge, ['finalize', 'autoRefine'])`
- Add `.addEdge('autoRefine', 'generate')`

`checkVagueAfterAssessEdge` lives in `lib/estimate/graph/nodes/decide.ts` alongside `checkGeneratedEdge`.

### D-02: autoRefine node — shared core

New file: `lib/estimate/graph/nodes/auto-refine.ts`.

Responsibilities:
1. Increment `refineAttempts` (undefined → 1).
2. Delete the $0 estimate + revert project to `draft` via shared `revertVagueEstimate` (moved to `lib/estimate/quality/revert.ts` per D-05).
3. Reset `estimateId: undefined` and `isVague: undefined` so the next `generate → assess` cycle starts clean.
4. Append a refinement hint to `prompts`:
   ```
   "Note: the previous estimate was flagged as too vague or incomplete. Please generate a more detailed estimate with specific line items, quantities, material specs, and realistic unit pricing."
   ```
   This increases the likelihood the second pass passes the `isVagueEstimate` gate.

The node uses `requireServiceClient()` for its DB operations (same as `assessNode`). `companyId` comes from `state.companyId` — it is a trusted, validated graph input (the graph's `companyId` field is set from the Inngest event payload, which is populated server-side). No LLM-suppliable override.

### D-03: ChannelAdapter surface — keep 3-fn

`ingest | finalize | onError` is unchanged. No 4th method added. The adapter's `finalize` is the branching point for channel-specific outcome behavior:

- `state.isVague === false` → success path (unchanged: no-op for web/MCP, `sendConfirmation` for WhatsApp)
- `state.isVague === true && (state.refineAttempts ?? 0) >= 1` → needs_details path:
  - **web/MCP** (`default.ts` finalize): persist `awaiting_details`, set `needsDetails: true`
  - **WhatsApp** (`whatsapp.ts` finalize): existing ask-details send (unchanged)
- `state.isVague === true && (state.refineAttempts ?? 0) < 1` → won't reach finalize (D-01 routes to `autoRefine`)

### D-04: State additions

Add one new field to `lib/estimate/graph/state.ts`:

```typescript
needsDetails: Annotation<boolean | undefined>(),
```

`refineAttempts` is already scaffolded (Phase 94). No other state additions needed.

The `needsDetails` field is set by the default adapter's `finalize` (D-06) and flows through as the graph's return value. The Inngest job returns this in its step result; the `/api/jobs/[jobId]` poll returns it in `output`; the client (or MCP LLM) reads `output.needsDetails === true`.

### D-05: revertVagueEstimate relocation

Move `revertVagueEstimate` function from `lib/whatsapp/ask-details.ts` to a new shared file:
`lib/estimate/quality/revert.ts`.

Re-export it from `lib/whatsapp/ask-details.ts` for backward compatibility (existing WhatsApp adapter + tests keep importing from the old path without changes). This keeps `lib/estimate/graph/nodes/auto-refine.ts` channel-neutral (ENGINE-01: no WhatsApp imports in core).

### D-06: Web/MCP `needs_details` surfacing (SMART-03/04)

Default adapter `finalize` (`lib/estimate/adapters/default.ts`) updated:

```typescript
async finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  // Only act on the final-vague path (autoRefine already ran once)
  if (state.isVague && (state.refineAttempts ?? 0) >= 1) {
    // Revert $0 estimate + reset project to draft
    await revertVagueEstimate(supabase, state.projectId, state.estimateId ?? null)
    // Persist the awaiting_details signal for the web UI (SMART-03)
    await supabase
      .from('projects')
      .update({ status: 'awaiting_details' })
      .eq('id', state.projectId)
      .eq('company_id', companyId)
    // Return needsDetails=true so it surfaces in the job output (SMART-04 via poll)
    return { needsDetails: true }
  }
  // Success path — no-op (HTTP/poll layer surfaces the estimate, unchanged)
  return {}
}
```

MCP inherits this automatically (same Inngest job, same graph). No `lib/mcp/tools/write.ts` changes. The calling LLM reads `output.needsDetails === true` from the poll response. SMART-04 satisfied with zero MCP code changes.

### D-07: WhatsApp behavior preserved (SMART-05)

WhatsApp adapter `finalize` (`lib/estimate/adapters/whatsapp.ts`) is **unchanged**. It already branches on `state.isVague`:
- `isVague=true` → `revertVagueEstimate` + `awaiting_details` session insert + send ask-details message
- `isVague=false` → `sendConfirmation`

After Phase 96, the WhatsApp `finalize` is only reached when either:
- `isVague=false` (success path)
- `isVague=true && refineAttempts >= 1` (final-vague path, after 1 auto-refine)

The behavioral net result for WhatsApp: the owner now gets one fewer immediate ask-details message (the auto-refine runs first), but if still vague, they get the same ask-details message as before. **Behavior-equivalent for the happy path; improved for the vague path** (auto-refine may resolve it before involving the human).

### D-08: QA-02 multi-tenant isolation test

New test file: `tests/unit/estimate/auto-refine-isolation.test.ts`.

Mirrors `tests/unit/whatsapp/query-tools.test.ts` pattern:
1. **Test A** — `autoRefineNode` does NOT accept `companyId` as an LLM-suppliable field (source-text anchor: `state.companyId` used directly, never a parameter overrideable by LLM).
2. **Test B** — The default adapter's `finalize` `awaiting_details` write chains `.eq('company_id', companyId)` (closed-over value, not from state inputs).
3. **Test C** — Extend `tests/unit/estimate/graph-neutrality.test.ts` anchor: `lib/estimate/graph/nodes/auto-refine.ts` must contain zero WhatsApp import paths.

Rationale: REQUIREMENTS.md QA-02 explicitly calls for extending the "no tenant input" test to cover the refine surface.

### Claude's Discretion

- Exact wording of the refine prompt appended to `prompts` in the `autoRefine` node.
- Whether `revertVagueEstimate` in the `autoRefine` node swallows errors (recommended: swallow, consistent with WhatsApp adapter pattern where revert is best-effort).
- Whether `checkVagueAfterAssessEdge` is a named export from `decide.ts` or inlined in `index.ts`.
- Whether `tests/unit/estimate/auto-refine-isolation.test.ts` uses source-text anchor pattern (grep file content) or behavioral mocking.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope & decisions
- `.planning/REQUIREMENTS.md` — SMART-01..05, QA-02 (this phase's requirements) + Key Decisions table (auto-refine cap=1, no interrupt(), ChannelAdapter closure-factory, failure-as-state).
- `.planning/ROADMAP.md` — v4.3 block, Phase 96 goal + success criteria.

### Phase 94 + 95 foundation
- `.planning/phases/94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam/94-CONTEXT.md` — D-05 (3-fn adapter surface), ENGINE-01..04 (never-throw, neutrality), DURABLE-01/02 (StepRunner seam, one step.run per graph).
- `.planning/phases/95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough/95-CONTEXT.md` — D-01..07 (current generate-estimate.ts shape, onError re-throw, passthrough finalize).

### Core source files to modify
- `lib/estimate/graph/index.ts` — add `autoRefine` node, replace `assess → finalize` edge with conditional (D-01).
- `lib/estimate/graph/nodes/decide.ts` — add `checkVagueAfterAssessEdge` (D-01).
- `lib/estimate/graph/state.ts` — add `needsDetails` annotation (D-04).
- `lib/estimate/adapters/default.ts` — update `finalize` to handle `awaiting_details` + `needsDetails` (D-06).
- `lib/estimate/quality/vagueness.ts` — ensure `revertVagueEstimate` neighbor file is placed at `lib/estimate/quality/revert.ts` (D-05).

### New files
- `lib/estimate/graph/nodes/auto-refine.ts` — new shared core node (D-02).
- `lib/estimate/quality/revert.ts` — moved `revertVagueEstimate` (D-05).
- `tests/unit/estimate/auto-refine-isolation.test.ts` — QA-02 test (D-08).

### Source files to read (patterns + unchanged)
- `lib/estimate/adapters/whatsapp.ts` — WhatsApp finalize pattern (the existing `isVague` branching that Phase 96 mirrors); UNCHANGED (SMART-05).
- `lib/estimate/graph/nodes/assess.ts` — assess node shape; UNCHANGED.
- `lib/estimate/graph/nodes/generate.ts` — generate node (`makeGenerateNode(runner)`); UNCHANGED.
- `lib/whatsapp/ask-details.ts` — `revertVagueEstimate` source to move + re-export anchor.
- `lib/estimate/quality/vagueness.ts` — neighbor for the new `revert.ts` file.
- `app/api/jobs/[jobId]/route.ts` — confirms `output` of the job is passed through as-is; `needsDetails: true` will appear in `output` automatically.
- `tests/unit/whatsapp/query-tools.test.ts` — pattern for the `makeSupabaseMock` + T-lrf-01 test approach (QA-02 mirrors this).
- `tests/unit/estimate/graph-neutrality.test.ts` — already exists; add `auto-refine.ts` anchor check.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/estimate/quality/vagueness.ts` → `isVagueEstimate(estimate)` — already in the shared core; zero changes needed.
- `lib/whatsapp/ask-details.ts` → `revertVagueEstimate(supabase, projectId, estimateId)` — move to `lib/estimate/quality/revert.ts`, re-export from original path.
- `lib/estimate/graph/nodes/decide.ts` → `checkGeneratedEdge` — pattern to follow for new `checkVagueAfterAssessEdge`.
- `lib/estimate/graph/state.ts` → `refineAttempts: Annotation<number | undefined>()` — already scaffolded; just use it.
- `tests/unit/whatsapp/query-tools.test.ts` → `makeSupabaseMock()` + T-lrf-01 test structure — copy for QA-02.
- `tests/unit/estimate/graph-neutrality.test.ts` → add `auto-refine.ts` to the neutrality anchor check.

### Established Patterns
- **3-fn adapter surface (D-05)**: `finalize` branches internally on `state.isVague` — already in `whatsapp.ts`; replicated in `default.ts`.
- **Never-throw (ENGINE-04)**: `autoRefineNode` must catch errors and return `{ failure: { reason: ... } }` if the DB revert fails catastrophically (though swallowing is preferred — see Claude's Discretion).
- **`requireServiceClient()`** for service-role DB in core nodes (same pattern as `assessNode`).
- **Passthrough `finalize` for web (current Phase 95)**: `async finalize(_state) { return {} }` — Phase 96 adds the conditional body.

### Integration Points
- `lib/estimate/graph/index.ts` — wire the new topology (D-01).
- `lib/estimate/adapters/default.ts` — finalize with `awaiting_details` write (D-06).
- `app/api/jobs/[jobId]/route.ts` — NO change; `output` passes through; `needsDetails: true` in graph result appears in `output` automatically.
- `lib/mcp/tools/write.ts` — NO change (inherits via same Inngest job, same graph).
- `lib/whatsapp/ask-details.ts` — add re-export of moved `revertVagueEstimate`.

</code_context>

<specifics>
## Specific Ideas

- The `refineAttempts` field already exists in `EstimateState` (Phase 94 scaffold comment: "Scaffolded for Phase 96 auto-refine; unused this phase"). This is the exact field to increment in the `autoRefine` node.
- The `checkVagueEdge` function already exists in `lib/estimate/graph/nodes/decide.ts` — it returns `'finalizeAsk' | 'finalizeConfirm'` for a different split. Phase 96 adds a SECOND edge function `checkVagueAfterAssessEdge` that returns `'finalize' | 'autoRefine'` for the cap-guarded split.
- `lib/estimate/graph/index.ts` already has a comment on the `assess → finalize` edge: "finalize reads state.isVague to branch ask-details vs confirm (3-fn adapter surface, D-05); Phase 96 splits a dedicated refine edge." This is the exact change Phase 96 implements.
- `projects.status = 'awaiting_details'` is an existing DB value (used by WhatsApp sessions). The web UI already understands this status — the adapter write is the only server change needed. (No new DB migration required if this enum value already exists in the projects table's status column.)
- The refine instruction appended to `prompts` in `autoRefine` is intentionally GENERIC — it does not reference the specific reasons for vagueness (no LLM-as-judge, per REQUIREMENTS.md Out of Scope). It simply signals "try harder" to the generate step.
</specifics>

<deferred>
## Deferred Ideas

- **Web UI prompt component for `awaiting_details`**: The `projects.status = 'awaiting_details'` write is backend-only this phase. A UI banner/modal to prompt "Your job description was too vague — please add more detail and regenerate" belongs in a separate UI phase.
- **MCP `needsDetails` tool description update**: `lib/mcp/tools/write.ts` could add documentation of the `needsDetails: true` output field for MCP clients. Trivial, deferred to Phase 97 or as a standalone docs task.
- **Langfuse traces per channel** → Phase 97.
- **Full durability granularity** (each AI node = own `step.run`) → deferred per DURABLE-01/02; Phase 97 provides the metrics baseline.
- **Auto-refine for WhatsApp** (currently WhatsApp skips to human-ask immediately if vague): Phase 96 adds one auto-refine BEFORE the WhatsApp ask-details message, because the `autoRefine` node runs in the shared graph. This is an intentional IMPROVEMENT (not a scope creep) — SMART-01 says "the engine" makes one attempt before involving the human. The WhatsApp "finalize" ask-details message is only reached after `refineAttempts >= 1`.
</deferred>

---

*Phase: 96-intelligence-parity-auto-refine-needs-details-surfacing*
*Context gathered: 2026-06-20*
