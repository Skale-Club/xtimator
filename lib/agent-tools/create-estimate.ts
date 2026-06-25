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
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'

export async function createEstimate(args: {
  companyId: string
  projectId: string
  prompts?: string[]
  language?: 'en' | 'pt' | 'es'
  channel?: 'web' | 'mcp'
}): Promise<{ jobId: string }> {
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
    id: `estimate-${args.projectId}-${requestId}`,
    data: payload,
  })
  const jobId = ids[0]
  if (!jobId) throw new Error('createEstimate: inngest.send returned no event id')
  return { jobId }
}
