import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/ai/model-policy', () => ({
  isAllowedChatModel: () => true,
  CHAT_MODEL_POLICY_MESSAGE: 'x',
}))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { revalidatePath } from 'next/cache'
import { requireServiceClient } from '@/lib/supabase/service'
import { setCompanyFeatureAllowed } from '@/app/admin/companies/actions'

const ID = '11111111-1111-4111-8111-111111111111'

function makeSvc(opts: { previous?: unknown; updateError?: string | null }) {
  const updateEq = vi.fn().mockResolvedValue({
    error: opts.updateError ? { message: opts.updateError } : null,
  })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: opts.previous ?? null, error: null }),
    }),
  })
  const from = vi.fn().mockReturnValue({ select, update })
  return { from, update, updateEq, select }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'a@example.com' } as never)
})

describe('setCompanyFeatureAllowed', () => {
  it('rejects a non-admin before touching the database', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('forbidden'))
    await expect(setCompanyFeatureAllowed(ID, 'online_payments', true)).rejects.toThrow('forbidden')
    expect(requireServiceClient).not.toHaveBeenCalled()
  })

  it('rejects an unknown feature and a non-uuid id', async () => {
    const bad = await setCompanyFeatureAllowed(ID, 'stripe' as never, true)
    expect(bad.ok).toBe(false)
    const proto = await setCompanyFeatureAllowed(ID, 'toString' as never, true)
    expect(proto.ok).toBe(false)
    const badId = await setCompanyFeatureAllowed('not-a-uuid', 'online_payments', true)
    expect(badId.ok).toBe(false)
    const badBool = await setCompanyFeatureAllowed(ID, 'online_payments', 'yes' as never)
    expect(badBool.ok).toBe(false)
    expect(requireServiceClient).not.toHaveBeenCalled()
  })

  it.each([
    ['online_payments', 'online_payments_allowed'],
    ['digital_signature', 'digital_signature_allowed'],
  ] as const)('writes the %s column and audits previous and new value', async (feature, column) => {
    const svc = makeSvc({ previous: { [column]: false } })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const res = await setCompanyFeatureAllowed(ID, feature, true)

    expect(res.ok).toBe(true)
    expect(svc.update).toHaveBeenCalledWith({ [column]: true })
    expect(svc.updateEq).toHaveBeenCalledWith('id', ID)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/companies')
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/companies/${ID}`)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'company.feature_allowed',
        targetType: 'company',
        targetId: ID,
        metadata: { feature, allowed: true, previous: false },
      }),
    )
  })

  it('returns the error and logs nothing when the update fails', async () => {
    const svc = makeSvc({ updateError: 'boom' })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)
    const res = await setCompanyFeatureAllowed(ID, 'digital_signature', false)
    expect(res).toEqual({ ok: false, message: 'boom' })
    expect(logAdminAction).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
