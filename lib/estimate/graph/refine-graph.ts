/**
 * lib/estimate/graph/refine-graph.ts
 *
 * buildRefineGraph(adapter, { runner }) — the canonical, channel-neutral REFINE
 * sub-graph factory (Phase 101, HARD-01). Mirrors buildEstimateGraph with a simpler
 * topology dedicated to a single refine pass:
 *
 *   START → ingest → refine → (checkRefined) → finalize | onError → END
 *
 * Durability (DURABLE-02): compiled with a plain `.compile()` taking NO persistence
 * argument (no saver). Per USER DECISION (2026-06-21) refine is a synchronous, non-persisting
 * PREVIEW invoked INLINE with the passthrough StepRunner — never dispatched via
 * Inngest, never checkpointed. The refined preview rides state.refined; the adapter's
 * finalize is a no-op (no DB write) and onError re-throws for the route's asResponse.
 *
 * This file is under lib/estimate/graph/ so it MUST stay channel-neutral — it imports
 * only neutral modules and receives channel behavior via the ChannelAdapter interface.
 */
import { StateGraph, START, END } from '@langchain/langgraph'
import { EstimateState, type EstimateStateType } from './state'
import { passthroughRunner, type ChannelAdapter, type StepRunner } from './types'
import { makeRefineNode } from './nodes/refine'

/**
 * After refine: a failure routes to the terminal onError (adapter re-throws); a
 * success routes to finalize (no-op preview). BOTH conditional targets MUST be in the
 * 3rd-arg array for LangGraph 1.3.x reachability.
 */
function checkRefinedEdge(state: EstimateStateType): string {
  return state.failure ? 'onError' : 'finalize'
}

export function buildRefineGraph(
  adapter: ChannelAdapter,
  { runner = passthroughRunner }: { runner?: StepRunner } = {}
) {
  return new StateGraph(EstimateState)
    .addNode('ingest', (s) => adapter.ingest(s))
    .addNode('refine', makeRefineNode(runner))
    .addNode('finalize', (s) => adapter.finalize(s))
    .addNode('onError', (s) => adapter.onError(s))
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'refine')
    .addConditionalEdges('refine', checkRefinedEdge, ['finalize', 'onError'])
    .addEdge('finalize', END)
    .addEdge('onError', END)
    .compile() // no persistence arg (DURABLE-02) — passthrough/inline-only durability
}
