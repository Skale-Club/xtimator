import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Owner model policy at the admin write boundary: the platform default model and
 * the per-company override accept Claude Sonnet/Opus only (GPT, Gemini and Haiku
 * are rejected without touching the DB); transcription accepts Whisper only.
 */
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' })),
}))

type DbResult = { error: { message: string } | null }
const upsertMock = vi.fn(async (): Promise<DbResult> => ({ error: null }))
const updateEqMock = vi.fn(async (): Promise<DbResult> => ({ error: null }))
const updateMock = vi.fn((_p: unknown) => ({ eq: updateEqMock }))
const fromMock = vi.fn((_t: string) => ({
  upsert: (_p: unknown) => upsertMock(),
  update: (p: unknown) => updateMock(p),
  select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }),
  }),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))
vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
  TRANSCRIPTION_MODELS: ['openai/whisper-1'],
}))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/telegram/client', () => ({ sendTelegramMessage: vi.fn(async () => undefined) }))

import {
  setGlobalOpenRouterModel,
  setGlobalTranscriptionModel,
} from '@/app/admin/integrations/actions'
import { setCompanyModelOverride } from '@/app/admin/companies/actions'

beforeEach(() => {
  upsertMock.mockClear()
  updateMock.mockClear()
  updateEqMock.mockClear()
})

const BAD = [
  'openai/gpt-4o',
  'openai/gpt-5',
  'google/gemini-2.5-flash',
  'anthropic/claude-haiku-5.5',
]

describe('setGlobalOpenRouterModel', () => {
  it.each(BAD)('rejects %s without writing', async (slug) => {
    const res = await setGlobalOpenRouterModel(slug)
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('accepts Claude Sonnet / Opus', async () => {
    expect((await setGlobalOpenRouterModel('anthropic/claude-sonnet-5.5')).ok).toBe(true)
    expect((await setGlobalOpenRouterModel('anthropic/claude-opus-5')).ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(2)
  })
})

describe('setCompanyModelOverride', () => {
  it.each(BAD)('rejects %s without writing', async (slug) => {
    const res = await setCompanyModelOverride('co-1', slug)
    expect(res.ok).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('accepts a Sonnet override and a null (clear) override', async () => {
    expect((await setCompanyModelOverride('co-1', 'anthropic/claude-sonnet-5.5')).ok).toBe(true)
    expect((await setCompanyModelOverride('co-1', null)).ok).toBe(true)
    expect(updateMock).toHaveBeenCalledTimes(2)
  })
})

describe('setGlobalTranscriptionModel', () => {
  it.each(['openai/gpt-4o-transcribe', 'openai/gpt-4o-mini-transcribe'])(
    'rejects %s',
    async (slug) => {
      expect((await setGlobalTranscriptionModel(slug)).ok).toBe(false)
      expect(upsertMock).not.toHaveBeenCalled()
    }
  )

  it('accepts Whisper', async () => {
    expect((await setGlobalTranscriptionModel('openai/whisper-1')).ok).toBe(true)
  })
})
