/**
 * lib/agent-tools/query-company-data.ts
 *
 * NEUT-02 — channel-neutral, read-only company data-reads.
 *
 * These six plain async functions are the DATA-READ layer behind the WhatsApp
 * QUERY tools (and, from Phase 124, the AI-SDK chat). They were lifted VERBATIM
 * from the tool callbacks in the WhatsApp query-tools adapter so output strings
 * stay byte-identical; only the LangChain tool wrapper + zod schema were left
 * behind in the channel adapter.
 *
 * ───────────────────────── SECURITY: CROSS-TENANT LEAK (T-lrf-01) ─────────────
 * THREAT: a QUERY agent produces tool-call arguments from UNTRUSTED inbound
 * message content. If the caller (or LLM) could choose the tenant, an owner (or a
 * crafted message) could read another company's clients/projects/estimates.
 *
 * MITIGATION: `companyId` is the FIRST POSITIONAL PARAMETER of every function,
 * supplied by the trusted caller (resolved upstream from owner phone → company).
 * It is NEVER an LLM tool-input field — the LangChain binding in the channel
 * adapter never adds a company_id schema field. EVERY tenant-table query chains
 * `.eq('company_id', companyId)`. Reads use the service client (cross-table
 * contexts are RLS deny-all), so this explicit filter is the SOLE isolation
 * control — hence the dedicated unit test asserting every query received the
 * positional company_id. Do NOT promote companyId to a tool-input field anywhere.
 * ──────────────────────────────────────────────────────────────────────────────
 */
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

// Resolve a single client by fuzzy name within the company. Returns null when
// not found. company_id filter is non-negotiable (see file header).
async function resolveClient(
  companyId: string,
  supabase: SupabaseClient,
  name: string
): Promise<ClientRow | null> {
  const { data } = await supabase
    .from('clients')
    .select('id, name, phone')
    .eq('company_id', companyId)
    .ilike('name', `%${name}%`)
    .limit(1)
  const rows = (data as ClientRow[] | null) ?? []
  return rows[0] ?? null
}

export async function findClientByName(
  companyId: string,
  supabase: SupabaseClient,
  name: string
): Promise<string> {
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
}

export async function getLatestEstimateForClient(
  companyId: string,
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const client = await resolveClient(companyId, supabase, name)
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
}

export async function getProjectStatus(
  companyId: string,
  supabase: SupabaseClient,
  name: string
): Promise<string> {
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
}

export async function listRecentEstimates(
  companyId: string,
  supabase: SupabaseClient
): Promise<string> {
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
}

export async function listServices(
  companyId: string,
  supabase: SupabaseClient
): Promise<string> {
  const CAP = 25
  const { data } = await supabase
    .from('company_price_book')
    .select('id, name, unit, unit_price, currency_code')
    .eq('company_id', companyId)
    .is('deleted_at', null)
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
}

export async function findServiceByName(
  companyId: string,
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const { data } = await supabase
    .from('company_price_book')
    .select('id, name, unit, unit_price, currency_code')
    .eq('company_id', companyId)
    .is('deleted_at', null)
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
}
