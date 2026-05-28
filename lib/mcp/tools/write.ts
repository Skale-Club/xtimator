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
//   2. Estimate generation is async. `create_estimate` triggers the existing
//      Inngest pipeline (`EVENT_ESTIMATE_GENERATE` → `generate-estimate`
//      function — the same path used by `/api/generate-estimate` from the web
//      app) and returns the Inngest event id as `job_id` immediately. The LLM
//      then polls `check_job_status(job_id)` until the run completes.
//
// `check_job_status` is read-only (idempotentHint: true) and reads from
// Inngest's REST `/v1/events/{eventId}/runs` endpoint via the same code path
// as `/api/jobs/[jobId]` (Phase 67 / INNGEST-05) — we don't add a parallel
// "MCP-specific" job table.

import 'server-only'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { requireScope } from '@/lib/mcp/scope'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'
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

const checkJobStatusInput = z.object({
  job_id: z.string().min(1),
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

// ── create_estimate ──────────────────────────────────────────────────────────

async function handleCreateEstimate(
  auth: McpAuthContext,
  args: unknown,
): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')
  const input = parseInput(createEstimateInput, args)

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

  // Dispatch to Inngest. The web app's /api/generate-estimate uses the same
  // event name + payload shape; we follow that contract verbatim so retries,
  // notifications, and quota recording all flow through the existing pipeline.
  //
  // 2026-05-27 (Phase 89 deferral closed): `prompt` is now forwarded to the
  // EstimateGeneratePayload as `prompts: [prompt]`. The underlying service
  // `generateEstimateForProject` consumes this as an additional input modality
  // alongside transcripts + photos, and the prompt-builder renders it under
  // a "## Description" section in the user content sent to the AI provider.
  // Projects without transcripts/photos can now produce an estimate from the
  // prompt alone — which is the core MCP create_estimate UX.
  const requestId = randomUUID()
  const payload: EstimateGeneratePayload = {
    companyId: auth.company_id,
    projectId: input.project_id,
    requestId,
    prompts: [input.prompt],
    ...(input.language ? { language: input.language } : {}),
  }
  const { ids } = await inngest.send({
    name: EVENT_ESTIMATE_GENERATE,
    id: `estimate-mcp-${input.project_id}-${requestId}`,
    data: payload,
  })

  const jobId = ids[0]
  if (!jobId) {
    throw new Error('create_estimate: inngest.send returned no event id')
  }

  return jsonContent({
    job_id: jobId,
    status: 'queued',
    message:
      'Estimate generation queued. Poll check_job_status to track progress.',
  })
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
  CHECK_JOB_STATUS_DEFINITION,
] as const

/**
 * Build the 2 write-side MCP tool entries (create_estimate, check_job_status)
 * for the given auth context. Wired into `registerAllTools` alongside
 * `buildReadTools` in `lib/mcp/tools/registry.ts`.
 */
export function buildWriteTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    {
      definition: CREATE_ESTIMATE_DEFINITION,
      handler: (args) => handleCreateEstimate(auth, args),
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
  CHECK_JOB_STATUS_DEFINITION,
  handleCreateEstimate,
  handleCheckJobStatus,
  createEstimateInput,
  checkJobStatusInput,
  normalizeStatus,
  extractEstimateId,
}
