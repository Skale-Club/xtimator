import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'

// Imports the real generate-estimate service (heavy AI/provider chain) at runtime;
// under vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention, not a mock leak). Per-file timeout keeps it deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))

vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  // Phase 180: generate-estimate now transitively imports lib/demo/guard.ts
  // (via price-research/orchestrator -> quota -> notifications/dispatch),
  // which pulls in lib/queries/auth.ts's module-scope unstable_cache() call.
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(),
}))

// 260927: phase reports are journal writes; spied here to pin the live
// drafting reports without touching pipeline_events.
vi.mock('@/lib/observability/generation-phase', () => ({
  reportGeneratePhase: vi.fn(),
}))

vi.mock('@/lib/estimate/public-url', () => ({
  generatePublicSlugToken: vi.fn().mockReturnValue('deterministic-token-1'),
}))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProvider } from '@/lib/ai'
import { generatePublicSlugToken } from '@/lib/estimate/public-url'
import { reportGeneratePhase } from '@/lib/observability/generation-phase'

const DEFAULT_AI_OUTPUT: EstimateOutput = {
  suggested_project_name: 'Smith Kitchen Reno',
  // GUARD-01: EstimateOutput is now single-sourced from estimateOutputSchema, whose
  // suggested_client_name transform always yields string | null (present in output).
  suggested_client_name: null,
  summary: 'Kitchen renovation estimate',
  sections: [
    {
      title: 'Labor',
      items: [
        {
          description: 'Demolition',
          quantity: 1,
          unit_price: 500,
          price_source: 'ai_estimate',
        },
      ],
    },
  ],
}

function makeSupabaseMock({
  projectName = 'Untitled project — 5/5/2026',
  hasClient = true,
  existingClients = [] as Array<{ id: string; name: string }>,
  activatedClientId,
  itemInsertError = null,
  companyExtra = {} as Record<string, unknown>,
}: {
  projectName?: string
  hasClient?: boolean
  existingClients?: Array<{ id: string; name: string }>
  activatedClientId?: string | null
  itemInsertError?: { message: string } | null
  companyExtra?: Record<string, unknown>
} = {}) {
  const directProjectUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  // QUICK-mv1-01: hoisted so tests can assert estimate_activity rows
  // (e.g. trade_mismatch_detected) across from('estimate_activity') calls.
  const activityInsertSpy = vi.fn().mockResolvedValue({ error: null })

  // PUBURL-01: hoisted so tests can assert the public_slug_token insert payload.
  const estimatesInsertSpy = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'estimate-1' }, error: null }),
    }),
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      const projectData = {
        id: 'project-1',
        company_id: 'company-1',
        name: projectName,
        project_type: 'General',
        target_budget: null,
        client_id: hasClient ? 'client-existing' : null,
        client: hasClient
          ? { name: 'Smith', email: null, phone: null, address: null, city: null, state: null, zip: null }
          : null,
      }
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { name: projectName },
                  error: null,
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: projectData, error: null }),
            }),
          }
        }),
        update: directProjectUpdate,
      }
    }

    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                industry: 'construction',
                default_tax_rate: 0.1,
                default_payment_terms: 'Net 30',
                default_warranty_terms: '1 year',
                name: 'Test Co',
                ...companyExtra,
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'company_price_book') {
      // getPriceBookItems chain: select().eq().is('deleted_at', null).order()
      // (quick-260718-t7d added the .is soft-delete filter) → empty book
      const pbChain: Record<string, ReturnType<typeof vi.fn>> = {}
      pbChain.select = vi.fn(() => pbChain)
      pbChain.eq = vi.fn(() => pbChain)
      pbChain.is = vi.fn(() => pbChain)
      pbChain.order = vi.fn(() => pbChain)
      // getPriceBookItems pages with range() (Phase 4a)
      pbChain.range = vi.fn().mockResolvedValue({ data: [], error: null })
      return pbChain
    }

    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existingClients, count: existingClients.length, error: null }),
        }),
      }
    }

    if (table === 'estimates') {
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
        }),
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'id') {
            return {
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }),
        insert: estimatesInsertSpy,
      }
    }

    if (table === 'estimate_sections') {
      // Sections are bulk-inserted (.insert(rows).select('id')) and the service
      // guards that the returned row count matches the payload, so echo one id
      // per inserted row.
      return {
        insert: vi.fn().mockImplementation((rows: unknown[]) => ({
          select: vi.fn().mockResolvedValue({
            data: rows.map((_row, i) => ({ id: `section-${i + 1}` })),
            error: null,
          }),
        })),
      }
    }

    if (table === 'estimate_items') {
      return { insert: vi.fn().mockResolvedValue({ error: itemInsertError }) }
    }

    if (table === 'estimate_activity') {
      return { insert: activityInsertSpy }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    }
  })

  const rpc = vi.fn(async (name: string, args: {
    p_estimate_id: string
    p_project_update?: Record<string, unknown>
  }) => {
    if (name !== 'activate_estimate_version') throw new Error(`Unexpected RPC ${name}`)
    const proposedClient = args.p_project_update?.client_id
    const client_id = activatedClientId === undefined
      ? (typeof proposedClient === 'string' ? proposedClient : null)
      : activatedClientId
    return { data: { estimate_id: args.p_estimate_id, version: 1, client_id }, error: null }
  })

  return { fromMock, rpc, directProjectUpdate, activityInsertSpy, estimatesInsertSpy }
}

function setupDefaults() {
  generateEstimateMock.mockResolvedValue(DEFAULT_AI_OUTPUT)
  vi.mocked(getAIProvider).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  })
  vi.mocked(getProjectRecordings).mockResolvedValue([
    { id: 'rec-1', transcript: 'Replace kitchen cabinets' } as never,
  ])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
  // vi.resetAllMocks() in beforeEach wipes the vi.mock() factory-level
  // mockReturnValue below, so it must be re-armed here (same pattern as getAIProvider).
  vi.mocked(generatePublicSlugToken).mockReturnValue('deterministic-token-1')
}

describe('generateEstimateForProject', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaults()
  })

  it('returns estimateId and version on success', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.estimateId).toBe('estimate-1')
    expect(result.version).toBe(1)
    expect(result.clientSuggestion).toBeNull()
  })

  it('persists a public_slug_token on every newly created estimate (PUBURL-01)', async () => {
    const { fromMock, rpc, estimatesInsertSpy } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(estimatesInsertSpy).toHaveBeenCalledOnce()
    const insertPayload = estimatesInsertSpy.mock.calls[0][0] as { public_slug_token: string }
    expect(insertPayload.public_slug_token).toBe('deterministic-token-1')
  })

  it('SEED-056: payment / warranty are always the company text, never what the model wrote; timeline / notes are discarded while their blocks are off', async () => {
    const { fromMock, rpc, estimatesInsertSpy } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      payment_terms: 'Invented: 50% upfront',
      warranty_terms: 'Invented: lifetime',
      timeline: 'Invented: 2 weeks',
      notes: 'Invented note',
    })

    await generateEstimateForProject('company-1', 'project-1')

    const input = generateEstimateMock.mock.calls[0][0] as { aiBlocks: unknown }
    expect(input.aiBlocks).toEqual({ timeline: false, notes: false })
    const payload = estimatesInsertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload.payment_terms).toBe('Net 30')
    expect(payload.warranty_terms).toBe('1 year')
    expect(payload.timeline).toBeNull()
    expect(payload.notes).toBeNull()
  })

  it('SEED-056: timeline / notes are kept when the company turned those blocks on', async () => {
    const { fromMock, rpc, estimatesInsertSpy } = makeSupabaseMock({
      companyExtra: { document_blocks: { timeline: true, notes: true } },
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    generateEstimateMock.mockResolvedValue({ ...DEFAULT_AI_OUTPUT, timeline: '2 weeks', notes: 'Access via alley' })

    await generateEstimateForProject('company-1', 'project-1')

    const input = generateEstimateMock.mock.calls[0][0] as { aiBlocks: unknown }
    expect(input.aiBlocks).toEqual({ timeline: true, notes: true })
    const payload = estimatesInsertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(payload.timeline).toBe('2 weeks')
    expect(payload.notes).toBe('Access via alley')
  })

  it('SEED-056: materialises presentation_settings at creation (summary on for AI, everything else off, even payment / warranty with text) and valid_until', async () => {
    // 2026-11-18: payment / warranty blocks start off until the company switches them on.
    const { fromMock, rpc, estimatesInsertSpy } = makeSupabaseMock({
      companyExtra: { default_validity_days: 14 },
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const payload = estimatesInsertSpy.mock.calls[0][0] as {
      presentation_settings: { sections: Record<string, boolean> }
      valid_until: string | null
    }
    expect(payload.presentation_settings.sections).toEqual({
      summary: true,
      sections: true,
      payment_terms: false,
      warranty_terms: false,
      timeline: false,
      notes: false,
      photos: true,
      estimate_terms: false,
      valid_until: false,
    })
    expect(payload.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('SEED-056: a company with no payment / warranty text and "AI summary" off starts with a bare document', async () => {
    const { fromMock, rpc, estimatesInsertSpy } = makeSupabaseMock({
      companyExtra: { default_payment_terms: null, default_warranty_terms: null, document_blocks: { summary: false } },
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const payload = estimatesInsertSpy.mock.calls[0][0] as {
      payment_terms: string | null
      presentation_settings: { sections: Record<string, boolean> }
    }
    expect(payload.payment_terms).toBeNull()
    expect(payload.presentation_settings.sections).toMatchObject({
      summary: false,
      payment_terms: false,
      warranty_terms: false,
    })
  })

  it('calls generateEstimate with correct input fields', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(generateEstimateMock).toHaveBeenCalledOnce()
    const input = generateEstimateMock.mock.calls[0][0] as { industry: string; priceBookItems: unknown[] }
    expect(input.industry).toBe('construction')
    expect(Array.isArray(input.priceBookItems)).toBe(true)
  })

  it('reports sections to the journal as the model drafts them, rate-limited (260927)', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    const now = vi.spyOn(Date, 'now')
    generateEstimateMock.mockImplementation(async (input: { onDraftProgress?: (p: unknown) => void }) => {
      now.mockReturnValue(10_000)
      input.onDraftProgress?.({ sections: 1, items: 2, titles: ['Demo'] })
      now.mockReturnValue(10_500) // too soon after the last report: skipped
      input.onDraftProgress?.({ sections: 2, items: 4, titles: ['Demo', 'Framing'] })
      now.mockReturnValue(13_000) // past the interval, and 2 is still news to the journal
      input.onDraftProgress?.({ sections: 2, items: 6, titles: ['Demo', 'Framing'] })
      input.onDraftProgress?.({ sections: 2, items: 7, titles: ['Demo', 'Framing'] }) // no new section
      now.mockReturnValue(13_200) // new section, but too soon: pricing reports the final count
      input.onDraftProgress?.({ sections: 3, items: 8, titles: ['Demo', 'Framing', 'Paint'] })
      return DEFAULT_AI_OUTPUT
    })

    await generateEstimateForProject('company-1', 'project-1', {
      costContext: { attemptId: 'attempt-1', companyId: 'company-1', projectId: 'project-1' },
    })
    now.mockRestore()

    const drafting = vi
      .mocked(reportGeneratePhase)
      .mock.calls.map(([arg]) => arg)
      .filter((arg) => arg.phase === 'drafting' && arg.detail?.sectionsDrafted !== undefined)
    expect(drafting.map((arg) => arg.detail)).toEqual([
      expect.objectContaining({ sectionsDrafted: 1, itemsDrafted: 2, draftSections: ['Demo'] }),
      expect.objectContaining({ sectionsDrafted: 2, itemsDrafted: 6, draftSections: ['Demo', 'Framing'] }),
    ])
  })

  it('does not ask the provider to stream when there is no attempt to report into', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    await generateEstimateForProject('company-1', 'project-1')
    const input = generateEstimateMock.mock.calls[0][0] as { onDraftProgress?: unknown }
    expect(input.onDraftProgress).toBeUndefined()
  })

  it('throws when project not found', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    // Override projects table to return null
    vi.mocked(requireServiceClient).mockReturnValue({
      rpc,
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }
        return fromMock(table)
      }),
    } as never)

    await expect(
      generateEstimateForProject('company-1', 'project-1')
    ).rejects.toThrow('Project not found')
  })

  it('throws when no transcripts and no photos', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([])

    await expect(
      generateEstimateForProject('company-1', 'project-1')
    ).rejects.toThrow('At least one audio transcript, photo, or prompt is required')
  })

  it('accepts photos-only input (no transcript)', async () => {
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([
      { id: 'photo-1', ai_description: 'Kitchen with damaged cabinets' } as never,
    ])

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.estimateId).toBe('estimate-1')
  })

  it('rejects photos-only input when NO photo has an ai_description (D3)', async () => {
    // The prompt builder only consumes photos WITH ai_description — a project
    // whose only inputs are unanalyzed photos would generate a context-free
    // estimate. The precondition must match what the prompt actually gets.
    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([
      { id: 'photo-1', ai_description: null } as never,
    ])

    await expect(
      generateEstimateForProject('company-1', 'project-1')
    ).rejects.toThrow('At least one audio transcript, photo, or prompt is required')
  })

  it('patches placeholder project name from AI suggestion', async () => {
    const { fromMock, rpc } = makeSupabaseMock({
      projectName: 'Untitled project — 5/5/2026',
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(rpc.mock.calls[0]?.[1].p_project_update).toMatchObject({
      name: 'Smith Kitchen Reno',
      expected_name: 'Untitled project — 5/5/2026',
    })
  })

  it('preserves user-edited project name', async () => {
    const { fromMock, rpc } = makeSupabaseMock({
      projectName: 'Smith Bathroom — Phase 2',
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(rpc.mock.calls[0]?.[1].p_project_update).not.toHaveProperty('name')
  })

  it('returns clientSuggestion when AI detects name and project has no client', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc } = makeSupabaseMock({ hasClient: false })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.clientSuggestion).not.toBeNull()
    expect(result.clientSuggestion!.detectedName).toBe('Johnson')
    expect(result.clientSuggestion!.matchedClientId).toBeNull()
    expect(result.clientSuggestion!.autoLinked).toBe(false)
  })

  it('does not return clientSuggestion when project already has a client', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Smith',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc } = makeSupabaseMock({ hasClient: true })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.clientSuggestion).toBeNull()
  })

  it('reports an automatic client link only after activation confirms it', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc, directProjectUpdate } = makeSupabaseMock({
      hasClient: false,
      existingClients: [{ id: 'client-99', name: 'Johnson' }],
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.clientSuggestion).not.toBeNull()
    expect(result.clientSuggestion!.detectedName).toBe('Johnson')
    expect(result.clientSuggestion!.matchedClientId).toBe('client-99')
    expect(result.clientSuggestion!.matchedClientName).toBe('Johnson')
    expect(result.clientSuggestion!.autoLinked).toBe(true)

    expect(rpc.mock.calls[0]?.[1].p_project_update).toMatchObject({
      client_id: 'client-99',
      detected_client_name: 'Johnson',
    })
    expect(directProjectUpdate).not.toHaveBeenCalled()
  })

  it.each([null, 'manually-linked-client'])(
    'keeps the suggestion unlinked when activation confirms a different client (%j)',
    async (activatedClientId) => {
      generateEstimateMock.mockResolvedValue({ ...DEFAULT_AI_OUTPUT, suggested_client_name: 'Johnson' })
      const { fromMock, rpc, directProjectUpdate } = makeSupabaseMock({
        hasClient: false,
        existingClients: [{ id: 'client-99', name: 'Johnson' }],
        activatedClientId,
      })
      vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

      const result = await generateEstimateForProject('company-1', 'project-1')

      expect(result.clientSuggestion).toMatchObject({
        detectedName: 'Johnson', matchedClientId: 'client-99', matchedClientName: 'Johnson', autoLinked: false,
      })
      expect(rpc.mock.calls[0]?.[1].p_project_update).toHaveProperty('client_id', 'client-99')
      expect(directProjectUpdate).not.toHaveBeenCalled()
    },
  )

  it('saves without a client link when normalized names are ambiguous', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    const { fromMock, rpc, directProjectUpdate } = makeSupabaseMock({
      hasClient: false,
      existingClients: [
        { id: 'client-1', name: 'Johnson' },
        { id: 'client-2', name: '  JOHNSON., ' },
      ],
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.clientSuggestion).toMatchObject({ detectedName: 'Johnson', matchedClientId: null, autoLinked: false })
    expect(rpc.mock.calls[0]?.[1].p_project_update).not.toHaveProperty('client_id')
    expect(directProjectUpdate).not.toHaveBeenCalled()
  })

  it('leaves the client untouched when estimate items cannot be saved', async () => {
    generateEstimateMock.mockResolvedValue({ ...DEFAULT_AI_OUTPUT, suggested_client_name: 'Johnson' })
    const { fromMock, rpc, directProjectUpdate } = makeSupabaseMock({
      hasClient: false,
      existingClients: [{ id: 'client-99', name: 'Johnson' }],
      itemInsertError: { message: 'item insert failed' },
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await expect(generateEstimateForProject('company-1', 'project-1')).rejects.toThrow('Failed to save estimate items')

    expect(rpc).not.toHaveBeenCalled()
    expect(directProjectUpdate).not.toHaveBeenCalled()
  })

  // QUICK-mv1-01 — zero side effects on discarded (vague) generations + detected_trade
  // persistence on kept ones. The rename/project_type/mismatch writes are gated on the
  // SAME isVagueEstimate verdict the assess node re-derives, so a pass auto-refine will
  // revert never touched projects.name/project_type in the first place.

  it('does NOT rename the placeholder when the generation is vague (total 0) — zero side effects on discard', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      detected_trade: 'cleaning',
      sections: [
        {
          title: 'Labor',
          items: [
            {
              description: 'Unpriceable vague work',
              quantity: 1,
              unit_price: 0,
              price_source: 'ai_estimate',
            },
          ],
        },
      ],
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc, activityInsertSpy } = makeSupabaseMock({
      projectName: 'Untitled project — 5/5/2026',
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const projectUpdate = rpc.mock.calls[0]?.[1].p_project_update
    expect(projectUpdate).not.toHaveProperty('name')
    expect(projectUpdate).not.toHaveProperty('project_type')

    const mismatchInsert = activityInsertSpy.mock.calls.find(
      (args: unknown[]) =>
        (args[0] as { event_type?: string })?.event_type === 'trade_mismatch_detected'
    )
    expect(mismatchInsert).toBeUndefined()
  })

  it('persists projects.project_type from detected_trade (lowercased/trimmed) on a kept generation', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      detected_trade: '  Cleaning ',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(rpc.mock.calls[0]?.[1].p_project_update).toHaveProperty('project_type', 'cleaning')
  })

  it('logs trade_mismatch_detected when detected_trade differs from company.industry', async () => {
    // Mock company industry is 'construction'; the AI detects 'cleaning'.
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      detected_trade: 'cleaning',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc, activityInsertSpy } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const mismatchInsert = activityInsertSpy.mock.calls.find(
      (args: unknown[]) =>
        (args[0] as { event_type?: string })?.event_type === 'trade_mismatch_detected'
    )
    expect(mismatchInsert).toBeDefined()
    expect((mismatchInsert![0] as { metadata: unknown }).metadata).toEqual({
      detected: 'cleaning',
      configured: 'construction',
    })
  })

  it('does NOT log trade_mismatch_detected when detected_trade matches company.industry (case-insensitive)', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      detected_trade: 'Construction',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, rpc, activityInsertSpy } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock, rpc } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const mismatchInsert = activityInsertSpy.mock.calls.find(
      (args: unknown[]) =>
        (args[0] as { event_type?: string })?.event_type === 'trade_mismatch_detected'
    )
    expect(mismatchInsert).toBeUndefined()
  })
})
