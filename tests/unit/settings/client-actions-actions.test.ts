import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateMock = vi.fn()
const updateEq = vi.fn()
const selectSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: selectSingle })) })),
      update: updateMock,
    })),
  })),
}))
vi.mock('@/lib/auth/context', () => ({ getAuthContext: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(),
  assertCompanyWritable: vi.fn(),
}))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: vi.fn() }))
vi.mock('@/lib/features/platform-feature-state', () => ({ getPlatformFeatureState: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setDigitalSignatureEnabled, setOnlinePaymentsEnabled } from '@/lib/actions/client-actions'
import { getAuthContext } from '@/lib/auth/context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'
import { revalidatePath } from 'next/cache'

const ALLOWED_ROW = { online_payments_allowed: true, digital_signature_allowed: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthContext).mockResolvedValue({ userId: 'u1', companyId: 'c1' })
  vi.mocked(requireCompanyOwner).mockResolvedValue({} as never)
  vi.mocked(assertWritable).mockResolvedValue(null as never)
  vi.mocked(assertCompanyWritable).mockResolvedValue(null as never)
  vi.mocked(billingEditDenied).mockResolvedValue(null as never)
  vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: true })
  selectSingle.mockResolvedValue({ data: ALLOWED_ROW, error: null })
  updateEq.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEq })
})

const CASES = [
  ['setDigitalSignatureEnabled', setDigitalSignatureEnabled, 'digital_signature_enabled', 'digital_signature_allowed'],
  ['setOnlinePaymentsEnabled', setOnlinePaymentsEnabled, 'online_payments_enabled', 'online_payments_allowed'],
] as const

describe.each(CASES)('%s', (_name, action, column, allowedColumn) => {
  it('writes exactly one column, scoped to the company, and revalidates', async () => {
    expect(await action(true)).toEqual({ success: true })
    expect(updateMock).toHaveBeenCalledWith({ [column]: true })
    expect(updateEq).toHaveBeenCalledWith('id', 'c1')
    expect(revalidatePath).toHaveBeenCalledWith('/settings/client-actions')
    expect(revalidatePath).toHaveBeenCalledWith('/settings/integrations')
  })

  it('refuses a missing auth context', async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ error: 'Not authenticated' })
    expect(await action(true)).toEqual({ error: 'Not authenticated' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses a non-owner', async () => {
    vi.mocked(requireCompanyOwner).mockRejectedValue(new Error('forbidden'))
    expect(await action(true)).toEqual({ error: 'Only the company owner can change this.' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses a demo session', async () => {
    vi.mocked(assertWritable).mockResolvedValue({ error: 'Demo is read-only' } as never)
    expect(await action(true)).toEqual({ error: 'Demo is read-only' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses a demo target company', async () => {
    vi.mocked(assertCompanyWritable).mockResolvedValue({ error: 'Demo is read-only' } as never)
    expect(await action(true)).toEqual({ error: 'Demo is read-only' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses a paywalled company', async () => {
    vi.mocked(billingEditDenied).mockResolvedValue({ error: 'Your plan is paused.' } as never)
    expect(await action(true)).toEqual({ error: 'Your plan is paused.' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses invalid input', async () => {
    for (const bad of ['true', 1, null, undefined]) {
      expect(await action(bad as never)).toEqual({ error: 'Invalid input' })
    }
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses turning ON when the platform switch is off', async () => {
    selectSingle.mockResolvedValue({ data: { ...ALLOWED_ROW, [allowedColumn]: false }, error: null })
    expect(await action(true)).toEqual({ error: 'This feature is not available for this account.' })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('allows turning OFF even when the platform does not allow it', async () => {
    selectSingle.mockResolvedValue({ data: { ...ALLOWED_ROW, [allowedColumn]: false }, error: null })
    expect(await action(false)).toEqual({ success: true })
    expect(updateMock).toHaveBeenCalledWith({ [column]: false })
  })

  it('reports a database error', async () => {
    updateEq.mockResolvedValue({ error: { message: 'boom' } })
    const res = await action(true)
    expect('error' in res).toBe(true)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('online payments and the global stop', () => {
  it('refuses turning ON when the global stop is closed', async () => {
    vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: false })
    expect(await setOnlinePaymentsEnabled(true)).toEqual({
      error: 'This feature is not available for this account.',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('allows turning OFF while the global stop is closed', async () => {
    vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: false })
    expect(await setOnlinePaymentsEnabled(false)).toEqual({ success: true })
  })

  it('signature does not depend on the global payments stop', async () => {
    vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: false })
    expect(await setDigitalSignatureEnabled(true)).toEqual({ success: true })
  })
})
