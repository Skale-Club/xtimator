/**
 * Quick task 260603-lrf — Task 1.
 *
 * Read-only, company-scoped LangChain tools for the WhatsApp QUERY intent
 * (e.g. "qual o ultimo estimate do cliente Joao", "status do projeto X").
 *
 * ───────────────────────── SECURITY: CROSS-TENANT LEAK (T-lrf-01) ─────────────
 * THREAT: the QUERY agent produces tool-call arguments from UNTRUSTED inbound
 * WhatsApp message content. If the LLM could choose the tenant, an owner (or a
 * crafted message) could read another company's clients/projects/estimates.
 *
 * MITIGATION: `companyId` is a CLOSURE parameter of makeQueryTools, captured from
 * the trusted value resolved upstream in route.ts (owner_phone → company). It is
 * NEVER a zod tool-input field, so the LLM physically cannot supply a tenant.
 * EVERY query chains `.eq('company_id', companyId)`. Reads use the service client
 * (whatsapp_* + cross-table contexts are RLS deny-all), so this explicit filter
 * is the SOLE isolation control — hence the dedicated unit test that asserts
 * (a) every query received the closure company_id and (b) no schema accepts a
 * company_id input. Do NOT add a company_id/companyId field to any schema below.
 * ──────────────────────────────────────────────────────────────────────────────
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatMoney } from '@/lib/money/currency'

type ClientRow = { id: string; name: string | null; phone?: string | null }
type ProjectRow = {
  id: string
  name: string | null
  status: string | null
  total: number | null
  client_id?: string | null
}
type EstimateRow = {
  id: string
  total: number | null
  currency_code: string | null
  status?: string | null
  summary?: string | null
  created_at: string
}
type PriceBookRow = {
  id: string
  name: string | null
  unit: string | null
  unit_price: number | null
  currency_code: string | null
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return iso
  }
}

export function makeQueryTools(companyId: string, supabase: SupabaseClient) {
  // Resolve a single client by fuzzy name within the company. Returns null when
  // not found. company_id filter is non-negotiable (see file header).
  async function resolveClient(name: string): Promise<ClientRow | null> {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .ilike('name', `%${name}%`)
      .limit(1)
    const rows = (data as ClientRow[] | null) ?? []
    return rows[0] ?? null
  }

  const findClientByName = tool(
    async ({ name }: { name: string }) => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .ilike('name', `%${name}%`)
        .limit(5)
      const rows = (data as ClientRow[] | null) ?? []
      if (rows.length === 0) return `No client found matching "${name}".`
      return rows
        .map((c) => `- ${c.name ?? 'Unnamed'}${c.phone ? ` (${c.phone})` : ''}`)
        .join('\n')
    },
    {
      name: 'find_client_by_name',
      description:
        'Look up clients by (partial) name. Use to find a client before answering questions about their projects or estimates.',
      schema: z.object({
        name: z.string().describe('Full or partial client name to search for'),
      }),
    }
  )

  const getLatestEstimateForClient = tool(
    async ({ name }: { name: string }) => {
      const client = await resolveClient(name)
      if (!client) return `No client found matching "${name}".`

      const { data: projData } = await supabase
        .from('projects')
        .select('id, name, status, total, client_id')
        .eq('company_id', companyId)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(5)
      const projects = (projData as ProjectRow[] | null) ?? []
      if (projects.length === 0) return `No projects found for ${client.name ?? name}.`

      const projectIds = projects.map((p) => p.id)
      const { data: estData } = await supabase
        .from('estimates')
        .select('id, total, currency_code, status, summary, created_at')
        .eq('company_id', companyId)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(1)
      const estimates = (estData as EstimateRow[] | null) ?? []
      const est = estimates[0]
      if (!est) return `No estimates found for ${client.name ?? name}.`

      const total = formatMoney(est.total ?? 0, est.currency_code)
      return `Latest estimate for ${client.name ?? name}: ${total} (created ${formatDate(
        est.created_at
      )}${est.status ? `, status: ${est.status}` : ''}).`
    },
    {
      name: 'get_latest_estimate_for_client',
      description:
        'Get the most recent estimate (total + date) for a client identified by name.',
      schema: z.object({
        name: z.string().describe('Client name to look up the latest estimate for'),
      }),
    }
  )

  const getProjectStatus = tool(
    async ({ name }: { name: string }) => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, status, total')
        .eq('company_id', companyId)
        .ilike('name', `%${name}%`)
        .order('created_at', { ascending: false })
        .limit(5)
      const rows = (data as ProjectRow[] | null) ?? []
      if (rows.length === 0) return `No project found matching "${name}".`
      return rows
        .map(
          (p) =>
            `- ${p.name ?? 'Untitled'}: status ${p.status ?? 'unknown'}, total ${formatMoney(
              p.total ?? 0,
              null
            )}`
        )
        .join('\n')
    },
    {
      name: 'get_project_status',
      description: 'Get the status and total of a project identified by (partial) name.',
      schema: z.object({
        name: z.string().describe('Full or partial project name to look up'),
      }),
    }
  )

  const listRecentEstimates = tool(
    async () => {
      const { data } = await supabase
        .from('estimates')
        .select('id, total, currency_code, status, summary, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5)
      const rows = (data as EstimateRow[] | null) ?? []
      if (rows.length === 0) return 'No estimates found.'
      return rows
        .map(
          (e) =>
            `- ${formatMoney(e.total ?? 0, e.currency_code)} (${formatDate(e.created_at)}${
              e.status ? `, ${e.status}` : ''
            })`
        )
        .join('\n')
    },
    {
      name: 'list_recent_estimates',
      description: 'List the 5 most recent estimates for the business.',
      schema: z.object({}),
    }
  )

  const listServices = tool(
    async () => {
      const CAP = 25
      const { data } = await supabase
        .from('company_price_book')
        .select('id, name, unit, unit_price, currency_code')
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .limit(CAP + 1)
      const rows = (data as PriceBookRow[] | null) ?? []
      if (rows.length === 0) return 'No services on file yet.'
      const shown = rows.slice(0, CAP)
      const lines = shown.map(
        (r) =>
          `- ${r.name ?? 'Unnamed'}: ${formatMoney(r.unit_price ?? 0, r.currency_code)}${
            r.unit ? ` per ${r.unit}` : ''
          }`
      )
      if (rows.length > CAP) lines.push('...and more services available.')
      return lines.join('\n')
    },
    {
      name: 'list_services',
      description:
        'List the services this business offers, with their prices. Use for questions like "what do you offer" or "what are your prices".',
      schema: z.object({}),
    }
  )

  const findServiceByName = tool(
    async ({ name }: { name: string }) => {
      const { data } = await supabase
        .from('company_price_book')
        .select('id, name, unit, unit_price, currency_code')
        .eq('company_id', companyId)
        .ilike('name', `%${name}%`)
        .order('name', { ascending: true })
        .limit(5)
      const rows = (data as PriceBookRow[] | null) ?? []
      if (rows.length === 0) return `No service found matching "${name}".`
      return rows
        .map(
          (r) =>
            `- ${r.name ?? 'Unnamed'}: ${formatMoney(r.unit_price ?? 0, r.currency_code)}${
              r.unit ? ` per ${r.unit}` : ''
            }`
        )
        .join('\n')
    },
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
    findClientByName,
    getLatestEstimateForClient,
    getProjectStatus,
    listRecentEstimates,
    listServices,
    findServiceByName,
  ]
}
