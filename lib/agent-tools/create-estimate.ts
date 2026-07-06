import 'server-only'
/**
 * lib/agent-tools/create-estimate.ts
 *
 * NEUT-01 — channel-neutral generation dispatch. Mirrors the dispatch body of
 * the MCP create_estimate tool (see lib/mcp/tools/write.ts), parameterized and
 * stripped of any single channel's auth/scope/project-lookup wrapper. Sends
 * EVENT_ESTIMATE_GENERATE exactly once and returns the Inngest event id as
 * { jobId } — every channel (web + MCP today, the in-app chat from Phase 124)
 * ends at the SAME generateEstimateForProject engine via this one event.
 *
 * T-lrf-01: `companyId` is a CLOSURE / trusted param resolved upstream from the
 * owner identity — it is NEVER an LLM tool-input field. The dispatched
 * data.companyId equals exactly the passed companyId; no tenant is ever sourced
 * from untrusted input text.
 *
 * This models the prompt / already-ingested generation path — the
 * EVENT_ESTIMATE_GENERATE path that web + MCP share. The messaging channel's
 * heavier media-ingest CREATE path (processInboundMessages) is separate and
 * stays channel-specific by design — do NOT route it through here.
 *
 * Idempotency: the dispatched event id is channel-namespaced —
 * `estimate-<channel>-<projectId>-<requestId>` when a channel is passed,
 * `estimate-<projectId>-<requestId>` otherwise — so each channel (web/mcp) gets
 * a distinct Inngest dedupe namespace. This is the single justified widening of
 * the neutral fn for Phase 128: `channel` is already a neutral param, so folding
 * it into the id adds no channel-specific token and preserves the neutrality gate.
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'
import { requireServiceClient } from '@/lib/supabase/service'
import { checkCredits } from '@/lib/billing/credit-ledger'
import { recordJobOwnership } from '@/lib/inngest/job-ownership'

/** Thrown by createEstimate when the company's credit balance is spent. */
export const INSUFFICIENT_CREDITS_MESSAGE =
  'Out of AI credits — upgrade or top up at /settings/billing to keep generating estimates.'

export async function createEstimate(args: {
  companyId: string
  projectId: string
  prompts?: string[]
  language?: 'en' | 'pt' | 'es'
  channel?: 'web' | 'mcp'
}): Promise<{ jobId: string }> {
  // Billing v2 credit gate — the SAME wall the web route enforces, applied here
  // so every channel that dispatches through this neutral fn (chat, MCP) is
  // covered. BYOK bypass + the enforcement flag live inside checkCredits.
  const { allowed } = await checkCredits(requireServiceClient(), args.companyId, 1)
  if (!allowed) {
    throw new Error(INSUFFICIENT_CREDITS_MESSAGE)
  }

  const requestId = randomUUID()
  const payload: EstimateGeneratePayload = {
    companyId: args.companyId,
    projectId: args.projectId,
    requestId,
    ...(args.prompts ? { prompts: args.prompts } : {}),
    ...(args.language ? { language: args.language } : {}),
    ...(args.channel ? { channel: args.channel } : {}),
  }
  const { ids } = await inngest.send({
    name: EVENT_ESTIMATE_GENERATE,
    id: `estimate-${args.channel ? `${args.channel}-` : ''}${args.projectId}-${requestId}`,
    data: payload,
  })
  const jobId = ids[0]
  if (!jobId) throw new Error('createEstimate: inngest.send returned no event id')
  // Awaited — see app/api/transcribe/route.ts for why this must not race the
  // client's first poll.
  await recordJobOwnership(jobId, args.companyId)
  return { jobId }
}
