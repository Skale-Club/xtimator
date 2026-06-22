/**
 * lib/estimate/graph/index.ts
 *
 * buildEstimateGraph(adapter, { runner }) — the canonical, channel-neutral
 * estimate graph factory (Phase 94, ENGINE-01/02, DURABLE-01/02).
 *
 * Composition: the CORE nodes (generate / assess) are channel-agnostic; the
 * per-channel ChannelAdapter supplies the edge nodes (ingest / finalize /
 * onError). The factory wires them into one StateGraph and compiles it.
 *
 * Flow (equivalent to the source WhatsApp graph topology):
 *   START → ingest → (checkInputs) → generate → (checkGenerated)
 *         → assess → (checkVagueAfterAssess) → finalize | autoRefine → onError → END
 *         autoRefine → generate  ← back-edge (cap=1 loop, Phase 96)
 *
 * Durability (DURABLE-02): compiled with a plain `.compile()` taking NO
 * persistence argument. Inngest is the sole durability layer; finer per-node
 * resume is achieved later via the injected StepRunner. See ./CHECKPOINTING.md
 * for the full decision and rationale.
 *
 * StepRunner (DURABLE-01): defaults to passthroughRunner (behavior unchanged
 * today); the generate node wraps its AI call in runner.run('ai-generate', ...).
 */
import { StateGraph, START, END } from '@langchain/langgraph'
import { EstimateState, type EstimateStateType } from './state'
import { passthroughRunner, type ChannelAdapter, type StepRunner } from './types'
import { makeGenerateNode } from './nodes/generate'
import { assessNode } from './nodes/assess'
import { autoRefineNode } from './nodes/auto-refine'
import { checkGeneratedEdge, checkVagueAfterAssessEdge } from './nodes/decide'

/**
 * After ingest: if the adapter could not produce any usable input it sets a
 * `failure?` channel — route to the terminal onError; otherwise generate. This
 * keeps the "has usable input" precondition channel-neutral (the channel-specific
 * detection lives in the adapter's ingest, which writes the failure flag).
 */
function checkInputsEdge(state: EstimateStateType): string {
  return state.failure ? 'onError' : 'generate'
}

export function buildEstimateGraph(
  adapter: ChannelAdapter,
  { runner = passthroughRunner }: { runner?: StepRunner } = {}
) {
  const graph = new StateGraph(EstimateState)
    // Adapter edge nodes (channel-specific behavior is injected here).
    .addNode('ingest', (state) => adapter.ingest(state))
    .addNode('finalize', (state) => adapter.finalize(state))
    .addNode('onError', (state) => adapter.onError(state))
    // Core nodes (channel-neutral).
    .addNode('generate', makeGenerateNode(runner))
    .addNode('assess', assessNode)
    .addNode('autoRefine', autoRefineNode)
    // Topology.
    .addEdge(START, 'ingest')
    .addConditionalEdges('ingest', checkInputsEdge, ['generate', 'onError'])
    .addConditionalEdges('generate', checkGeneratedEdge, ['assess', 'onError'])
    // Phase 96 (D-01): conditional assess edge with cap=1 refine loop.
    // checkVagueAfterAssessEdge routes to autoRefine on first vague result,
    // then to finalize once refineAttempts >= 1. The BOTH targets MUST be
    // listed in the 3rd argument for LangGraph 1.3.6 reachability (Pitfall 1).
    .addConditionalEdges('assess', checkVagueAfterAssessEdge, ['finalize', 'autoRefine'])
    .addEdge('autoRefine', 'generate')
    .addEdge('finalize', END)
    .addEdge('onError', END)

  return graph.compile()
}
