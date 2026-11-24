import { beforeEach, describe, expect, it, vi } from 'vitest'

// The tenant digital signature switch has ONE writer (setDigitalSignatureEnabled,
// owner-only). updateDefaults and updateDeliverySettings must never write it.

type CompanyId = Parameters<typeof import('@/lib/billing/access-guard').billingEditDenied>[0]
const billingEditDenied = vi.fn(async (_companyId: CompanyId) => null)
vi.mock('@/lib/billing/access-guard', () => ({
  billingEditDenied: (companyId: CompanyId) => billingEditDenied(companyId),
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

beforeEach(() => {
  vi.clearAllMocks()
  billingEditDenied.mockResolvedValue(null)
})

describe('settings actions no longer write the tenant signature switch', () => {
  it('updateDeliverySettings writes only the delivery columns', async () => {
    const { updateDeliverySettings } = await import('@/lib/actions/settings')
    // Extra property simulates a stale client still sending the old field.
    const result = await updateDeliverySettings({
      emailDeliveryEnabled: true,
      smsDeliveryEnabled: false,
      digitalSignatureEnabled: true,
    } as never)
    expect(result).toEqual({ success: true })
    expect(update).toHaveBeenCalledTimes(1)
    const payload = update.mock.calls[0][0] as Record<string, unknown>
    expect(payload).toEqual({ email_delivery_enabled: true, sms_delivery_enabled: false })
    expect(payload).not.toHaveProperty('digital_signature_enabled')
  })

  it('updateDefaults never writes digital_signature_enabled', async () => {
    const { updateDefaults } = await import('@/lib/actions/settings')
    const result = await updateDefaults({
      defaultTaxRate: 0.1,
      defaultPaymentTerms: '',
      defaultWarrantyTerms: '',
      defaultValidityDays: 30,
      digitalSignatureEnabled: true,
    } as never)
    expect(result).toEqual({ success: true })
    const payloads = update.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(payloads.length).toBeGreaterThan(0)
    for (const p of payloads) expect(p).not.toHaveProperty('digital_signature_enabled')
  })
})
