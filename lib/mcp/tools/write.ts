// Phase 89: write MCP tools (create_estimate) + async-status companion
// (check_job_status).
//
// Pattern matches read.ts but with two key differences:
//
//   1. `create_estimate` carries write-tool annotations
//      (readOnlyHint: false, destructiveHint: false, idempotentHint: false).
//      Claude.ai groups it under a separate "Write tools" toggle in the UI;
//      tool calls require explicit per-call approval unless the user
//      "Always allows" it.
//
//   2. Estimate generation is async. `create_estimate` delegates to the
//      channel-neutral `createEstimate` (lib/agent-tools) — the same generation
//      core the web chat binds — which triggers the existing Inngest pipeline
//      (the same path used by `/api/generate-estimate` from the web app) and
//      returns the Inngest event id as `job_id` immediately. The LLM then polls
//      `check_job_status(job_id)` until the run completes.
//
// `check_job_status` is read-only (idempotentHint: true) and reads from
// Inngest's REST `/v1/events/{eventId}/runs` endpoint via the same code path
// as `/api/jobs/[jobId]` (Phase 67 / INNGEST-05) — we don't add a parallel
// "MCP-specific" job table.

import 'server-only'
import { z } from 'zod'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { requireScope } from '@/lib/mcp/scope'
import { requireServiceClient } from '@/lib/supabase/service'
import { assertCompanyWritable } from '@/lib/demo/guard'
import {
  createEstimate,
  createProject,
  createPriceBookService,
  addCompanyKnowledge,
  draftCustomerMessage,
  confirmSendByToken,
} from '@/lib/agent-tools'
import { explainSendGateRefusal } from '@/lib/notifications/agentic-send-confirm'
import {
  insufficientScope,
  invalidInput,
  notFound,
} from '@/lib/mcp/errors'
import type { ToolDefinitionEntry, ToolResult } from '@/lib/mcp/tools/registry'

// ── Annotation tiers ──────────────────────────────────────────────────────────

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

// ── Tool definitions ──────────────────────────────────────────────────────────

const CREATE_ESTIMATE_DEFINITION = {
  name: 'create_estimate',
  description:
    'Create a new estimate for the active company. Takes a free-form prompt or structured payload; returns a job_id immediately. Use check_job_status to poll for completion (typically 30-60s due to AI generation).',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: {
        type: 'string',
        description: 'The project to attach this estimate to (uuid).',
      },
      prompt: {
        type: 'string',
        description:
          'Natural-language description that drives AI generation (1-5000 chars).',
        minLength: 1,
        maxLength: 5000,
      },
      language: {
        type: 'string',
        enum: ['en', 'pt', 'es'],
        description: 'Optional language override (defaults to company setting).',
      },
    },
    required: ['project_id', 'prompt'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Create estimate' },
} as const

const CREATE_PROJECT_DEFINITION = {
  name: 'create_project',
  description:
    "Create a new project (a job) for the active company. A project is the container an estimate attaches to — call this first when starting a job from scratch, then pass the returned id to create_estimate. Optionally link a client by their id (look one up with find_client first).",
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A short name for the project/job, e.g. "Kitchen deep clean — Ester".',
        minLength: 1,
        maxLength: 200,
      },
      client_id: {
        type: 'string',
        description: 'Optional client uuid to attach (resolve via find_client).',
      },
    },
    required: ['name'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Create project' },
} as const

const ADD_SERVICE_DEFINITION = {
  name: 'add_service',
  description:
    "Add a new fixed-price service (a price-book item) to the active company's catalog. Use when the owner wants to add or register a service they offer, e.g. \"add upholstery cleaning for a sofa at $180\". Only fixed pricing is supported here; complex area-based or add-on pricing must be set up on the Price Book page.",
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The service name (1-200 chars), e.g. "3 Seater Sofa Cleaning".',
        minLength: 1,
        maxLength: 200,
      },
      unit_price: {
        type: 'number',
        description: 'The price for this service, in the company currency (>= 0).',
        minimum: 0,
      },
      unit: {
        type: 'string',
        description: 'Optional unit label, e.g. "each", "sq ft", "hour".',
      },
      notes: {
        type: 'string',
        description: 'Optional internal notes about the service.',
      },
    },
    required: ['name', 'unit_price'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Add service' },
} as const

const ADD_KNOWLEDGE_DEFINITION = {
  name: 'add_knowledge',
  description:
    "Save a company-specific knowledge entry (a note, policy, pricing rule, or preference) that the AI should remember and use when generating future estimates for this company. Use when the owner tells you something about how THEY work, e.g. \"remember that we always charge a $50 minimum\" or \"we don't do exterior windows\".",
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'A short title for the entry (1-200 chars).',
        minLength: 1,
        maxLength: 200,
      },
      body: {
        type: 'string',
        description: 'The knowledge itself — the fact, rule, or preference to remember.',
        minLength: 1,
      },
      source: {
        type: 'string',
        description: 'Optional provenance label (e.g. "owner via chat").',
        maxLength: 500,
      },
    },
    required: ['title', 'body'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Add knowledge' },
} as const

const DRAFT_CUSTOMER_MESSAGE_DEFINITION = {
  name: 'draft_customer_message',
  description:
    'Step 1 of 2 for texting or emailing a customer. Resolves the client by name, rate-limits, and returns a PREVIEW (the exact recipient + body that would be sent) plus a confirmation_token. This never sends anything. Show the preview to the owner for review, then call send_customer_message with the returned confirmation_token to actually send.',
  inputSchema: {
    type: 'object',
    properties: {
      client_name: {
        type: 'string',
        description: 'The customer/client name to look up, e.g. "Jane Smith". Matched against the active company\'s clients.',
        minLength: 1,
        maxLength: 200,
      },
      channel: {
        type: 'string',
        enum: ['sms', 'email'],
        description: 'How to reach the customer — sms or email.',
      },
      body: {
        type: 'string',
        description: 'The message body to send (1-2000 chars).',
        minLength: 1,
        maxLength: 2000,
      },
      subject: {
        type: 'string',
        description: 'Optional email subject (ignored for sms).',
        maxLength: 200,
      },
    },
    required: ['client_name', 'channel', 'body'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Draft customer message' },
} as const

const SEND_CUSTOMER_MESSAGE_DEFINITION = {
  name: 'send_customer_message',
  description:
    'Step 2 of 2 for texting or emailing a customer. Sends the EXACT message previously previewed by draft_customer_message, identified solely by the confirmation_token it returned. There is no way to change the recipient, channel, or body at this step — only call this after the owner has reviewed and approved the draft_customer_message preview.',
  inputSchema: {
    type: 'object',
    properties: {
      confirmation_token: {
        type: 'string',
        description: 'The confirmation_token returned by draft_customer_message.',
        minLength: 1,
      },
    },
    required: ['confirmation_token'],
  },
  annotations: { ...WRITE_ANNOTATIONS, title: 'Send customer message' },
} as const

const CHECK_JOB_STATUS_DEFINITION = {
  name: 'check_job_status',
  description:
    'Check the status of an async job (e.g., one returned by create_estimate). Polls until complete.',
  inputSchema: {
    type: 'object',
    properties: {
      job_id: {
        type: 'string',
        description: 'Job id returned by an async tool (e.g., create_estimate).',
      },
    },
    required: ['job_id'],
  },
  annotations: { ...READ_ANNOTATIONS, title: 'Check job status' },
} as const

// ── Input schemas (zod) ──────────────────────────────────────────────────────

const createEstimateInput = z.object({
  project_id: z.string().min(1),
  prompt: z.string().min(1).max(5000),
  language: z.enum(['en', 'pt', 'es']).optional(),
})

const createProjectInput = z.object({
  name: z.string().min(1).max(200),
  client_id: z.string().uuid().optional(),
})

const addServiceInput = z.object({
  name: z.string().min(1).max(200),
  unit_price: z.number().min(0),
  unit: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
})

const addKnowledgeInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  source: z.string().max(500).optional(),
})

const checkJobStatusInput = z.object({
  job_id: z.string().min(1),
})

const draftCustomerMessageInput = z.object({
  client_name: z.string().min(1).max(200),
  channel: z.enum(['sms', 'email']),
  body: z.string().min(1).max(2000),
  subject: z.string().max(200).optional(),
})

const sendCustomerMessageInput = z.object({
  confirmation_token: z.string().min(1),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureScope(auth: McpAuthContext, scope: 'mcp:read' | 'mcp:write'): void {
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

function jsonContent(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  }
}

async function ensureCompanyWritable(auth: McpAuthContext): Promise<void> {
  const denied = await assertCompanyWritable(auth.company_id)
  if (denied) throw invalidInput(denied.error)
}

// ── create_estimate ──────────────────────────────────────────────────────────

async function handleCreateEstimate(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(createEstimateInput, args)
  await ensureCompanyWritable(auth)

  // Verify the project belongs to the active company. Use service client (we
  // bypass RLS — the OAuth consent screen already authorized this exact
  // (user, company) tuple, and we re-enforce tenancy here at the query layer).
  const supabase = requireServiceClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, company_id')
    .eq('id', input.project_id)
    .maybeSingle()
  if (error) {
    throw new Error(`create_estimate project lookup failed: ${error.message}`)
  }
  if (
    !project ||
    (project as { company_id: string }).company_id !== auth.company_id
  ) {
    throw notFound(`Project ${input.project_id} not found`)
  }

  // Dispatch via the channel-neutral createEstimate (lib/agent-tools) — the
  // SAME core the web chat binds (lib/chat/tools.ts, channel:'web'). MCP keeps
  // its own auth/scope + project-ownership pre-flight above; only the
  // generation-event dispatch is delegated so all three channels
  // (web chat / MCP / WhatsApp) converge on one generation entry point. The
  // neutral fn mints the requestId and the channel-namespaced idempotency id.
  //
  // 2026-05-27 (Phase 89 deferral closed): `prompt` is forwarded to the
  // EstimateGeneratePayload as `prompts: [prompt]`. The underlying service
  // `generateEstimateForProject` consumes this as an additional input modality
  // alongside transcripts + photos, and the prompt-builder renders it under
  // a "## Description" section in the user content sent to the AI provider.
  // Projects without transcripts/photos can now produce an estimate from the
  // prompt alone — which is the core MCP create_estimate UX.
  const { jobId } = await createEstimate({
    companyId: auth.company_id,
    projectId: input.project_id,
    prompts: [input.prompt],
    ...(input.language ? { language: input.language } : {}),
    channel: 'mcp',
  })

  return jsonContent({
    job_id: jobId,
    status: 'queued',
    message:
      'Estimate generation queued. Poll check_job_status to track progress.',
  })
}

// ── create_project ────────────────────────────────────────────────────────────

async function handleCreateProject(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(createProjectInput, args)
  await ensureCompanyWritable(auth)

  const supabase = requireServiceClient()
  const result = await createProject(
    supabase,
    auth.company_id,
    { name: input.name, ...(input.client_id ? { clientId: input.client_id } : {}) },
    'mcp',
  )

  if (!result.ok) throw invalidInput(result.message)
  return jsonContent({
    id: result.id,
    name: result.name,
    message: `Created project "${result.name}". Use create_estimate with project_id "${result.id}".`,
  })
}

// ── add_service ───────────────────────────────────────────────────────────────

async function handleAddService(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(addServiceInput, args)
  await ensureCompanyWritable(auth)

  // Service client bypasses RLS — tenancy is enforced by passing the trusted
  // auth.company_id (never an LLM field) into the neutral capability.
  const supabase = requireServiceClient()
  const result = await createPriceBookService(supabase, auth.company_id, {
    name: input.name,
    unitPrice: input.unit_price,
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  })

  if (!result.ok) throw invalidInput(result.message)
  return jsonContent({
    id: result.id,
    name: result.name,
    unit_price: result.unitPrice,
    currency_code: result.currencyCode,
    message: `Added "${result.name}" to the price book.`,
  })
}

// ── add_knowledge ─────────────────────────────────────────────────────────────

async function handleAddKnowledge(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(addKnowledgeInput, args)
  await ensureCompanyWritable(auth)

  const supabase = requireServiceClient()
  const result = await addCompanyKnowledge(supabase, auth.company_id, {
    title: input.title,
    body: input.body,
    ...(input.source ? { source: input.source } : {}),
  })

  if (!result.ok) throw invalidInput(result.message)
  return jsonContent({
    id: result.id,
    message: 'Saved. The AI will use this when generating future estimates.',
  })
}

// ── draft_customer_message / send_customer_message ──────────────────────────
//
// Phase 178 Plan 04 (AGENT-02/03) — the MCP adaptation of the neutral
// draft/confirm capability (178-02, lib/agent-tools/send-customer-message.ts).
// A two-call "propose then commit" pair takes the place of an MCP
// elicitation primitive: draft_customer_message returns a byte-exact
// preview + an opaque confirmation_token; send_customer_message's schema
// accepts ONLY that token — no recipient/channel/body field exists on it,
// so a prompt-injected second turn has no field to redirect a send through.
// auth.company_id (the trusted OAuth tenant) scopes both calls; never an
// LLM-suppliable company id.

async function handleDraftCustomerMessage(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(draftCustomerMessageInput, args)
  await ensureCompanyWritable(auth)
  const supabase = requireServiceClient()
  const result = await draftCustomerMessage(supabase, {
    companyId: auth.company_id,
    clientQuery: input.client_name,
    channel: input.channel,
    body: input.body,
    ...(input.subject ? { subject: input.subject } : {}),
    triggerSource: 'agentic-mcp',
  })

  if (!result.ok) {
    const msg =
      result.error === 'client_ambiguous'
        ? `Multiple clients match "${input.client_name}": ${result.candidates?.join(', ')}. Ask which one, then retry with an exact name.`
        : {
            client_not_found: `No client found matching "${input.client_name}".`,
            no_recipient_email: `${input.client_name} has no email on file.`,
            no_recipient_phone: `${input.client_name} has no phone on file.`,
            rate_limited: 'Daily agentic-send limit reached for this company — try again tomorrow.',
          }[result.error]
    throw invalidInput(msg ?? 'Could not prepare that message.')
  }

  return jsonContent({
    confirmation_token: result.token,
    client_name: result.clientName,
    recipient: result.recipient,
    channel: result.channel,
    subject: result.subject,
    body: result.body,
    message:
      'Review this preview with the user, then call send_customer_message with confirmation_token to actually send.',
  })
}

async function handleSendCustomerMessage(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(sendCustomerMessageInput, args)
  await ensureCompanyWritable(auth)
  const supabase = requireServiceClient()
  const result = await confirmSendByToken(supabase, auth.company_id, input.confirmation_token)

  if (!result.ok) {
    const msg =
      result.error === 'not_found'
        ? 'This confirmation has expired or was already used — draft the message again.'
        : explainSendGateRefusal(result.error)
    throw invalidInput(msg)
  }

  return jsonContent({ ok: true, message: 'Sent.' })
}

// ── check_job_status ─────────────────────────────────────────────────────────

const INNGEST_CLOUD_API = 'https://api.inngest.com/v1'
const INNGEST_DEV_API = 'http://localhost:8288/v1'

function isInngestDevMode(): boolean {
  const flag = process.env.INNGEST_DEV
  return flag === '1' || flag === 'true'
}

/**
 * Normalize Inngest run status strings to the stable shape we surface to the
 * LLM. Inngest's REST API returns "Running" / "Completed" / "Failed" /
 * "Cancelled" with capitalized first letter — we lowercase + collapse to the
 * 4 buckets the MCP contract advertises.
 */
function normalizeStatus(
  raw: string | undefined,
): 'queued' | 'running' | 'complete' | 'failed' {
  const s = (raw ?? '').toLowerCase()
  if (s === 'completed' || s === 'complete' || s === 'succeeded') return 'complete'
  if (s === 'failed' || s === 'cancelled' || s === 'canceled') return 'failed'
  if (s === 'queued' || s === 'pending') return 'queued'
  // Default — Inngest emits "Running" for in-flight runs, and the route in
  // Phase 67 also returns "Running" when the event was accepted but the run
  // hasn't started yet.
  return 'running'
}

/**
 * Pull an estimate_id (if any) out of a completed Inngest run's output.
 * `generateEstimateForProject` resolves to the saved estimate row — its `id`
 * is what we surface to the LLM so it can immediately call
 * `get_estimate(estimate_id)`.
 */
function extractEstimateId(output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined
  const o = output as Record<string, unknown>
  if (typeof o.id === 'string') return o.id
  if (typeof o.estimate_id === 'string') return o.estimate_id
  if (o.estimate && typeof o.estimate === 'object') {
    const e = o.estimate as Record<string, unknown>
    if (typeof e.id === 'string') return e.id
  }
  return undefined
}

async function handleCheckJobStatus(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:read')
  const input = parseInput(checkJobStatusInput, args)

  const devMode = isInngestDevMode()
  const signingKey = process.env.INNGEST_SIGNING_KEY
  if (!devMode && !signingKey) {
    throw new Error('check_job_status: Inngest not configured')
  }

  const baseUrl = devMode ? INNGEST_DEV_API : INNGEST_CLOUD_API
  const headers: Record<string, string> = {}
  if (signingKey) headers.Authorization = `Bearer ${signingKey}`

  const res = await fetch(`${baseUrl}/events/${input.job_id}/runs`, {
    headers,
    cache: 'no-store',
  })

  if (res.status === 404) {
    throw notFound(`Job ${input.job_id} not found`)
  }
  if (!res.ok) {
    throw new Error(`check_job_status: Inngest API returned ${res.status}`)
  }

  const json = (await res.json()) as {
    data?: Array<{ status?: string; output?: unknown; error?: unknown }>
  }
  const run = json.data?.[0]

  if (!run) {
    // Event accepted but no run yet — treat as queued.
    return jsonContent({ job_id: input.job_id, status: 'queued' })
  }

  const status = normalizeStatus(run.status)
  const result: {
    job_id: string
    status: 'queued' | 'running' | 'complete' | 'failed'
    result?: { estimate_id: string }
    error?: string
  } = { job_id: input.job_id, status }

  if (status === 'complete') {
    const estimateId = extractEstimateId(run.output)
    if (estimateId) result.result = { estimate_id: estimateId }
  } else if (status === 'failed') {
    const err = run.error
    result.error = typeof err === 'string' ? err : JSON.stringify(err ?? 'unknown')
  }

  return jsonContent(result)
}

// ── Builder ──────────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  CREATE_ESTIMATE_DEFINITION,
  CREATE_PROJECT_DEFINITION,
  ADD_SERVICE_DEFINITION,
  ADD_KNOWLEDGE_DEFINITION,
  DRAFT_CUSTOMER_MESSAGE_DEFINITION,
  SEND_CUSTOMER_MESSAGE_DEFINITION,
  CHECK_JOB_STATUS_DEFINITION,
] as const

/**
 * Build the write-side MCP tool entries (create_estimate, add_service,
 * add_knowledge, check_job_status) for the given auth context. Wired into
 * `registerAllTools` alongside `buildReadTools` in `lib/mcp/tools/registry.ts`.
 */
export function buildWriteTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    {
      definition: CREATE_ESTIMATE_DEFINITION,
      handler: (args) => handleCreateEstimate(auth, args),
    },
    {
      definition: CREATE_PROJECT_DEFINITION,
      handler: (args) => handleCreateProject(auth, args),
    },
    {
      definition: ADD_SERVICE_DEFINITION,
      handler: (args) => handleAddService(auth, args),
    },
    {
      definition: ADD_KNOWLEDGE_DEFINITION,
      handler: (args) => handleAddKnowledge(auth, args),
    },
    {
      definition: DRAFT_CUSTOMER_MESSAGE_DEFINITION,
      handler: (args) => handleDraftCustomerMessage(auth, args),
    },
    {
      definition: SEND_CUSTOMER_MESSAGE_DEFINITION,
      handler: (args) => handleSendCustomerMessage(auth, args),
    },
    {
      definition: CHECK_JOB_STATUS_DEFINITION,
      handler: (args) => handleCheckJobStatus(auth, args),
    },
  ]
}

// Exported for tests — let unit tests exec handlers without spinning up a
// Server or the Inngest HTTP transport.
export const __testing = {
  TOOL_DEFINITIONS,
  CREATE_ESTIMATE_DEFINITION,
  CREATE_PROJECT_DEFINITION,
  ADD_SERVICE_DEFINITION,
  ADD_KNOWLEDGE_DEFINITION,
  DRAFT_CUSTOMER_MESSAGE_DEFINITION,
  SEND_CUSTOMER_MESSAGE_DEFINITION,
  CHECK_JOB_STATUS_DEFINITION,
  handleCreateEstimate,
  handleCreateProject,
  handleAddService,
  handleAddKnowledge,
  handleDraftCustomerMessage,
  handleSendCustomerMessage,
  handleCheckJobStatus,
  createEstimateInput,
  createProjectInput,
  addServiceInput,
  addKnowledgeInput,
  draftCustomerMessageInput,
  sendCustomerMessageInput,
  checkJobStatusInput,
  normalizeStatus,
  extractEstimateId,
}
