/**
 * lib/estimate/graph/state.ts
 *
 * Canonical, CHANNEL-NEUTRAL estimate graph state (Phase 94, D-07 / ENGINE-01).
 *
 * This is the single source of truth for the shared estimate domain pipeline.
 * It carries ONLY channel-agnostic fields. All channel-specific concerns
 * (inbound media, per-message fan-out, owner contact, session writes) live in
 * the per-channel adapter, NEVER here. The static neutrality gate
 * (tests/unit/estimate/graph-neutrality.test.ts) enforces this — no
 * channel-specific tokens may appear in this file.
 */
import { Annotation } from '@langchain/langgraph'
import type { FailureReason } from '@/lib/estimate/failure'
import type { EstimateOutput } from '@/lib/ai/types'

export const EstimateState = Annotation.Root({
  /** Trusted tenant scope (never LLM-derived) — used by every DB query filter. */
  companyId: Annotation<string>(),
  /** Target project the estimate is generated against. */
  projectId: Annotation<string>(),
  /** Channel discriminator; threaded into generate-node opts where relevant. */
  channel: Annotation<'whatsapp' | 'web' | 'mcp'>(),
  /** Free-form prompts (web/MCP describe-in-words, text-only inbound). */
  prompts: Annotation<string[] | undefined>(),
  /**
   * auth.users.id of the staff member or owner who triggered generation.
   * Threaded into the generate node → service so it stamps created_by_user_id,
   * which drives "Prepared by" in generated PDFs. Channel-neutral.
   */
  createdByUserId: Annotation<string | undefined>(),
  /** Output of the generate node. */
  estimateId: Annotation<string | undefined>(),
  /** Output of the generate node; used by the adapter for reply copy language. */
  estimateLanguage: Annotation<string | undefined>(),
  /** Output of the assess node (deterministic vagueness gate). */
  isVague: Annotation<boolean | undefined>(),
  /**
   * Server-trusted graph-entry timestamp (epoch ms), set ONCE from the Inngest
   * event handler entry. Replay-safe source for any TTL/expiry computed in a
   * finalize node — never re-mint Date.now() inside a node (HARD-07). On an
   * Inngest retry/replay the value is stable, so the TTL does not drift.
   * Channel-neutral: carries no channel token.
   */
  requestedAt: Annotation<number | undefined>(),
  /**
   * Failure-as-state (ENGINE-04). Core nodes NEVER throw — on failure they set
   * this channel and the adapter's onError maps it to a terminal channel reply.
   * Generalizes the old per-channel generationFailed boolean.
   */
  failure: Annotation<{ reason: FailureReason; detail?: string } | undefined>(),
  /** Scaffolded for Phase 96 auto-refine; unused this phase. */
  refineAttempts: Annotation<number | undefined>(),
  /**
   * Set by default adapter finalize on the final-vague path (Phase 96, D-04).
   * Surfaces in the Inngest job output so MCP/web callers detect needs_details.
   */
  needsDetails: Annotation<boolean | undefined>(),
  /** Refine-only input: the existing estimate being refined (preview, never persisted). */
  existingEstimate: Annotation<EstimateOutput | undefined>(),
  /** Refine-only input: the assembled, sanitized-downstream refine instruction. */
  instruction: Annotation<string | undefined>(),
  /** Refine-only output: the validated refined estimate PREVIEW. No DB write. */
  refined: Annotation<EstimateOutput | undefined>(),
})

export type EstimateStateType = typeof EstimateState.State
