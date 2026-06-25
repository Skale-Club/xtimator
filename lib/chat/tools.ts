/**
 * lib/chat/tools.ts — CHATBE-02 / CHATBE-03 / T-lrf-01
 *
 * Wraps the EIGHT channel-neutral capabilities from `@/lib/agent-tools` as
 * AI-SDK tools for the in-app chat. This file is the CHANNEL ADAPTER — it lives
 * OUTSIDE `lib/agent-tools/` (which stays channel-neutral by the static gate),
 * so importing the neutral barrel here is allowed. NO domain logic is
 * reimplemented; the tools are thin closures over the neutral fns.
 *
 * ───────────────────────── SECURITY: T-lrf-01 ─────────────────────────────────
 * `companyId` and `supabase` are TRUSTED CLOSURE values resolved upstream from
 * the authenticated owner — they are NEVER `inputSchema` fields. The LLM can
 * never choose a tenant. Only the genuine LLM arguments (`projectId`, `name`,
 * `question`, `prompts`) appear in any `inputSchema`. A unit test walks every
 * tool's schema to assert no `companyId`/`company_id`/`tenant` key exists.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * CHATBE-03: the createEstimate tool DISPATCHES the async Inngest job and returns
 * `{ jobId, status: 'queued' }` immediately. It does NOT await generation — the
 * estimate arrives later (surfaced by the Phase-125 UI via polling). The
 * chat↔engine boundary is a tool call, not a streaming bridge.
 *
 * All tools use the AI SDK v6 `inputSchema` field (NOT the v3 `parameters`).
 */
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createEstimate,
  askKnowledge,
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  findServiceByName,
  listRecentEstimates,
  listServices,
} from '@/lib/agent-tools'

export interface ChatToolContext {
  /** Trusted active-company id resolved from the authenticated owner. */
  companyId: string
  /** Service-role Supabase client for the data reads (closure arg, never LLM). */
  supabase: SupabaseClient
  /** Retrieval scope for the knowledge base (the owner's company industries). */
  industries: string[]
  /** Owner's preferred reply language, when known. */
  language?: 'en' | 'pt' | 'es'
}

/**
 * Build the AI-SDK ToolSet for one chat turn, closing over the trusted ctx.
 */
export function buildChatTools(ctx: ChatToolContext) {
  return {
    // CHATBE-03 — async dispatch. Returns the job id immediately; generation
    // runs as an Inngest job (which debits credits per v4.7). Do NOT await it.
    createEstimate: tool({
      description:
        'Start generating a professional estimate for a project. Returns a job id; the estimate is produced asynchronously.',
      inputSchema: z.object({
        projectId: z.string().describe('The project to generate the estimate for'),
        prompts: z
          .array(z.string())
          .optional()
          .describe('Free-form scope notes to guide the estimate'),
      }),
      execute: async ({ projectId, prompts }) => {
        const { jobId } = await createEstimate({
          companyId: ctx.companyId,
          projectId,
          prompts,
          language: ctx.language,
          channel: 'web',
        })
        return { jobId, status: 'queued' as const }
      },
    }),

    askKnowledge: tool({
      description:
        'Answer a trade/how-to question from the industry knowledge base.',
      inputSchema: z.object({
        question: z.string().describe('The trade or how-to question to answer'),
      }),
      execute: async ({ question }) =>
        askKnowledge(question, {
          industries: ctx.industries,
          companyId: ctx.companyId,
          language: ctx.language,
        }),
    }),

    findClientByName: tool({
      description: 'Find a client by (partial) name.',
      inputSchema: z.object({
        name: z.string().describe('Full or partial client name'),
      }),
      execute: async ({ name }) => findClientByName(ctx.companyId, ctx.supabase, name),
    }),

    getLatestEstimateForClient: tool({
      description: "Get the most recent estimate for a client by name.",
      inputSchema: z.object({
        name: z.string().describe('Full or partial client name'),
      }),
      execute: async ({ name }) =>
        getLatestEstimateForClient(ctx.companyId, ctx.supabase, name),
    }),

    getProjectStatus: tool({
      description: 'Get the status and total of a project by name.',
      inputSchema: z.object({
        name: z.string().describe('Full or partial project name'),
      }),
      execute: async ({ name }) => getProjectStatus(ctx.companyId, ctx.supabase, name),
    }),

    findServiceByName: tool({
      description: 'Find a service / price-book item by (partial) name.',
      inputSchema: z.object({
        name: z.string().describe('Full or partial service name'),
      }),
      execute: async ({ name }) => findServiceByName(ctx.companyId, ctx.supabase, name),
    }),

    listRecentEstimates: tool({
      description: "List the company's most recent estimates.",
      inputSchema: z.object({}),
      execute: async () => listRecentEstimates(ctx.companyId, ctx.supabase),
    }),

    listServices: tool({
      description: "List the company's services / price-book items.",
      inputSchema: z.object({}),
      execute: async () => listServices(ctx.companyId, ctx.supabase),
    }),
  }
}
