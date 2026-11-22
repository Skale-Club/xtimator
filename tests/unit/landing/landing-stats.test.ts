import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/demo/config', () => ({ getDemoCompanyId: () => 'demo-co' }))
const createServiceClient = vi.fn()
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => createServiceClient() }))

import { getLandingStats, computeMedianCaptureMinutes, type CaptureEventRow } from '@/lib/landing/stats'

type Res = { data?: unknown; error?: unknown; count?: number }

function fakeClient(tables: {
  quota?: Res
  demo_config?: Res
  estimates?: Res
  estimatesCount?: Res
  pipeline_events?: Res
}) {
  const notCalls: unknown[][] = []
  const from = (table: string) => {
    let head = false
    const chain: Record<string, unknown> = {}
    const result = (): Res => {
      if (table === 'companies') return tables.quota ?? { data: [] }
      if (table === 'demo_config') return tables.demo_config ?? { data: [] }
      if (table === 'estimates') return head ? (tables.estimatesCount ?? { count: 0 }) : (tables.estimates ?? { data: [] })
      return tables.pipeline_events ?? { data: [] }
    }
    for (const m of ['not', 'or', 'order', 'range', 'in', 'gte', 'limit']) {
      chain[m] = (...args: unknown[]) => {
        if (m === 'not') notCalls.push(args)
        return chain
      }
    }
    chain.select = (_cols: string, opts?: { head?: boolean }) => {
      head = !!opts?.head
      return chain
    }
    chain.then = (resolve: (v: Res) => unknown) => resolve({ error: null, ...result() })
    return chain
  }
  return { client: { from }, notCalls }
}

const ev = (attempt: string, step: string, status: string, iso: string, company: string | null = 'c1'): CaptureEventRow => ({
  attempt_id: attempt,
  company_id: company,
  step,
  status,
  created_at: iso,
})
const attempt = (id: string, startMin: number, endMin: number, company = 'c1') => [
  ev(id, 'save_recording', 'started', new Date(Date.UTC(2026, 10, 1, 10, startMin)).toISOString(), company),
  ev(id, 'generate_estimate', 'succeeded', new Date(Date.UTC(2026, 10, 1, 10, endMin)).toISOString(), company),
]

describe('getLandingStats', () => {
  beforeEach(() => {
    createServiceClient.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('counts contractors with estimates, excluding demo companies, plus sent estimates and median', async () => {
    const { client, notCalls } = fakeClient({
      quota: { data: [{ id: 'street-demo' }] },
      demo_config: { data: [{ company_id: 'cfg-demo' }] },
      estimates: {
        data: [
          { company_id: 'a' },
          { company_id: 'a' },
          { company_id: 'b' },
          { company_id: 'demo-co' },
          { company_id: 'street-demo' },
          { company_id: 'cfg-demo' },
          { company_id: null },
        ],
      },
      estimatesCount: { count: 7 },
      pipeline_events: {
        data: [...attempt('1', 0, 2), ...attempt('2', 0, 4), ...attempt('3', 0, 6), ...attempt('4', 0, 3, 'demo-co')],
      },
    })
    createServiceClient.mockReturnValue(client)
    const stats = await getLandingStats()
    expect(stats).toEqual({ contractors: 2, estimatesSent: 7, medianMinutes: 4 })
    const excludedArg = String(notCalls.find((c) => c[0] === 'company_id')?.[2])
    for (const id of ['demo-co', 'street-demo', 'cfg-demo']) expect(excludedArg).toContain(id)
  })

  it('omits zero values and a too-thin median', async () => {
    const { client } = fakeClient({
      estimates: { data: [] },
      estimatesCount: { count: 0 },
      pipeline_events: { data: attempt('1', 0, 2) },
    })
    createServiceClient.mockReturnValue(client)
    expect(await getLandingStats()).toEqual({ contractors: null, estimatesSent: null, medianMinutes: null })
  })

  it('returns null when a read fails or the client is unavailable', async () => {
    const { client } = fakeClient({ estimatesCount: { error: { message: 'down' } } })
    createServiceClient.mockReturnValue(client)
    expect(await getLandingStats()).toBeNull()
    createServiceClient.mockReturnValue(null)
    expect(await getLandingStats()).toBeNull()
  })
})

describe('computeMedianCaptureMinutes', () => {
  it('ignores abandoned attempts longer than 20 minutes and attempts without a result', () => {
    const rows = [
      ...attempt('1', 0, 3),
      ...attempt('2', 0, 3),
      ...attempt('3', 0, 3),
      ...attempt('4', 0, 45),
      ev('5', 'save_recording', 'started', '2026-11-01T10:00:00Z'),
    ]
    expect(computeMedianCaptureMinutes(rows)).toBe(3)
  })
})
