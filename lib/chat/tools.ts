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
  createPriceBookService,
  addCompanyKnowledge,
  createProject,
} from '@/lib/agent-tools'
import {
  assertCompanyWritable,
  DEMO_READONLY_MESSAGE,
} from '@/lib/demo/guard'

export interface ChatToolContext {
  /** Trusted active-company id resolved from the authenticated owner. */
  companyId: string
  /** Service-role Supabase client for the data reads (closure arg, never LLM). */
  supabase: SupabaseClient
  /** Retrieval scope for the knowledge base (the owner's company industries). */
  industries: string[]
  /** Owner's preferred reply language, when known. */
  language?: 'en' | 'pt' | 'es'
  /**
   * True when the caller is the shared read-only demo user. The agent channels
   * use the service client (which bypasses the demo-blocking RLS policies), so
   * write tools must consult this flag explicitly (mirrors assertWritable()).
   */
  isDemo?: boolean
}

/**
 * Build the AI-SDK ToolSet for one chat turn, closing over the trusted ctx.
 */
export function buildChatTools(ctx: ChatToolContext) {
  const denyWrite = async () => {
    const denied = await assertCompanyWritable(ctx.companyId)
    return ctx.isDemo || denied
      ? {
          ok: false as const,
          message: denied?.error ?? DEMO_READONLY_MESSAGE,
        }
      : null
  }

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
        try {
          const denied = await denyWrite()
          if (denied) return denied
          const { jobId } = await createEstimate({
            companyId: ctx.companyId,
            projectId,
            prompts,
            language: ctx.language,
            channel: 'web',
          })
          return { jobId, status: 'queued' as const }
        } catch (err) {
          // Billing v2: surface the credit wall as a readable tool result (the
          // model relays it) instead of an opaque tool error.
          return { ok: false as const, message: (err as Error).message }
        }
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

    // ── Write tools ────────────────────────────────────────────────────────
    // companyId/supabase stay trusted closures; only the genuine service fields
    // are LLM inputs. All refuse writes for the read-only demo user.

    createProject: tool({
      description:
        'Create a new project (a job) to attach an estimate to. Call this before createEstimate when starting a job from scratch. Optionally attach a client by id (find one with findClientByName first).',
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe('A short name for the project/job'),
        clientId: z.string().optional().describe('Optional client id to attach'),
      }),
      execute: async ({ name, clientId }) => {
        const denied = await denyWrite()
        if (denied) return denied
        return createProject(
          ctx.supabase,
          ctx.companyId,
          { name, ...(clientId ? { clientId } : {}) },
          'web',
        )
      },
    }),

    addService: tool({
      description:
        'Add a new fixed-price service to the price book, e.g. "add upholstery cleaning for a sofa at $180". Only fixed pricing is supported here.',
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe('The service name'),
        unitPrice: z.number().min(0).describe('Price in the company currency'),
        unit: z.string().max(100).optional().describe('Optional unit label (e.g. "each", "hour")'),
        notes: z.string().max(2000).optional().describe('Optional internal notes'),
      }),
      execute: async ({ name, unitPrice, unit, notes }) => {
        const denied = await denyWrite()
        if (denied) return denied
        return createPriceBookService(ctx.supabase, ctx.companyId, {
          name,
          unitPrice,
          ...(unit ? { unit } : {}),
          ...(notes ? { notes } : {}),
        })
      },
    }),

    addKnowledge: tool({
      description:
        'Save a company-specific note, rule, or preference the AI should remember when generating future estimates, e.g. "we always charge a $50 minimum" or "we don\'t do exterior windows".',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe('A short title for the entry'),
        body: z.string().min(1).describe('The fact, rule, or preference to remember'),
      }),
      execute: async ({ title, body }) => {
        const denied = await denyWrite()
        if (denied) return denied
        return addCompanyKnowledge(ctx.supabase, ctx.companyId, { title, body, source: 'owner via chat' })
      },
    }),
  }
}
