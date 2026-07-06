import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Quick 260705-c1y — saveTelegramChatId server action: the super-admin control
 * that stores the Telegram ops-alert destination chat_id into
 * platform_integrations.telegram metadata WITHOUT touching the encrypted bot
 * token (ciphertext/iv/auth_tag are preserved from the existing row).
 *
 * Mirrors the price-research-config mocking style.
 *
 * Covers:
 *  1. valid numeric chat_id → upsert provider='telegram', metadata.chat_id set,
 *                             ciphertext/iv/auth_tag preserved from existing row.
 *  2. non-numeric chat_id   → ok:false, NO upsert.
 *  3. non-admin             → requireAdmin rejects, NO upsert.
 *
 * sendTelegramTestAlert is intentionally NOT tested here — the client is covered
 * by tests/unit/telegram/client.test.ts; this stays focused on the metadata save.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const upsertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))

// Existing row carries an already-encrypted bot token — the save must preserve it.
const EXISTING_ROW = {
  ciphertext: '\\xdeadbeef',
  iv: '\\xcafe',
  auth_tag: '\\xf00d',
  metadata: { chat_id: 'old-value' },
}
const selectSingleMock = vi.fn(
  async (): Promise<{
    data: {
      ciphertext: string | null
      iv: string | null
      auth_tag: string | null
      metadata: Record<string, unknown>
    } | null
    error: { message: string } | null
  }> => ({
    data: EXISTING_ROW,
    error: null,
  })
)

let lastUpsertPayload:
  | {
      provider?: string
      ciphertext?: string | null
      iv?: string | null
      auth_tag?: string | null
      metadata?: Record<string, unknown>
    }
  | null = null

// Chainable Supabase stub: svc.from(t).upsert(p) / svc.from(t).select(...).eq(...).maybeSingle()
const fromMock = vi.fn((_table: string) => ({
  upsert: (payload: {
    provider?: string
    ciphertext?: string | null
    iv?: string | null
    auth_tag?: string | null
    metadata?: Record<string, unknown>
  }) => {
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

// Prevent the real server-only Telegram client (imported by actions.ts) from
// loading its own platform-config dependency during this action test.
vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: vi.fn(async () => undefined),
}))

// ---- import under test (after mocks) ---------------------------------------
import { saveTelegramChatId } from '@/app/admin/integrations/actions'

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  selectSingleMock.mockClear()
  selectSingleMock.mockResolvedValue({ data: EXISTING_ROW, error: null })
  fromMock.mockClear()
  lastUpsertPayload = null
})

describe('saveTelegramChatId', () => {
  it('1. valid numeric chat_id → upserts telegram metadata.chat_id, preserving the encrypted token', async () => {
    const res = await saveTelegramChatId('123456789')
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(lastUpsertPayload?.provider).toBe('telegram')
    expect(lastUpsertPayload?.metadata?.chat_id).toBe('123456789')
    // encrypted token columns preserved from the existing row
    expect(lastUpsertPayload?.ciphertext).toBe(EXISTING_ROW.ciphertext)
    expect(lastUpsertPayload?.iv).toBe(EXISTING_ROW.iv)
    expect(lastUpsertPayload?.auth_tag).toBe(EXISTING_ROW.auth_tag)
  })

  it('1b. accepts a negative group chat id', async () => {
    const res = await saveTelegramChatId('-1001234567890')
    expect(res.ok).toBe(true)
    expect(lastUpsertPayload?.metadata?.chat_id).toBe('-1001234567890')
  })

  it('2. non-numeric chat_id → ok:false, no upsert', async () => {
    const res = await saveTelegramChatId('not-a-number')
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('3. non-admin rejected before any DB write', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(saveTelegramChatId('123456789')).rejects.toThrow()
    expect(upsertMock).not.toHaveBeenCalled()
  })
})
