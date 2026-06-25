/**
 * Quick task 260603-lrf — Task 1.
 *
 * Read-only, company-scoped LangChain tools for the WhatsApp QUERY intent
 * (e.g. "qual o ultimo estimate do cliente Joao", "status do projeto X").
 *
 * THE LANGCHAIN BINDING LIVES HERE (the channel adapter). The actual data-reads
 * moved to the channel-neutral lib/agent-tools/query-company-data.ts (NEUT-02);
 * makeQueryTools now wraps each neutral read in a `tool()` with the SAME name /
 * description / zod schema. Phase 124's AI-SDK chat will bind the SAME neutral
 * reads without importing LangChain.
 *
 * ───────────────────────── SECURITY: CROSS-TENANT LEAK (T-lrf-01) ─────────────
 * THREAT: the QUERY agent produces tool-call arguments from UNTRUSTED inbound
 * WhatsApp message content. If the LLM could choose the tenant, an owner (or a
 * crafted message) could read another company's clients/projects/estimates.
 *
 * MITIGATION: `companyId` is a CLOSURE parameter of makeQueryTools, captured from
 * the trusted value resolved upstream in route.ts (owner_phone → company), and
 * passed POSITIONALLY into each neutral read. It is NEVER a zod tool-input field,
 * so the LLM physically cannot supply a tenant. EVERY neutral read chains
 * `.eq('company_id', companyId)`. Do NOT add a company_id/companyId field to any
 * schema below.
 * ──────────────────────────────────────────────────────────────────────────────
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  listRecentEstimates,
  listServices,
  findServiceByName,
} from '@/lib/agent-tools/query-company-data'

export function makeQueryTools(companyId: string, supabase: SupabaseClient) {
  const findClientByNameTool = tool(
    async ({ name }: { name: string }) => findClientByName(companyId, supabase, name),
    {
      name: 'find_client_by_name',
      description:
        'Look up clients by (partial) name. Use to find a client before answering questions about their projects or estimates.',
      schema: z.object({
        name: z.string().describe('Full or partial client name to search for'),
      }),
    }
  )

  const getLatestEstimateForClientTool = tool(
    async ({ name }: { name: string }) =>
      getLatestEstimateForClient(companyId, supabase, name),
    {
      name: 'get_latest_estimate_for_client',
      description:
        'Get the most recent estimate (total + date) for a client identified by name.',
      schema: z.object({
        name: z.string().describe('Client name to look up the latest estimate for'),
      }),
    }
  )

  const getProjectStatusTool = tool(
    async ({ name }: { name: string }) => getProjectStatus(companyId, supabase, name),
    {
      name: 'get_project_status',
      description: 'Get the status and total of a project identified by (partial) name.',
      schema: z.object({
        name: z.string().describe('Full or partial project name to look up'),
      }),
    }
  )

  const listRecentEstimatesTool = tool(
    async () => listRecentEstimates(companyId, supabase),
    {
      name: 'list_recent_estimates',
      description: 'List the 5 most recent estimates for the business.',
      schema: z.object({}),
    }
  )

  const listServicesTool = tool(
    async () => listServices(companyId, supabase),
    {
      name: 'list_services',
      description:
        'List the services this business offers, with their prices. Use for questions like "what do you offer" or "what are your prices".',
      schema: z.object({}),
    }
  )

  const findServiceByNameTool = tool(
    async ({ name }: { name: string }) => findServiceByName(companyId, supabase, name),
    {
      name: 'find_service_by_name',
      description:
        'Look up a specific service / price-book item by (partial) name. Use for "how much is X" or "do you do X".',
      schema: z.object({
        name: z.string().describe('Full or partial service / item name to search for'),
      }),
    }
  )

  return [
    findClientByNameTool,
    getLatestEstimateForClientTool,
    getProjectStatusTool,
    listRecentEstimatesTool,
    listServicesTool,
    findServiceByNameTool,
  ]
}
