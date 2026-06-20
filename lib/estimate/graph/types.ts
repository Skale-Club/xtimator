/**
 * lib/estimate/graph/types.ts
 *
 * Channel-neutral contracts for the shared estimate graph (Phase 94):
 *   - ChannelAdapter (ENGINE-02): a closure-factory result exposing ONLY the
 *     channel's edge behaviors (ingest / finalize / onError). It captures trusted
 *     scope (companyId, etc.) in its closure — never as a graph-input field —
 *     mirroring the makeQueryTools(companyId, supabase) pattern.
 *   - StepRunner (DURABLE-01): the durability seam. AI-heavy nodes wrap work in
 *     runner.run(name, fn) so it can LATER become an Inngest step.run without the
 *     core importing Inngest. The default passthroughRunner just calls fn().
 *
 * This module MUST stay channel-neutral — it imports nothing from a single
 * channel module (ENGINE-01 static neutrality gate).
 */
import type { EstimateStateType } from './state'

/**
 * Per-channel edge behaviors plugged into the shared graph (D-05).
 *
 * Each fn receives the channel-neutral state and returns a Partial state update,
 * exactly like a LangGraph node. The adapter is the ONLY place channel-specific
 * I/O (media download, sends, sessions, owner contact) is allowed.
 */
export interface ChannelAdapter {
  /** Discriminator; threaded into the generate node opts where relevant. */
  channel: 'whatsapp' | 'web' | 'mcp'

  /**
   * Turn raw channel inputs into persisted recordings/photos so the core's
   * "at least one transcript/photo/prompt" precondition can hold. NEVER throws —
   * failures become state. Web/MCP: passthrough (already ingested upstream).
   */
  ingest(state: EstimateStateType): Promise<Partial<EstimateStateType>>

  /**
   * Deliver the successful result on the channel. Reads state.isVague to branch
   * (e.g. ask-for-details vs confirm). Web/MCP: typically a no-op.
   */
  finalize(state: EstimateStateType): Promise<Partial<EstimateStateType>>

  /**
   * Terminal failure side-effect. Reached when state.failure is set or no usable
   * input exists. The adapter maps the failure to the channel's error reply.
   */
  onError(state: EstimateStateType): Promise<Partial<EstimateStateType>>
}

/**
 * Wrap a unit of work so it can later become an Inngest step.run (DURABLE-01).
 * The core only ever calls this — it never imports Inngest itself.
 */
export interface StepRunner {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>
}

/**
 * Default runner — execute inline, no durability change. Behavior identical to
 * today (the AI call runs exactly once, in-process). Later the Inngest function
 * injects `{ run: (name, fn) => step.run(name, fn) }` for finer resume.
 */
export const passthroughRunner: StepRunner = {
  run: (_name, fn) => fn(),
}
