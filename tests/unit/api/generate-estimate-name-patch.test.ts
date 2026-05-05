import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module-level mock function references
const anthropicCreateMock = vi.fn()
const supabaseFromMock = vi.fn()
const supabaseAuthGetClaimsMock = vi.fn()

// Captured tools argument for inspection
let capturedTools: unknown[] = []

// Auth client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Platform config
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

// Recording + Photo queries
vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))

vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

// next/cache - revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Anthropic SDK — captures tools arg
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: { tools?: unknown[] }) => {
        capturedTools = params.tools ?? []
        return anthropicCreateMock(params)
      },
    }
  },
}))

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { getIntegrationKey } from '@/lib/platform-config'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'

function makeRequest(projectId: string) {
  return new Request('http://localhost/api/generate-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
}

/**
 * Factory to build a supabase mock with configurable project name and update spy.
 */
function makeSupabaseMock(projectName: string) {
  const updateSpy = vi.fn()

  // Chain builder — each call returns an object with the next expected method
  const eqChain = (resolveWith: unknown) => ({
    eq: vi.fn().mockResolvedValue(resolveWith),
  })

  // single() is terminal
  function chainWithSingle(resolveWith: unknown) {
    return {
      single: vi.fn().mockResolvedValue(resolveWith),
    }
  }

  function eqThenSingle(resolveWith: unknown) {
    return {
      eq: vi.fn().mockReturnValue(chainWithSingle(resolveWith)),
    }
  }

  // The UPDATE chain: .update({...}).eq('id', projectId) → resolves void
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  updateSpy.mockReturnValue(updateChain)

  // Build from() dispatcher
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'company-1',
                industry: 'construction',
                default_tax_rate: 0,
                default_payment_terms: null,
                default_warranty_terms: null,
                name: 'Test Co',
              },
              error: null,
            }),
          }),
        }),
        // company select inside parallel Promise.all (with user_id)
      }
    }

    if (table === 'projects') {
      // Needs to handle multiple calls:
      // 1) Initial parallel SELECT for project info
      // 2) SELECT name (for the patch check)
      // 3) UPDATE { status, total } (Step 7)
      // 4) UPDATE { name } (name-patcher, conditional)
      let selectCallCount = 0
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            // This is the name-patch check
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { name: projectName },
                  error: null,
                }),
              }),
            }
          }
          // Default: full project fetch
          selectCallCount++
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'project-1',
                  name: projectName,
                  project_type: 'General',
                  target_budget: null,
                  client: { name: 'Smith', email: null, phone: null, address: null, city: null, state: null, zip: null },
                },
                error: null,
              }),
            }),
          }
        }),
        update: updateSpy,
      }
    }

    if (table === 'estimates') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'estimate-1' },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'section-1' },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_items') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    // Default fallback
    return {
      select: vi.fn().mockReturnValue(eqThenSingle({ data: null, error: null })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: updateSpy,
    }
  })

  return { fromMock, updateSpy }
}

describe('generate-estimate tool schema (D-05)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    capturedTools = []

    // Default: AI returns tool_use with suggested_project_name
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'create_estimate',
          input: {
            suggested_project_name: 'Smith Kitchen Reno',
            summary: 'Kitchen renovation',
            sections: [
              {
                title: 'Labor',
                items: [{ description: 'Demo', quantity: 1, unit_price: 500 }],
              },
            ],
          },
        },
      ],
    })

    vi.mocked(getIntegrationKey).mockResolvedValue('test-key')
    vi.mocked(getProjectRecordings).mockResolvedValue([
      { id: 'rec-1', transcript: 'Replace the kitchen cabinets and countertops' } as never,
    ])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
  })

  it('input_schema includes suggested_project_name and is required', async () => {
    const { fromMock } = makeSupabaseMock('Untitled project — 5/5/2026')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    await POST(makeRequest('project-1'))

    // Inspect the tools arg captured during the mock
    expect(capturedTools).toHaveLength(1)
    const tool = capturedTools[0] as {
      name: string
      input_schema: {
        required: string[]
        properties: Record<string, { type: string }>
      }
    }
    expect(tool.input_schema.required).toContain('suggested_project_name')
    expect(tool.input_schema.properties.suggested_project_name.type).toBe('string')
  })
})

describe('project name patch logic (D-05)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    capturedTools = []

    // Default AI response with a suggested name
    anthropicCreateMock.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'create_estimate',
          input: {
            suggested_project_name: 'Smith Kitchen Reno',
            summary: 'Kitchen renovation',
            sections: [
              {
                title: 'Labor',
                items: [{ description: 'Demo', quantity: 1, unit_price: 500 }],
              },
            ],
          },
        },
      ],
    })

    vi.mocked(getIntegrationKey).mockResolvedValue('test-key')
    vi.mocked(getProjectRecordings).mockResolvedValue([
      { id: 'rec-1', transcript: 'Replace the kitchen cabinets' } as never,
    ])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
  })

  it('updates project name when current name starts with placeholder prefix', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock('Untitled project — 5/5/2026')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)

    // Find the update call that passed { name: ... }
    const nameUpdateCall = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] &&
        typeof args[0] === 'object' &&
        'name' in (args[0] as object)
    )
    expect(nameUpdateCall).toBeDefined()
    expect((nameUpdateCall![0] as { name: string }).name).toBe('Smith Kitchen Reno')
  })

  it('preserves user-edited project name (does not call update with name when name is custom)', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock('Smith Bathroom — Phase 2')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)

    // Assert no update was called with a `name` field (i.e. no name-patch)
    const nameUpdateCall = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] &&
        typeof args[0] === 'object' &&
        'name' in (args[0] as object)
    )
    expect(nameUpdateCall).toBeUndefined()
  })
})
