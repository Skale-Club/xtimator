// tests/unit/mcp-create-estimate.test.ts
// Phase 89: contract tests for the `create_estimate` MCP tool.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Supabase service client — a tiny per-test shim that returns whatever the
// test queued for the `projects` table.
let projectsResponse: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from(_table: string) {
      return {
        select(_cols: string) {
          return this
        },
        eq(_col: string, _val: unknown) {
          return this
        },
        maybeSingle() {
          return Promise.resolve(projectsResponse)
        },
      }
    },
  }),
}))

// Inngest client — capture every send().
const inngestSend = vi.fn().mockResolvedValue({ ids: ['evt_test_abc123'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => inngestSend(...args) },
}))

import { __testing } from '@/lib/mcp/tools/write'
import type { McpAuthContext } from '@/lib/mcp/auth'

const { handleCreateEstimate } = __testing

const AUTH_WRITE: McpAuthContext = {
  client_id: 'c',
  user_id: 'u',
  company_id: 'co_target',
  scope: ['mcp:read', 'mcp:write'],
}

const AUTH_READ_ONLY: McpAuthContext = {
  ...AUTH_WRITE,
  scope: ['mcp:read'],
}

beforeEach(() => {
  inngestSend.mockClear()
  projectsResponse = { data: null, error: null }
})

function readContent(result: unknown): unknown {
  const r = result as { content: Array<{ type: string; text: string }> }
  expect(r.content[0]!.type).toBe('text')
  return JSON.parse(r.content[0]!.text)
}

// ── Scope gate ───────────────────────────────────────────────────────────────

describe('create_estimate — scope gate', () => {
  it('throws insufficient_scope when the token lacks mcp:write', async () => {
    await expect(
      handleCreateEstimate(AUTH_READ_ONLY, {
        project_id: 'p1',
        prompt: 'deck rebuild',
      }),
    ).rejects.toMatchObject({ data: { kind: 'insufficient_scope' } })
    expect(inngestSend).not.toHaveBeenCalled()
  })
})

// ── Input validation ─────────────────────────────────────────────────────────

describe('create_estimate — input validation', () => {
  it('rejects empty prompt', async () => {
    await expect(
      handleCreateEstimate(AUTH_WRITE, { project_id: 'p1', prompt: '' }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
  })

  it('rejects prompt > 5000 chars', async () => {
    await expect(
      handleCreateEstimate(AUTH_WRITE, {
        project_id: 'p1',
        prompt: 'x'.repeat(5001),
      }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
  })

  it('rejects unsupported language', async () => {
    projectsResponse = { data: { id: 'p1', company_id: 'co_target' }, error: null }
    await expect(
      handleCreateEstimate(AUTH_WRITE, {
        project_id: 'p1',
        prompt: 'hi',
        language: 'fr',
      } as unknown),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
  })
})

// ── Tenant boundary ──────────────────────────────────────────────────────────

describe('create_estimate — tenant boundary', () => {
  it('throws not_found when the project belongs to a different company', async () => {
    projectsResponse = {
      data: { id: 'p_other', company_id: 'co_someone_else' },
      error: null,
    }
    await expect(
      handleCreateEstimate(AUTH_WRITE, {
        project_id: 'p_other',
        prompt: 'deck rebuild',
      }),
    ).rejects.toMatchObject({ data: { kind: 'not_found' } })
    expect(inngestSend).not.toHaveBeenCalled()
  })

  it('throws not_found when the project does not exist', async () => {
    projectsResponse = { data: null, error: null }
    await expect(
      handleCreateEstimate(AUTH_WRITE, {
        project_id: 'p_missing',
        prompt: 'deck rebuild',
      }),
    ).rejects.toMatchObject({ data: { kind: 'not_found' } })
    expect(inngestSend).not.toHaveBeenCalled()
  })
})

// ── Happy path ───────────────────────────────────────────────────────────────

describe('create_estimate — happy path', () => {
  beforeEach(() => {
    projectsResponse = {
      data: { id: 'p1', company_id: 'co_target' },
      error: null,
    }
  })

  it('returns { job_id, status: queued } with the Inngest event id', async () => {
    const result = await handleCreateEstimate(AUTH_WRITE, {
      project_id: 'p1',
      prompt: 'deck rebuild',
    })
    const body = readContent(result) as {
      job_id: string
      status: string
      message: string
    }
    expect(body.job_id).toBe('evt_test_abc123')
    expect(body.status).toBe('queued')
    expect(body.message).toMatch(/check_job_status/i)
  })

  it('calls inngest.send with the EVENT_ESTIMATE_GENERATE event and correct payload', async () => {
    await handleCreateEstimate(AUTH_WRITE, {
      project_id: 'p1',
      prompt: 'deck rebuild',
    })
    expect(inngestSend).toHaveBeenCalledTimes(1)
    const call = inngestSend.mock.calls[0]![0] as {
      name: string
      id: string
      data: { companyId: string; projectId: string; requestId: string }
    }
    expect(call.name).toBe('estimate/generate.requested')
    // Idempotency key includes the project id + a per-call requestId.
    expect(call.id).toMatch(/^estimate-mcp-p1-/)
    expect(call.data.companyId).toBe('co_target')
    expect(call.data.projectId).toBe('p1')
    expect(typeof call.data.requestId).toBe('string')
    expect(call.data.requestId.length).toBeGreaterThan(0)
  })

  it('forwards the optional language override', async () => {
    await handleCreateEstimate(AUTH_WRITE, {
      project_id: 'p1',
      prompt: 'deck rebuild',
      language: 'pt',
    })
    const call = inngestSend.mock.calls[0]![0] as { data: { language?: string } }
    expect(call.data.language).toBe('pt')
  })

  it('omits language from the payload when not provided', async () => {
    await handleCreateEstimate(AUTH_WRITE, {
      project_id: 'p1',
      prompt: 'deck rebuild',
    })
    const call = inngestSend.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect('language' in call.data).toBe(false)
  })
})
