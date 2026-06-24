import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Quick 260624-ajz — setPriceResearchSource server action: the super-admin
 * control that configures the v4.6 price-research source.
 *
 * The persisted shape MUST satisfy getActiveResearchSource()
 * (lib/estimate/price-research/provider.ts):
 *   - research_source === 'openrouter_web' | 'anthropic_web' → ACTIVE
 *   - anything else (incl. null) → DORMANT (getPriceResearchProvider() returns null)
 * resolveEngine() (adapters/openrouter-web.ts): research_engine 'native' literal, else 'exa'.
 *
 * Covers:
 *  1. enable openrouter_web + exa  → upsert metadata.research_source='openrouter_web', research_engine='exa'
 *  2. enable anthropic_web + native → research_source='anthropic_web', research_engine='native'
 *  3. disable                      → research_source = null (dormant), engine preserved
 *  4. invalid source               → ok:false, NO upsert
 *  5. non-admin                    → requireAdmin rejects, NO upsert
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const upsertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
const selectSingleMock = vi.fn(
  async (): Promise<{
    data: { metadata: Record<string, unknown> } | null
    error: { message: string } | null
  }> => ({
    data: { metadata: {} },
    error: null,
  })
)

let lastUpsertPayload: { provider?: string; metadata?: Record<string, unknown> } | null = null

// Chainable Supabase stub: svc.from(t).upsert(p) / svc.from(t).select(...).eq(...).maybeSingle()
const fromMock = vi.fn((_table: string) => ({
  upsert: (payload: { provider?: string; metadata?: Record<string, unknown> }) => {
    lastUpsertPayload = payload
    return upsertMock()
  },
  select: () => ({
    eq: () => ({
      maybeSingle: () => selectSingleMock(),
    }),
  }),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---- import under test (after mocks) ---------------------------------------
import { setPriceResearchSource } from '@/app/admin/integrations/actions'

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  selectSingleMock.mockClear()
  selectSingleMock.mockResolvedValue({ data: { metadata: {} }, error: null })
  fromMock.mockClear()
  lastUpsertPayload = null
})

describe('setPriceResearchSource', () => {
  it('1. enable openrouter_web + exa → research_source=openrouter_web & research_engine=exa', async () => {
    const res = await setPriceResearchSource({
      enabled: true,
      source: 'openrouter_web',
      engine: 'exa',
    })
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(lastUpsertPayload?.provider).toBe('price_research')
    expect(lastUpsertPayload?.metadata?.research_source).toBe('openrouter_web')
    expect(lastUpsertPayload?.metadata?.research_engine).toBe('exa')
  })

  it('2. enable anthropic_web + native → research_source=anthropic_web & research_engine=native', async () => {
    const res = await setPriceResearchSource({
      enabled: true,
      source: 'anthropic_web',
      engine: 'native',
    })
    expect(res.ok).toBe(true)
    expect(lastUpsertPayload?.metadata?.research_source).toBe('anthropic_web')
    expect(lastUpsertPayload?.metadata?.research_engine).toBe('native')
  })

  it('3. disable → research_source is null (dormant), engine preserved', async () => {
    const res = await setPriceResearchSource({
      enabled: false,
      source: 'openrouter_web',
      engine: 'exa',
    })
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    // null is NOT in {openrouter_web, anthropic_web} → getActiveResearchSource() → null
    expect(lastUpsertPayload?.metadata?.research_source).toBeNull()
    expect(lastUpsertPayload?.metadata?.research_engine).toBe('exa')
  })

  it('4. invalid source → ok:false, no upsert', async () => {
    const res = await setPriceResearchSource({
      enabled: true,
      source: 'brave' as 'openrouter_web' | 'anthropic_web',
      engine: 'exa',
    })
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('5. non-admin rejected before any DB write', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(
      setPriceResearchSource({ enabled: true, source: 'openrouter_web', engine: 'exa' })
    ).rejects.toThrow()
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
