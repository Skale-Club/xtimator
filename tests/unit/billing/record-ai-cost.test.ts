import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * COST-03 / CALIB-01: recordAICost helper contract.
 *
 * Mirrors recordPipelineEvent (tests/unit/observability/record-pipeline-event.test.ts):
 *   (a) maps the camelCase AICostInput → snake_case ai_cost_events row and calls
 *       .from('ai_cost_events').insert(...) via requireServiceClient()
 *   (b) null vs 0 discipline: realCostUsd: null is persisted as null, NEVER coerced to 0
 *   (c) BEST-EFFORT (never-throw): when .insert() rejects, the call RESOLVES (never throws)
 *       and console.warn is called
 *   (d) optional fields absent → mapped to null (never undefined) in the insert payload
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { recordAICost } from '@/lib/billing/record-ai-cost'
import { requireServiceClient } from '@/lib/supabase/service'

const mockRequireServiceClient = vi.mocked(requireServiceClient)

const captured: { insertRow?: Record<string, unknown> } = {}

/**
 * Chainable supabase mock: `.from('ai_cost_events').insert(row)` captures the row
 * and resolves, unless insertRejects is set (then it rejects).
 */
function makeServiceMock(opts: { insertRejects?: boolean } = {}) {
  const { insertRejects = false } = opts
  const insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    captured.insertRow = row
    return insertRejects
      ? Promise.reject(new Error('insert failed'))
      : Promise.resolve({ data: null, error: null })
  })
  const from = vi.fn().mockReturnValue({ insert })
  return { from } as unknown as ReturnType<typeof requireServiceClient>
}

const baseInput = {
  attemptId: 'attempt-1',
  operationType: 'estimate' as const,
  provider: 'openrouter' as const,
  realCostUsd: 0.0123 as number | null,
  companyId: 'company-1',
  projectId: 'project-1',
  estimateId: 'estimate-1',
  model: 'anthropic/claude-sonnet-4',
  units: 3,
}

describe('COST-03/CALIB-01: recordAICost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captured.insertRow = undefined
  })

  it('inserts the snake_case ai_cost_events shape via the service client', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await recordAICost(baseInput)

    const fromMock = vi.mocked((svc as unknown as { from: ReturnType<typeof vi.fn> }).from)
    expect(fromMock).toHaveBeenCalledWith('ai_cost_events')
    expect(captured.insertRow).toMatchObject({
      attempt_id: 'attempt-1',
      operation_type: 'estimate',
      provider: 'openrouter',
      real_cost_usd: 0.0123,
      company_id: 'company-1',
      project_id: 'project-1',
      estimate_id: 'estimate-1',
      model: 'anthropic/claude-sonnet-4',
      units: 3,
    })
  })

  it('persists realCostUsd: null as null (null vs 0 discipline — NEVER coerced to 0)', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await recordAICost({ ...baseInput, realCostUsd: null })

    expect(captured.insertRow?.real_cost_usd).toBeNull()
    expect(captured.insertRow?.real_cost_usd).not.toBe(0)
  })

  it('is best-effort (never-throw): resolves and warns when the insert rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeServiceMock({ insertRejects: true })
    mockRequireServiceClient.mockReturnValue(svc)

    await expect(recordAICost(baseInput)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('maps absent optional fields to null (never undefined) in the insert payload', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await recordAICost({
      attemptId: 'attempt-2',
      operationType: 'audio_minutes',
      provider: 'openai',
      realCostUsd: null,
    })

    const row = captured.insertRow!
    for (const key of ['company_id', 'project_id', 'estimate_id', 'model', 'units']) {
      expect(row[key], `expected ${key} to be null`).toBeNull()
      expect(row[key], `expected ${key} to not be undefined`).not.toBeUndefined()
    }
  })
})
