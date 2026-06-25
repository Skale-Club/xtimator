// Phase 127: the 6 read-only MCP knowledge/query tools.
//
// This is a PURE binding layer — ZERO new domain logic. Each tool is a thin
// closure over a v4.9 channel-neutral capability from `@/lib/agent-tools`:
//
//   ask_knowledge          → askKnowledge(question, { industries, companyId, language })   (MKB-01)
//   find_client            → findClientByName(companyId, supabase, name)                   (MQRY-01)
//   get_latest_estimate    → getLatestEstimateForClient(companyId, supabase, name)         (MQRY-01)
//   get_project_status     → getProjectStatus(companyId, supabase, name)                   (MQRY-01)
//   list_recent_estimates  → listRecentEstimates(companyId, supabase)                      (MQRY-01)
//   list_services          → listServices(companyId, supabase)                             (MQRY-01)
//
// ───────────────────────── SECURITY (MSEC-01) ────────────────────────────────
// `companyId` is `auth.company_id` — the OAuth-resolved tenant, TRUSTED, passed
// POSITIONALLY (or as a closure value) to the neutral fns. It is NEVER an
// inputSchema field. The only LLM-supplied inputs are `question` / `name`. A
// schema-walk unit test asserts no companyId/company_id/tenant/tenantId key.
// ──────────────────────────────────────────────────────────────────────────────
//
// MSEC-02: every tool carries the same READ_ONLY_ANNOTATIONS (readOnlyHint:true,
// destructiveHint:false) so Claude.ai auto-groups them under "Read-only tools".
//
// The neutral query fns return a PLAIN human-readable STRING, so each handler
// emits `{ content: [{ type:'text', text }] }` DIRECTLY — NO JSON.stringify, and
// the `jsonContent` helper from read.ts is intentionally NOT reused here.
//
// This file mirrors `lib/chat/tools.ts` (the SAME neutral binding from the chat
// channel) translated to the MCP `{ definition, handler }` entry shape, and
// `lib/mcp/tools/read.ts` (the scope gate + parseInput zod helper + the
// READ_ONLY_ANNOTATIONS constant). read.ts / write.ts / server.ts stay
// byte-untouched — the new tools live here.

import 'server-only'
import { z } from 'zod'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { ensureReadScope } from '@/lib/mcp/tools/read'
import { requireServiceClient } from '@/lib/supabase/service'
import { invalidInput } from '@/lib/mcp/errors'
import type { ToolDefinition, ToolDefinitionEntry, ToolResult } from '@/lib/mcp/tools/registry'
import {
  askKnowledge,
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  listRecentEstimates,
  listServices,
} from '@/lib/agent-tools'

// Copied verbatim from read.ts (read.ts does not export it; keep it byte-stable).
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

// ── Tool definitions (advertised via tools/list) ─────────────────────────────

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'ask_knowledge',
    description:
      'Answer a trade / how-to question from the industry knowledge base, scoped to the active company’s industries.',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The trade or how-to question to answer.',
        },
      },
      required: ['question'],
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Ask knowledge base' },
  },
  {
    name: 'find_client',
    description: 'Find a client of the active company by full or partial name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial client name.' },
      },
      required: ['name'],
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Find client' },
  },
  {
    name: 'get_latest_estimate',
    description: 'Get the most recent estimate for a client, by client name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial client name.' },
      },
      required: ['name'],
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Get latest estimate' },
  },
  {
    name: 'get_project_status',
    description: 'Get the status and total of a project of the active company, by project name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial project name.' },
      },
      required: ['name'],
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Get project status' },
  },
  {
    name: 'list_recent_estimates',
    description: "List the active company's most recent estimates.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'List recent estimates' },
  },
  {
    name: 'list_services',
    description: "List the active company's services / price-book items.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: { ...READ_ONLY_ANNOTATIONS, title: 'List services' },
  },
]

// ── zod input schemas (parsed inside each handler) ───────────────────────────

const askKnowledgeInput = z.object({ question: z.string().min(1) })
const nameInput = z.object({ name: z.string().min(1) })
const emptyInput = z.object({})

// ── Helpers ──────────────────────────────────────────────────────────────────

// Re-created locally — read.ts does not export `parseInput`. Same behavior:
// safeParse, throw invalidInput on the first issue.
function parseInput<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path?.join('.') || '(root)'
    throw invalidInput(`Invalid input at ${path}: ${issue?.message ?? 'unknown error'}`)
  }
  return parsed.data
}

// Emit the neutral fn's plain string DIRECTLY — never JSON.stringify (Pitfall 2).
function textContent(text: string): ToolResult {
  return { content: [{ type: 'text', text }] }
}

// ── Per-tool handlers ────────────────────────────────────────────────────────

async function handleAskKnowledge(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { question } = parseInput(askKnowledgeInput, args)
  const supabase = requireServiceClient()

  // Resolve the retrieval scope from the TRUSTED tenant — mirrors
  // app/api/chat/route.ts. industries[] + language are NEVER from input.
  const { data: company } = await supabase
    .from('companies')
    .select('industries, default_estimate_language')
    .eq('id', auth.company_id)
    .maybeSingle()

  const industries = (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language = lang === 'en' || lang === 'pt' || lang === 'es' ? lang : undefined

  const text = await askKnowledge(question, {
    industries,
    companyId: auth.company_id,
    language,
  })
  return textContent(text)
}

async function handleFindClient(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { name } = parseInput(nameInput, args)
  const supabase = requireServiceClient()
  const text = await findClientByName(auth.company_id, supabase, name)
  return textContent(text)
}

async function handleGetLatestEstimate(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { name } = parseInput(nameInput, args)
  const supabase = requireServiceClient()
  const text = await getLatestEstimateForClient(auth.company_id, supabase, name)
  return textContent(text)
}

async function handleGetProjectStatus(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  const { name } = parseInput(nameInput, args)
  const supabase = requireServiceClient()
  const text = await getProjectStatus(auth.company_id, supabase, name)
  return textContent(text)
}

async function handleListRecentEstimates(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  parseInput(emptyInput, args)
  const supabase = requireServiceClient()
  const text = await listRecentEstimates(auth.company_id, supabase)
  return textContent(text)
}

async function handleListServices(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  parseInput(emptyInput, args)
  const supabase = requireServiceClient()
  const text = await listServices(auth.company_id, supabase)
  return textContent(text)
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the 6 read-only knowledge/query MCP tool entries for the given auth
 * context. Each handler gates on `mcp:read` FIRST, then closes over the trusted
 * `auth.company_id` (never an input) before delegating to its neutral fn.
 */
export function buildKnowledgeQueryTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    {
      definition: TOOL_DEFINITIONS[0]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleAskKnowledge(auth, args)
      },
    },
    {
      definition: TOOL_DEFINITIONS[1]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleFindClient(auth, args)
      },
    },
    {
      definition: TOOL_DEFINITIONS[2]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleGetLatestEstimate(auth, args)
      },
    },
    {
      definition: TOOL_DEFINITIONS[3]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleGetProjectStatus(auth, args)
      },
    },
    {
      definition: TOOL_DEFINITIONS[4]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleListRecentEstimates(auth, args)
      },
    },
    {
      definition: TOOL_DEFINITIONS[5]!,
      handler: async (args) => {
        ensureReadScope(auth, 'mcp:read')
        return handleListServices(auth, args)
      },
    },
  ]
}

// Exported for tests — drive handlers/definitions without spinning up a Server.
export const __testing = {
  TOOL_DEFINITIONS,
  handleAskKnowledge,
  handleFindClient,
  handleGetLatestEstimate,
  handleGetProjectStatus,
  handleListRecentEstimates,
  handleListServices,
  askKnowledgeInput,
  nameInput,
  emptyInput,
}
