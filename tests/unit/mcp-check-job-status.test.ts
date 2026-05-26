// tests/unit/mcp-check-job-status.test.ts
// Phase 89: contract tests for the `check_job_status` MCP tool.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock inngest client so write.ts can load without making network calls.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn().mockResolvedValue({ ids: ['evt_stub'] }) },
}))

// Mock supabase service client (handler doesn't call it but the module loads it).
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}))

import { __testing } from '@/lib/mcp/tools/write'
import type { McpAuthContext } from '@/lib/mcp/auth'

const { handleCheckJobStatus, normalizeStatus, extractEstimateId } = __testing

const AUTH_READ: McpAuthContext = {
  client_id: 'c',
  user_id: 'u',
  company_id: 'co',
  scope: ['mcp:read'],
}

const AUTH_NO_READ: McpAuthContext = {
  ...AUTH_READ,
  scope: ['mcp:write'],
}

let fetchMock: ReturnType<typeof vi.fn>
const originalFetch = globalThis.fetch
const originalDev = process.env.INNGEST_DEV
const originalKey = process.env.INNGEST_SIGNING_KEY

beforeEach(() => {
  fetchMock = vi.fn()
  // Use dev mode so we don't need a signing key configured in CI.
  process.env.INNGEST_DEV = '1'
  delete process.env.INNGEST_SIGNING_KEY
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDev === undefined) delete process.env.INNGEST_DEV
  else process.env.INNGEST_DEV = originalDev
  if (originalKey === undefined) delete process.env.INNGEST_SIGNING_KEY
  else process.env.INNGEST_SIGNING_KEY = originalKey
})

function readContent(result: unknown): unknown {
  const r = result as { content: Array<{ type: string; text: string }> }
  expect(r.content[0]!.type).toBe('text')
  return JSON.parse(r.content[0]!.text)
}

function fetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

// ── Scope gate ───────────────────────────────────────────────────────────────

describe('check_job_status — scope gate', () => {
  it('throws insufficient_scope when the token lacks mcp:read', async () => {
    await expect(
      handleCheckJobStatus(AUTH_NO_READ, { job_id: 'evt_x' }),
    ).rejects.toMatchObject({ data: { kind: 'insufficient_scope' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ── Input validation ─────────────────────────────────────────────────────────

describe('check_job_status — input validation', () => {
  it('rejects missing job_id', async () => {
    await expect(handleCheckJobStatus(AUTH_READ, {})).rejects.toMatchObject({
      data: { kind: 'invalid_input' },
    })
  })

  it('rejects empty job_id', async () => {
    await expect(
      handleCheckJobStatus(AUTH_READ, { job_id: '' }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
  })
})

// ── Inngest lookup contract ──────────────────────────────────────────────────

describe('check_job_status — Inngest lookup', () => {
  it('calls the Inngest dev API by event id', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ data: [] }))
    await handleCheckJobStatus(AUTH_READ, { job_id: 'evt_abc' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0]![0] as string
    expect(url).toBe('http://localhost:8288/v1/events/evt_abc/runs')
  })

  it('returns queued when Inngest has no run row yet', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ data: [] }))
    const res = await handleCheckJobStatus(AUTH_READ, { job_id: 'evt_abc' })
    const body = readContent(res) as { job_id: string; status: string }
    expect(body.job_id).toBe('evt_abc')
    expect(body.status).toBe('queued')
  })

  it('throws not_found when Inngest returns 404', async () => {
    fetchMock.mockResolvedValue(fetchResponse({ error: 'nope' }, 404))
    await expect(
      handleCheckJobStatus(AUTH_READ, { job_id: 'evt_missing' }),
    ).rejects.toMatchObject({ data: { kind: 'not_found' } })
  })
})

// ── Status normalization ─────────────────────────────────────────────────────

describe('check_job_status — status normalization', () => {
  it('maps "Running" to running', () => {
    expect(normalizeStatus('Running')).toBe('running')
  })
  it('maps "Completed" to complete', () => {
    expect(normalizeStatus('Completed')).toBe('complete')
  })
  it('maps "Failed" to failed', () => {
    expect(normalizeStatus('Failed')).toBe('failed')
  })
  it('maps "Cancelled" to failed', () => {
    expect(normalizeStatus('Cancelled')).toBe('failed')
  })
  it('maps "Queued" / "Pending" to queued', () => {
    expect(normalizeStatus('Queued')).toBe('queued')
    expect(normalizeStatus('Pending')).toBe('queued')
  })
  it('defaults unknown statuses to running', () => {
    expect(normalizeStatus('Mystery')).toBe('running')
    expect(normalizeStatus(undefined)).toBe('running')
  })
})

describe('extractEstimateId', () => {
  it('reads id off the top-level output', () => {
    expect(extractEstimateId({ id: 'est_1' })).toBe('est_1')
  })
  it('reads estimate_id off the output', () => {
    expect(extractEstimateId({ estimate_id: 'est_2' })).toBe('est_2')
  })
  it('reads nested estimate.id', () => {
    expect(extractEstimateId({ estimate: { id: 'est_3' } })).toBe('est_3')
  })
  it('returns undefined for null / non-objects / no id', () => {
    expect(extractEstimateId(null)).toBeUndefined()
    expect(extractEstimateId(undefined)).toBeUndefined()
    expect(extractEstimateId('nope')).toBeUndefined()
    expect(extractEstimateId({})).toBeUndefined()
  })
})

// ── End-to-end shape ─────────────────────────────────────────────────────────

describe('check_job_status — end-to-end response shape', () => {
  it('completed run surfaces the estimate_id in result', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({
        data: [{ status: 'Completed', output: { id: 'est_xyz' } }],
      }),
    )
    const res = await handleCheckJobStatus(AUTH_READ, { job_id: 'evt_ok' })
    const body = readContent(res) as {
      job_id: string
      status: string
      result?: { estimate_id: string }
    }
    expect(body.status).toBe('complete')
    expect(body.result?.estimate_id).toBe('est_xyz')
  })

  it('failed run surfaces the error string', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({ data: [{ status: 'Failed', error: 'quota_exceeded' }] }),
    )
    const res = await handleCheckJobStatus(AUTH_READ, { job_id: 'evt_bad' })
    const body = readContent(res) as { status: string; error?: string }
    expect(body.status).toBe('failed')
    expect(body.error).toContain('quota_exceeded')
  })

  it('running run returns status only', async () => {
    fetchMock.mockResolvedValue(
      fetchResponse({ data: [{ status: 'Running', output: null }] }),
    )
    const res = await handleCheckJobStatus(AUTH_READ, { job_id: 'evt_run' })
    const body = readContent(res) as {
      job_id: string
      status: string
      result?: unknown
      error?: unknown
    }
    expect(body.status).toBe('running')
    expect(body.result).toBeUndefined()
    expect(body.error).toBeUndefined()
  })
})
