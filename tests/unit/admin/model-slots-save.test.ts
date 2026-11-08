import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' })),
}))
let stored: Record<string, unknown> = {}
const upsertMock = vi.fn(async (_row: unknown): Promise<{ error: { message: string } | null }> => ({ error: null }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      upsert: (row: unknown) => upsertMock(row),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: stored }, error: null }) }) }),
    }),
  }),
}))
const invalidate = vi.fn()
vi.mock('@/lib/platform-config', () => ({ invalidatePlatformConfig: () => invalidate(), TRANSCRIPTION_MODELS: ['openai/whisper-1'] }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/telegram/client', () => ({ sendTelegramMessage: vi.fn(async () => undefined) }))

import { setModelSlot, setEscalationConfig } from '@/app/admin/integrations/actions'

const HAIKU = 'anthropic/claude-haiku-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'
const OPUS = 'anthropic/claude-opus-5'
const savedMeta = () => (upsertMock.mock.calls.at(-1)![0] as { metadata: Record<string, unknown> }).metadata

beforeEach(() => {
  stored = { openrouter_default_model: SONNET, transcription_model: 'openai/whisper-1' }
  vi.clearAllMocks()
})

describe('setModelSlot', () => {
  it.each([
    ['vision', HAIKU],
    ['plan', HAIKU],
    ['review', HAIKU],
    ['draft', OPUS],
    ['research', SONNET],
  ])('accepts %s = %s and keeps unrelated keys', async (slot, model) => {
    const res = await setModelSlot(slot, model)
    expect(res.ok).toBe(true)
    expect(savedMeta()).toMatchObject({ openrouter_default_model: SONNET, models: { [slot]: model } })
    expect(invalidate).toHaveBeenCalled()
  })

  it.each([
    ['draft', HAIKU],
    ['research', HAIKU],
    ['vision', 'openai/gpt-5'],
    ['nope', SONNET],
  ])('rejects %s = %s without writing', async (slot, model) => {
    expect((await setModelSlot(slot, model)).ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('an empty model clears only that slot (back to the default)', async () => {
    stored = { models: { vision: HAIKU, plan: HAIKU } }
    expect((await setModelSlot('vision', '')).ok).toBe(true)
    expect(savedMeta().models).toEqual({ plan: HAIKU })
  })
})

describe('setEscalationConfig', () => {
  it('enabling requires an Opus model', async () => {
    expect((await setEscalationConfig({ enabled: true, model: SONNET })).ok).toBe(false)
    expect((await setEscalationConfig({ enabled: true, model: '' })).ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('saves thresholds and preserves other keys', async () => {
    const res = await setEscalationConfig({ enabled: true, model: OPUS, minSections: 6, minTotalUsd: 15000, onLowScopeConfidence: true })
    expect(res.ok).toBe(true)
    expect(savedMeta()).toMatchObject({
      openrouter_default_model: SONNET,
      escalation: { enabled: true, model: OPUS, minSections: 6, minTotalUsd: 15000, onLowScopeConfidence: true },
    })
  })

  it('disabling is allowed without a model and drops invalid thresholds', async () => {
    const res = await setEscalationConfig({ enabled: false, model: '', minSections: -2, minTotalUsd: null })
    expect(res.ok).toBe(true)
    expect(savedMeta().escalation).toEqual({ enabled: false, model: '', onLowScopeConfidence: false })
  })
})
