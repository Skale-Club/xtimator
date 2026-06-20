# Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 96-intelligence-parity-auto-refine-needs-details-surfacing
**Mode:** `--auto` (gray areas auto-resolved using research defaults; no interactive questions)
**Areas discussed:** Graph topology, autoRefine placement, ChannelAdapter surface, web needs_details surfacing, revertVagueEstimate relocation, QA-02 isolation coverage

---

## Graph topology — cap=1 refine loop

| Option | Description | Selected |
|--------|-------------|----------|
| Loop via conditional edge (`assess → autoRefine → generate`) | Leverages LangGraph's native conditional edge routing; `refineAttempts` counter caps the loop; clean and extensible | ✓ |
| Linear (hardcoded 2-pass: `assess → autoRefine → generate2 → assess2 → finalize`) | No loop, explicit nodes; avoids any concern about runaway loops | |
| Adapter-level refine (finalize does the refine internally) | Keeps graph topology unchanged; adapter becomes complex with internal AI call | |

**Auto-selected:** Loop via conditional edge.
**Rationale:** `refineAttempts` is already scaffolded in state explicitly for Phase 96. The loop-with-counter pattern is the idiomatic LangGraph approach and directly matches SMART-01's "exactly ONE automatic self-refine attempt." The graph comment in `index.ts` already says "Phase 96 splits a dedicated refine edge."

---

## autoRefine node placement — shared core vs adapter

| Option | Description | Selected |
|--------|-------------|----------|
| Shared core node (`lib/estimate/graph/nodes/auto-refine.ts`) | Channel-neutral: re-prompting logic applies equally to all channels; adapter finalize still handles channel-specific outcome | ✓ |
| Adapter method (each adapter implements its own refine) | Flexible per-channel; but duplicates logic; WhatsApp doesn't need a refine (it just asks the human) | |

**Auto-selected:** Shared core node.
**Rationale:** The re-prompt instruction ("previous estimate was vague, be more specific") is inherently channel-neutral. WhatsApp will also benefit — after Phase 96, WhatsApp users get one automatic self-refine before being asked for details (net improvement). Having it in the core ensures all channels get the same quality benefit without adapter duplication.

---

## ChannelAdapter surface — keep 3-fn vs expand

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 3-fn (`ingest / finalize / onError`), `finalize` branches internally | Zero adapter interface change; WhatsApp adapter unchanged; backward-compatible | ✓ |
| Expand to 4-fn (`ingest / finalizeOk / finalizeNeeds / onError`) | Cleaner separation; but breaks all existing adapters; Phase 94's D-05 decision was explicit | |

**Auto-selected:** Keep 3-fn.
**Rationale:** D-05 (locked in Phase 94) explicitly chose the 3-fn surface because "Phase 96 splits a dedicated refine edge" — i.e., the branching happens in the GRAPH (via `checkVagueAfterAssessEdge`), not by expanding the adapter surface. The adapter's `finalize` continues to receive the full state (including `isVague` and `refineAttempts`) and branches internally.

---

## Web needs_details surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| `projects.status = 'awaiting_details'` write + `needsDetails: true` in state | Persists signal for page reload; explicit state field for poll output | ✓ |
| `projects.status = 'awaiting_details'` only (no state field) | Simpler; but poll output contains no explicit `needs_details` signal for MCP LLM | |
| State field only (`needsDetails: true`) | Ephemeral (lost on restart); doesn't persist for web UI between sessions | |

**Auto-selected:** Both `projects.status` write AND explicit `needsDetails: true` state field.
**Rationale:** SMART-03 needs persistence (web UI shows prompt on next load). SMART-04 needs the state field in the job output (MCP LLM reads it from poll response). Both are required; neither alone is sufficient.

---

## revertVagueEstimate relocation

| Option | Description | Selected |
|--------|-------------|----------|
| Move to `lib/estimate/quality/revert.ts`, re-export from `lib/whatsapp/ask-details.ts` | Core stays channel-neutral (ENGINE-01); existing WhatsApp imports unchanged | ✓ |
| Re-implement inline in `auto-refine.ts` | Avoids a new file; but duplicates logic + drift risk | |
| Import from `lib/whatsapp/ask-details.ts` in core node | Violates ENGINE-01 neutrality invariant — WhatsApp import in core | |

**Auto-selected:** Move + re-export.
**Rationale:** ENGINE-01 is the neutrality invariant that drives the entire extraction. `graph-neutrality.test.ts` will catch any WhatsApp import in core nodes. The move is minimal (single function, well-defined, already tested via existing WhatsApp tests that will continue importing from the re-export path).

---

## QA-02 isolation test coverage

| Option | Description | Selected |
|--------|-------------|----------|
| New `tests/unit/estimate/auto-refine-isolation.test.ts` + extend `graph-neutrality.test.ts` | Dedicated test file mirrors `query-tools.test.ts` pattern; covers both node and adapter | ✓ |
| Extend `tests/unit/whatsapp/query-tools.test.ts` directly | Puts estimate-core tests in a whatsapp directory — wrong home | |
| Source-text anchor only (no behavioral test) | Cheaper; but misses the runtime isolation guarantee | |

**Auto-selected:** New dedicated file + extend neutrality test.
**Rationale:** REQUIREMENTS.md QA-02 explicitly says "extend the existing `query-tools` 'no tenant input' test to cover the refine surface." The same pattern (makeSupabaseMock + eq('company_id', ...) capture) is the right approach. The file belongs in `tests/unit/estimate/` not `tests/unit/whatsapp/` because `autoRefine` is a core estimate-domain node.

---

## Claude's Discretion

- Exact wording of the refine prompt in `autoRefine` node.
- Whether `revertVagueEstimate` in `autoRefine` swallows errors or propagates failure-as-state.
- Whether `checkVagueAfterAssessEdge` is a named export or an arrow function in `index.ts`.
- Whether QA-02 uses source-text anchors or behavioral mocking (or both).

## Deferred Ideas

- Web UI `awaiting_details` prompt component — backend-only this phase.
- MCP tool description update for `needsDetails` field — post-Phase 97 doc task.
- Langfuse traces per channel — Phase 97.
