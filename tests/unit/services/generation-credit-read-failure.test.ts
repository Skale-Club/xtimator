import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import { BillingBlockedError } from '@/lib/billing/access-guard'
import { DEFAULT_BILLING_CONFIG, getBillingConfig } from '@/lib/billing/billing-config'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getProjectRecordings } from '@/lib/queries/recording'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { makeServiceMock } from './generate-harness'

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn().mockReturnValue(null),
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/queries/photo', () => ({ getProjectPhotos: vi.fn() }))
vi.mock('@/lib/queries/recording', () => ({ getProjectRecordings: vi.fn() }))
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/ai/provider-with-fallback', () => ({ getAIProviderWithFallback: vi.fn() }))
vi.mock('@/lib/billing/billing-config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/billing/billing-config')>(),
  getBillingConfig: vi.fn(),
}))

const stoppedAtProvider = new Error('Paid provider boundary intercepted by the test')
const readBillingCompany = vi.fn()
const readSpendableLots = vi.fn()
const billingCompany = {
  tier: 'pro',
  credit_balance: 0,
  credit_debt: 0,
  byok_enabled: false,
  stripe_subscription_id: 'sub_unit_test',
  stripe_subscription_status: 'active',
}

function generate() {
  return generateEstimateForProject('company-1', 'project-1', {
    prompts: ['Repaint the living room walls.'],
  })
}

async function expectBlocked(code: BillingBlockedError['code']) {
  const result = await generate().catch((error: unknown) => error)

  expect.soft(result).toBeInstanceOf(BillingBlockedError)
  expect.soft(result).toMatchObject({ code })
  expect(getAIProviderWithFallback).not.toHaveBeenCalled()
}

describe('generateEstimateForProject continuation credit gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ESTIMATOR_TWO_STEP', 'off')
    vi.mocked(getBillingConfig).mockResolvedValue({
      ...DEFAULT_BILLING_CONFIG,
      enforcementEnabled: true,
    })
    readBillingCompany.mockResolvedValue({ data: billingCompany, error: null })
    readSpendableLots.mockResolvedValue({ data: [], error: null })
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
    vi.mocked(getAIProviderWithFallback).mockRejectedValue(stoppedAtProvider)

    const fixture = makeServiceMock()
    const from = (table: string) => {
      if (table === 'credit_lots') {
        return { select: () => ({ eq: () => ({ in: readSpendableLots }) }) }
      }
      const tableFixture = fixture.from(table)
      if (table !== 'companies') return tableFixture
      return {
        select: (columns: string) => ({
          eq: (column: string, value: string) => ({
            ...tableFixture.select(columns).eq(column, value),
            // The project context reads single(). Only the billing read fails.
            maybeSingle: readBillingCompany,
          }),
        }),
      }
    }
    vi.mocked(requireServiceClient).mockReturnValue({ ...fixture, from } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('blocks before provider access when the continuation check rejects', async () => {
    vi.mocked(getBillingConfig).mockRejectedValue(new Error('Billing configuration is temporarily unavailable'))

    await expectBlocked('unavailable')
  })

  it('blocks before provider access when the billing company cannot be read', async () => {
    readBillingCompany.mockResolvedValue({ data: null, error: { message: 'Company read failed' } })

    await expectBlocked('unavailable')
    expect(readBillingCompany).toHaveBeenCalledOnce()
  })

  it('blocks before provider access when the billing company is missing', async () => {
    readBillingCompany.mockResolvedValue({ data: null, error: null })

    await expectBlocked('unavailable')
  })

  it('blocks before provider access when spendable lots cannot be read', async () => {
    readBillingCompany.mockResolvedValue({
      data: { ...billingCompany, tier: 'free', credit_balance: 10, stripe_subscription_id: null },
      error: null,
    })
    readSpendableLots.mockResolvedValue({ data: null, error: { message: 'Credit lots read failed' } })

    await expectBlocked('unavailable')
    expect(readSpendableLots).toHaveBeenCalledOnce()
  })

  it('blocks before provider access with the specific code for a confirmed zero balance', async () => {
    await expectBlocked('out_of_credits')
  })

  it('still admits an in-flight run with one spendable credit', async () => {
    readBillingCompany.mockResolvedValue({ data: { ...billingCompany, credit_balance: 1 }, error: null })

    await expect(generate()).rejects.toBe(stoppedAtProvider)
    expect(getAIProviderWithFallback).toHaveBeenCalledExactlyOnceWith('company-1')
  })
})
