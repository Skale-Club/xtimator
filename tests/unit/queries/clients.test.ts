import { describe, it, expect, vi } from 'vitest'
import { getClients, getClientById, getClientProjects } from '@/lib/queries/clients'

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const defaults = {
    clients: [] as Record<string, unknown>[],
    projects: [] as Record<string, unknown>[],
    clientDetail: null as Record<string, unknown> | null,
    projectCount: 0,
  }
  const opts = { ...defaults, ...overrides }

  let currentTable = ''

  const from = vi.fn((table: string) => {
    currentTable = table
    const chain: Record<string, unknown> = {
      select: vi.fn((_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
        if (selectOpts?.head && selectOpts?.count === 'exact') {
          const countChain: Record<string, unknown> = {
            eq: vi.fn(() => Promise.resolve({ count: opts.projectCount })),
          }
          return countChain
        }

        if (currentTable === 'clients') {
          const clientChain: Record<string, unknown> = {
            eq: vi.fn(() => clientChain),
            order: vi.fn(() => Promise.resolve({ data: opts.clients })),
            single: vi.fn(() => Promise.resolve({ data: opts.clientDetail })),
          }
          return clientChain
        }

        // projects
        const projChain: Record<string, unknown> = {
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: opts.projects })),
            then: (resolve: (val: unknown) => void) => resolve({ data: opts.projects }),
          })),
          order: vi.fn(() => Promise.resolve({ data: opts.projects })),
        }
        return projChain
      }),
    }
    return chain
  })

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getClients', () => {
  it('returns empty array when no clients', async () => {
    const supabase = createMockSupabase({ clients: [] })
    const clients = await getClients(supabase, 'company-1')
    expect(clients).toEqual([])
  })

  it('returns clients with project_count field', async () => {
    const mockClients = [
      { id: 'c1', name: 'Alice', email: 'a@b.com', phone: null, logo_url: null, created_at: '2026-01-01' },
    ]
    const mockProjects = [
      { client_id: 'c1' },
      { client_id: 'c1' },
    ]
    const supabase = createMockSupabase({ clients: mockClients, projects: mockProjects })
    const clients = await getClients(supabase, 'company-1')

    expect(clients).toHaveLength(1)
    expect(clients[0].project_count).toBe(2)
    expect(clients[0].name).toBe('Alice')
  })
})

describe('getClientById', () => {
  it('returns null when client not found', async () => {
    const supabase = createMockSupabase({ clientDetail: null })
    const client = await getClientById(supabase, 'nonexistent')
    expect(client).toBeNull()
  })

  it('returns client detail with project count', async () => {
    const detail = { id: 'c1', name: 'Bob', email: null, phone: null, logo_url: null, created_at: '2026-01-01', address: '123 Main', city: 'NYC', state: 'NY', zip: '10001', notes: 'VIP' }
    const supabase = createMockSupabase({ clientDetail: detail, projectCount: 3 })
    const client = await getClientById(supabase, 'c1')

    expect(client).not.toBeNull()
    expect(client!.name).toBe('Bob')
    expect(client!.project_count).toBe(3)
  })
})

describe('getClientProjects', () => {
  it('returns projects for given client', async () => {
    const mockProjects = [
      { id: 'p1', name: 'Proj', project_type: 'repair', status: 'draft', total: 100, created_at: '2026-01-01' },
    ]
    const supabase = createMockSupabase({ projects: mockProjects })
    const projects = await getClientProjects(supabase, 'c1')

    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('Proj')
  })
})
