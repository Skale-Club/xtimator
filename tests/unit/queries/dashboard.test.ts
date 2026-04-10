import { describe, it, expect, vi } from 'vitest'
import { getDashboardStats, getProjects } from '@/lib/queries/dashboard'

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaults = {
    projectsCount: 0,
    pendingCount: 0,
    acceptedCount: 0,
    acceptedTotals: [] as { total: number }[],
    projects: [] as Record<string, unknown>[],
  }
  const opts = { ...defaults, ...overrides }

  // Track which .from() table is being queried
  let currentTable = ''

  const mockFrom = vi.fn((table: string) => {
    currentTable = table
    return mockSelect
  })

  const mockSelect: Record<string, unknown> = {
    select: vi.fn(() => mockSelect),
    eq: vi.fn((_col: string, _val: unknown) => mockSelect),
    in: vi.fn(() => mockSelect),
    order: vi.fn(() => {
      // Final call for getProjects
      if (currentTable === 'projects') {
        return Promise.resolve({ data: opts.projects })
      }
      return mockSelect
    }),
    single: vi.fn(() => Promise.resolve({ data: null })),
    then: undefined as unknown,
  }

  // Make select resolve differently based on context
  const originalSelect = mockSelect.select as ReturnType<typeof vi.fn>
  originalSelect.mockImplementation((_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
    if (selectOpts?.head && selectOpts?.count === 'exact') {
      // Count queries — return based on current table
      const countChain: Record<string, unknown> = {
        eq: vi.fn(() => countChain),
        in: vi.fn(() => {
          // pendingEstimates
          return Promise.resolve({ count: opts.pendingCount })
        }),
      }
      countChain.eq = vi.fn((_col: string, val: unknown) => {
        if (currentTable === 'projects') {
          return Promise.resolve({ count: opts.projectsCount })
        }
        if (val === 'accepted') {
          return Promise.resolve({ count: opts.acceptedCount })
        }
        return countChain
      })
      return countChain
    }

    if (currentTable === 'estimates') {
      // Revenue query
      const revenueChain: Record<string, unknown> = {
        eq: vi.fn(() => revenueChain),
      }
      // Last .eq resolves with data
      let eqCallCount = 0
      revenueChain.eq = vi.fn(() => {
        eqCallCount++
        if (eqCallCount >= 3) {
          return Promise.resolve({ data: opts.acceptedTotals })
        }
        return revenueChain
      })
      return revenueChain
    }

    // getProjects select with joins
    const projectChain: Record<string, unknown> = {
      eq: vi.fn(() => projectChain),
      order: vi.fn(() => Promise.resolve({ data: opts.projects })),
    }
    return projectChain
  })

  return { from: mockFrom } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getDashboardStats', () => {
  it('returns zero counts when no data', async () => {
    const supabase = createMockSupabase()
    const stats = await getDashboardStats(supabase, 'company-1')

    expect(stats.totalProjects).toBe(0)
    expect(stats.pendingEstimates).toBe(0)
    expect(stats.acceptedEstimates).toBe(0)
    expect(stats.totalRevenue).toBe(0)
  })

  it('computes totalRevenue as sum of accepted estimate totals', async () => {
    const supabase = createMockSupabase({
      projectsCount: 5,
      pendingCount: 2,
      acceptedCount: 3,
      acceptedTotals: [{ total: 1000 }, { total: 2500 }, { total: 500 }],
    })
    const stats = await getDashboardStats(supabase, 'company-1')

    expect(stats.totalProjects).toBe(5)
    expect(stats.totalRevenue).toBe(4000)
  })
})

describe('getProjects', () => {
  it('returns empty array when no projects', async () => {
    const supabase = createMockSupabase({ projects: [] })
    const projects = await getProjects(supabase, 'company-1')
    expect(projects).toEqual([])
  })

  it('returns projects with client data', async () => {
    const mockProjects = [
      { id: '1', name: 'Proj 1', project_type: 'renovation', status: 'draft', total: 5000, created_at: '2026-01-01', client: { id: 'c1', name: 'Client A' } },
      { id: '2', name: 'Proj 2', project_type: null, status: 'sent', total: 0, created_at: '2026-01-02', client: null },
    ]
    const supabase = createMockSupabase({ projects: mockProjects })
    const projects = await getProjects(supabase, 'company-1')

    expect(projects).toHaveLength(2)
    expect(projects[0].name).toBe('Proj 1')
    expect(projects[0].client?.name).toBe('Client A')
    expect(projects[1].client).toBeNull()
  })
})
