// Phase 88: read-only MCP tools (list_estimates, get_estimate, list_clients, list_projects).
//
// All four tools share the same shape:
//   1. Scope-gate on `mcp:read` (throws insufficientScope if missing).
//   2. Parse + validate input via zod.
//   3. Query Supabase via the service client, with an explicit
//      `.eq('company_id', auth.company_id)` filter on every query. The user
//      already authorized this exact (user, company) tuple at the OAuth consent
//      screen (Phase 86) — we don't re-do RLS, we filter at the query layer.
//   4. Keyset-paginate via (created_at, id) tuples (see lib/mcp/pagination.ts).
//   5. Return `{ items, nextCursor? }` as a single `content` block of type
//      `text` with `JSON.stringify(result, null, 2)` — the simplest shape that
//      every MCP client (Claude.ai, mcp-inspector, etc.) handles consistently.
//
// All tools are annotated `readOnlyHint: true` so Claude.ai's UI auto-groups
// them under "Read-only tools (N)" with a single "Always allow" toggle.

import 'server-only'
import { z } from 'zod'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { requireScope } from '@/lib/mcp/scope'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type CursorPayload,
} from '@/lib/mcp/pagination'
import {
  insufficientScope,
  invalidInput,
  notFound,
} from '@/lib/mcp/errors'

// ── Tool definitions (advertised via tools/list) ──────────────────────────────

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: typeof READ_ONLY_ANNOTATIONS & { title: string }
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_estimates',
    description:
      'List estimates for the active company. Returns paginated results ordered by created_at DESC.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: "Optional status filter (e.g. 'draft', 'consolidated', 'sent').",
        },
        project_id: { type: 'string', description: 'Optional project uuid filter.' },
        client_id: { type: 'string', description: 'Optional client uuid filter.' },
        limit: {
          type: 'number',
          description: 'Page size (default 25, max 100).',
          minimum: 1,
          maximum: 100,
        },
        cursor: {
          type: 'string',
          description: 'Opaque pagination cursor from a previous response.',
        },
      },
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'List estimates' },
  },
  {
    name: 'get_estimate',
    description:
      'Get full details of a single estimate including its sections and line items.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Estimate uuid.' },
      },
      required: ['id'],
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Get estimate' },
  },
  {
    name: 'list_clients',
    description: 'List clients for the active company.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Case-insensitive substring match against name or email.',
        },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
      },
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'List clients' },
  },
  {
    name: 'list_projects',
    description: 'List projects for the active company. Excludes archived and trashed rows.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional client uuid filter.' },
        status: { type: 'string', description: 'Optional status filter.' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
      },
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'List projects' },
  },
]

// ── zod input schemas (parsed inside each handler) ───────────────────────────

const uuid = z.string().min(1)
const listLimit = z.number().int().positive().max(100).optional()
const cursorIn = z.string().optional()

const listEstimatesInput = z.object({
  status: z.string().optional(),
  project_id: uuid.optional(),
  client_id: uuid.optional(),
  limit: listLimit,
  cursor: cursorIn,
})

const getEstimateInput = z.object({
  id: uuid,
})

const listClientsInput = z.object({
  search: z.string().optional(),
  limit: listLimit,
  cursor: cursorIn,
})

const listProjectsInput = z.object({
  client_id: uuid.optional(),
  status: z.string().optional(),
  limit: listLimit,
  cursor: cursorIn,
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureScope(auth: McpAuthContext, scope: 'mcp:read'): void {
  const check = requireScope(auth, scope)
  if (!check.ok) throw insufficientScope(scope)
}

function parseInput<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.join('.') || '(root)'
    throw invalidInput(`Invalid input at ${path}: ${issue?.message ?? 'unknown error'}`)
  }
  return parsed.data
}

interface PaginatedRow {
  id: string
  created_at: string
}

function paginate<T extends PaginatedRow>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor?: string } {
  if (rows.length <= limit) return { items: rows }
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]!
  return { items, nextCursor: encodeCursor({ created_at: last.created_at, id: last.id }) }
}

function applyCursor<Q extends { lt: (col: string, val: string) => Q; or: (s: string) => Q }>(
  query: Q,
  cursor: CursorPayload | null,
): Q {
  if (!cursor) return query
  // Sort is (created_at DESC, id DESC) → next page is rows strictly "before" the cursor.
  // Equivalent SQL: WHERE (created_at, id) < (cursor.created_at, cursor.id).
  const esc = cursor.id.replace(/"/g, '\\"')
  return query.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt."${esc}")`,
  )
}

function jsonContent(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  }
}

// ── Per-tool handlers ────────────────────────────────────────────────────────

async function handleListEstimates(auth: McpAuthContext, args: unknown) {
  const input = parseInput(listEstimatesInput, args)
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor ?? null)

  const supabase = requireServiceClient()
  let q = supabase
    .from('estimates')
    .select(
      'id, estimate_seq, estimate_number, project_id, status, workflow_status, total, currency_code, created_at',
    )
    .eq('company_id', auth.company_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.status) q = q.eq('status', input.status)
  if (input.project_id) q = q.eq('project_id', input.project_id)
  if (input.client_id) {
    // estimates table has no client_id directly — join via projects.
    const { data: projectIds } = await supabase
      .from('projects')
      .select('id')
      .eq('company_id', auth.company_id)
      .eq('client_id', input.client_id)
    const ids = (projectIds ?? []).map((p) => p.id as string)
    if (ids.length === 0) return jsonContent({ items: [] })
    q = q.in('project_id', ids)
  }
  q = applyCursor(q, cursor)

  const { data, error } = await q
  if (error) throw new Error(`list_estimates query failed: ${error.message}`)
  return jsonContent(paginate((data ?? []) as PaginatedRow[], limit))
}

async function handleGetEstimate(auth: McpAuthContext, args: unknown) {
  const input = parseInput(getEstimateInput, args)
  const supabase = requireServiceClient()

  const { data: estimate, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', input.id)
    .eq('company_id', auth.company_id)
    .maybeSingle()

  if (error) throw new Error(`get_estimate query failed: ${error.message}`)
  if (!estimate) throw notFound(`Estimate ${input.id} not found`)

  // Defense in depth — confirm tenant boundary even though we filtered.
  if ((estimate as { company_id: string }).company_id !== auth.company_id) {
    throw notFound(`Estimate ${input.id} not found`)
  }

  const { data: sectionsData } = await supabase
    .from('estimate_sections')
    .select('*')
    .eq('estimate_id', input.id)
    .order('sort_order', { ascending: true })

  const sections = sectionsData ?? []

  const sectionsWithItems = await Promise.all(
    sections.map(async (section) => {
      const { data: itemsData } = await supabase
        .from('estimate_items')
        .select('*')
        .eq('section_id', (section as { id: string }).id)
        .order('sort_order', { ascending: true })
      return { ...(section as Record<string, unknown>), items: itemsData ?? [] }
    }),
  )

  return jsonContent({ ...(estimate as Record<string, unknown>), sections: sectionsWithItems })
}

async function handleListClients(auth: McpAuthContext, args: unknown) {
  const input = parseInput(listClientsInput, args)
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor ?? null)

  const supabase = requireServiceClient()
  let q = supabase
    .from('clients')
    .select('id, name, email, phone, address, city, state, zip, created_at')
    .eq('company_id', auth.company_id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.search) {
    const term = input.search.replace(/[%,]/g, '')
    q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`)
  }
  q = applyCursor(q, cursor)

  const { data, error } = await q
  if (error) throw new Error(`list_clients query failed: ${error.message}`)
  return jsonContent(paginate((data ?? []) as PaginatedRow[], limit))
}

async function handleListProjects(auth: McpAuthContext, args: unknown) {
  const input = parseInput(listProjectsInput, args)
  const limit = clampLimit(input.limit)
  const cursor = decodeCursor(input.cursor ?? null)

  const supabase = requireServiceClient()
  let q = supabase
    .from('projects')
    .select('id, name, client_id, project_type, status, created_at')
    .eq('company_id', auth.company_id)
    // Match getProjectsForListPage default: only "active" rows (no archive / trash).
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (input.client_id) q = q.eq('client_id', input.client_id)
  if (input.status) q = q.eq('status', input.status)
  q = applyCursor(q, cursor)

  const { data, error } = await q
  if (error) throw new Error(`list_projects query failed: ${error.message}`)
  return jsonContent(paginate((data ?? []) as PaginatedRow[], limit))
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Register the 4 read-only MCP tools on the given server. Call from
 * `createMcpServer` in `lib/mcp/server.ts`.
 *
 * Each tool:
 *   - Carries `readOnlyHint: true` so Claude.ai groups them under one "Always
 *     allow" toggle in the UI.
 *   - Gates on `mcp:read` scope before doing any work.
 *   - Scopes every Supabase query to `auth.company_id`.
 */
export function registerReadTools(server: Server, auth: McpAuthContext): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    ensureScope(auth, 'mcp:read')

    const { name, arguments: args } = request.params
    switch (name) {
      case 'list_estimates':
        return handleListEstimates(auth, args)
      case 'get_estimate':
        return handleGetEstimate(auth, args)
      case 'list_clients':
        return handleListClients(auth, args)
      case 'list_projects':
        return handleListProjects(auth, args)
      default:
        throw invalidInput(`Unknown tool: ${name}`)
    }
  })
}

// Exported for tests — let unit tests inspect/exec without spinning up a Server.
export const __testing = {
  TOOL_DEFINITIONS,
  handleListEstimates,
  handleGetEstimate,
  handleListClients,
  handleListProjects,
  listEstimatesInput,
  getEstimateInput,
  listClientsInput,
  listProjectsInput,
}
