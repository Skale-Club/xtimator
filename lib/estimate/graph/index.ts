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
 *         → assess → finalize | onError → END
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
import { checkGeneratedEdge } from './nodes/decide'

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
    // Topology.
    .addEdge(START, 'ingest')
    .addConditionalEdges('ingest', checkInputsEdge, ['generate', 'onError'])
    .addConditionalEdges('generate', checkGeneratedEdge, ['assess', 'onError'])
    // finalize reads state.isVague to branch ask-details vs confirm (3-fn
    // adapter surface, D-05); Phase 96 splits a dedicated refine edge.
    .addEdge('assess', 'finalize')
    .addEdge('finalize', END)
    .addEdge('onError', END)

  return graph.compile()
}
