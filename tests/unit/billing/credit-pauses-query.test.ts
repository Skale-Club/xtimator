import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Credits plan 2026-11-20 - getPausedCaptures: a pause is live while its
 * awaiting_credits row is the attempt's latest row and its expiry is ahead;
 * withPausedStatus marks those projects for the badge.
 */

type Ev = { attempt_id: string; project_id: string | null; error_code: string | null; created_at: string; metadata: Record<string, unknown> | null }
let events: Ev[] = []

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      select: (cols: string) => {
        if (cols === 'attempt_id') {
          return {
            eq: () => ({
              eq: () => ({
                gte: () => ({ limit: async () => ({ data: events.filter((e) => e.error_code === 'awaiting_credits') }) }),
              }),
            }),
          }
        }
        return {
          in: (_c: string, ids: string[]) => ({
            order: async () => ({
              data: events.filter((e) => ids.includes(e.attempt_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
            }),
          }),
        }
      },
    }),
  }),
}))

const { getPausedCaptures, withPausedStatus } = await import('@/lib/queries/credit-pauses')

const future = new Date(Date.now() + 3 * 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()
const pause = (attempt: string, project: string, at: string, expiresAt = future, next = 'generate_estimate'): Ev => ({
  attempt_id: attempt, project_id: project, error_code: 'awaiting_credits', created_at: at, metadata: { expiresAt, next },
})

beforeEach(() => {
  events = []
})

describe('getPausedCaptures', () => {
  it('returns a pause that is the attempt\'s latest row and not expired', async () => {
    events = [pause('a1', 'p1', '2026-11-20T10:00:00Z', future, 'analyze')]
    expect(await getPausedCaptures('co-x1')).toEqual([{ attemptId: 'a1', projectId: 'p1', expiresAt: future, next: 'analyze' }])
  })

  it('ignores a pause followed by a resume row', async () => {
    events = [
      pause('a2', 'p2', '2026-11-20T10:00:00Z'),
      { attempt_id: 'a2', project_id: 'p2', error_code: null, created_at: '2026-11-20T11:00:00Z', metadata: { resumed: true } },
    ]
    expect(await getPausedCaptures('co-x2')).toEqual([])
  })

  it('ignores an expired pause', async () => {
    events = [pause('a3', 'p3', '2026-11-10T10:00:00Z', past)]
    expect(await getPausedCaptures('co-x3')).toEqual([])
  })

  it('never throws: a read failure means no pauses', async () => {
    events = null as unknown as Ev[]
    expect(await getPausedCaptures('co-x4')).toEqual([])
  })
})

describe('withPausedStatus', () => {
  it('marks only the paused projects with the virtual awaiting_credits status', () => {
    const projects = [
      { id: 'p1', status: 'draft', name: 'A' },
      { id: 'p2', status: 'estimate_ready', name: 'B' },
    ]
    const out = withPausedStatus(projects, [{ attemptId: 'a', projectId: 'p1', expiresAt: future, next: 'generate_estimate' }])
    expect(out.map((p) => p.status)).toEqual(['awaiting_credits', 'estimate_ready'])
    // The badge opens the paused sheet for that attempt.
    expect(out[0].paused_attempt_id).toBe('a')
    expect(out[1].paused_attempt_id).toBeUndefined()
    expect(projects[0].status).toBe('draft')
  })

  it('returns the same list when nothing is paused', () => {
    const projects = [{ id: 'p1', status: 'draft' }]
    expect(withPausedStatus(projects, [])).toBe(projects)
  })
})
