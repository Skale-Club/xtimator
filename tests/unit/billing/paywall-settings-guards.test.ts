import { beforeEach, describe, expect, it, vi } from 'vitest'

// Product rule 2026-11-20: a paywalled company is read-only everywhere. The
// business settings (company, defaults, terms, delivery, document blocks,
// custom domain) and the team now refuse like every other business write; the
// person's own notification alerts stay open.

const billingEditDenied = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({
  billingEditDenied: (...args: unknown[]) => billingEditDenied(...args),
}))

const update = vi.fn()
function chain() {
  const c: Record<string, unknown> = {}
  for (const m of ['update', 'eq', 'select', 'single', 'maybeSingle']) {
    c[m] = vi.fn((...args: unknown[]) => {
      if (m === 'update') update(...args)
      return c
    })
  }
  c.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
  return c
}
const supabaseMock = {
  auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'u_1' } } })) },
  from: vi.fn(() => chain()),
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => supabaseMock) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn(async () => 'co_1') }))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(async () => null),
  assertCompanyWritable: vi.fn(async () => null),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))

const PAYWALLED = { error: 'Your free credits are used up. Subscribe to Xtimator Pro to keep working.', code: 'paywalled' }

beforeEach(() => {
  vi.clearAllMocks()
  billingEditDenied.mockResolvedValue(PAYWALLED)
})

describe('paywalled company: business settings are read-only on the server', () => {
  it('updateEstimateTerms refuses before writing', async () => {
    const { updateEstimateTerms } = await import('@/lib/actions/settings')
    const result = await updateEstimateTerms({ estimateTermsEnabled: true, estimateTermsText: 'x' })
    expect(result).toEqual({ error: PAYWALLED.error })
    expect(billingEditDenied).toHaveBeenCalledWith('co_1')
    expect(update).not.toHaveBeenCalled()
  })

  it('updateDeliverySettings refuses before writing', async () => {
    const { updateDeliverySettings } = await import('@/lib/actions/settings')
    const result = await updateDeliverySettings({
      emailDeliveryEnabled: true,
      smsDeliveryEnabled: false,
    })
    expect(result).toEqual({ error: PAYWALLED.error })
    expect(update).not.toHaveBeenCalled()
  })

  it('updateDocumentBlocks refuses before writing', async () => {
    const { updateDocumentBlocks } = await import('@/lib/actions/document-blocks')
    const { DOCUMENT_BLOCK_KEYS } = await import('@/lib/estimate/document-blocks')
    const all = Object.fromEntries(DOCUMENT_BLOCK_KEYS.map((k) => [k, true]))
    const result = await updateDocumentBlocks(all as never)
    expect(result).toMatchObject({ code: 'paywalled' })
    expect(update).not.toHaveBeenCalled()
  })

  it('saveCustomDomain refuses before writing', async () => {
    const { saveCustomDomain } = await import('@/lib/actions/custom-domain')
    const result = await saveCustomDomain({ custom_domain: 'estimates.example.com' })
    expect(result).toEqual({ error: PAYWALLED.error })
    expect(update).not.toHaveBeenCalled()
  })

  it('notification alerts stay open (personal preference, not business data)', async () => {
    const { updateNotifications } = await import('@/lib/actions/settings')
    const result = await updateNotifications({ notifyOnView: true, notifyOnAccept: true, notifyOnDecline: false })
    expect(billingEditDenied).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('error')
  })
})
