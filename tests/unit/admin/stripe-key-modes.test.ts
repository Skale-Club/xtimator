import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), upsert: vi.fn(), encrypt: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from: () => ({ upsert: mocks.upsert }) }) }))
vi.mock('@/lib/crypto/aes', () => ({ encrypt: mocks.encrypt }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn(), invalidatePlatformConfig: mocks.invalidate }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { saveIntegrationKey, testIntegrationKey } from '@/app/admin/integrations/actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ userId: 'admin', email: 'admin@example.test' })
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.encrypt.mockReturnValue({ ciphertext: Buffer.from('encrypted'), iv: Buffer.alloc(12), authTag: Buffer.alloc(16) })
})
describe('separate encrypted Stripe live and sandbox credentials', () => {
  it.each([
    ['stripe', 'sk_test_fixture'], ['stripe_test', 'sk_live_fixture'],
    ['stripe', 'pk_live_public'], ['stripe_test', 'pk_test_public'],
    ['stripe_connect_client_id', 'sk_live_fixture'],
  ] as const)('rejects a mismatched key for %s before writing', async (provider, apiKey) => {
    expect(await saveIntegrationKey({ provider, apiKey })).toMatchObject({ ok: false })
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.encrypt).not.toHaveBeenCalled()
    expect(await testIntegrationKey({ provider, key: apiKey })).toMatchObject({ ok: false })
  })
  it.each([['stripe', 'sk_live_fixture'], ['stripe_test', 'sk_test_fixture']] as const)('saves %s independently without persisting plaintext', async (provider, apiKey) => {
    expect(await saveIntegrationKey({ provider, apiKey: ` ${apiKey} ` })).toEqual({ ok: true })
    expect(mocks.encrypt).toHaveBeenCalledWith(apiKey)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ provider, ciphertext: expect.stringMatching(/^\\x/) }), { onConflict: 'provider' })
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain(apiKey)
    expect(mocks.invalidate).toHaveBeenCalled()
  })
  it('requires administrator access before storing credentials', async () => {
    mocks.admin.mockRejectedValueOnce(new Error('Forbidden'))
    await expect(saveIntegrationKey({ provider: 'stripe_test', apiKey: 'sk_test_fixture' })).rejects.toThrow('Forbidden')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
