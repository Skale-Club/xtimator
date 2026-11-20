import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => 'company-1' }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => null }))
vi.mock('@/lib/billing/access-guard', () => ({ billingCreateDenied: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ recordCreditDebit: vi.fn() }))
vi.mock('@/lib/queries/estimate', () => ({ getEstimateById: vi.fn() }))
vi.mock('@/lib/ai/openrouter-client', () => ({ translateEstimateTextsOR: vi.fn() }))
vi.mock('@/lib/actions/estimate', () => ({ saveEstimate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { translateEstimate } from '@/lib/actions/estimate-translate'
import { createClient } from '@/lib/supabase/server'
import { billingCreateDenied } from '@/lib/billing/access-guard'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
import { getEstimateById } from '@/lib/queries/estimate'
import { translateEstimateTextsOR } from '@/lib/ai/openrouter-client'
import { saveEstimate } from '@/lib/actions/estimate'

const ID = '11111111-1111-4111-8111-111111111111'
const UPDATED = '2026-11-20T10:00:00.000Z'

function estimateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    company_id: 'company-1',
    project_id: 'project-1',
    is_current: true,
    client_response: null,
    hasSignature: false,
    updated_at: UPDATED,
    language: 'en',
    summary: 'Repaint the living room',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: null,
    deposit_type: 'none',
    deposit_value: null,
    tax_rate: 0.07,
    estimate_date: '2026-11-20',
    estimate_number: 'EST-1',
    presentation_settings: null,
    sections: [
      {
        id: 's1',
        title: 'Labor',
        sort_order: 0,
        items: [
          { id: 'i1', description: 'Paint walls', quantity: 5000, unit: 'sq ft', unit_price: 3.5, sort_order: 0, price_source: null },
        ],
      },
    ],
    ...overrides,
  }
}

function arrange(row: Record<string, unknown> = estimateRow()) {
  const eq2 = vi.fn().mockResolvedValue({ error: null })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const update = vi.fn().mockReturnValue({ eq: eq1 })
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'estimates') return { update }
      throw new Error(`Unexpected table ${table}`)
    },
  } as never)
  vi.mocked(billingCreateDenied).mockResolvedValue(null)
  vi.mocked(getEstimateById).mockResolvedValue(row as never)
  vi.mocked(saveEstimate).mockResolvedValue({ data: { updated_at: 'x' } } as never)
  return { update }
}

afterEach(() => vi.clearAllMocks())

describe('translateEstimate', () => {
  it('translates, saves the texts, sets the language and debits the cost', async () => {
    const { update } = arrange()
    vi.mocked(translateEstimateTextsOR).mockResolvedValue({
      translations: ['Pintar a sala', 'Mão de obra', 'Pintar paredes'],
      costUsd: 0.004,
    })

    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'pt', expectedUpdatedAt: UPDATED })

    expect(res).toEqual({ ok: true, translated: 3 })
    expect(translateEstimateTextsOR).toHaveBeenCalledWith(
      ['Repaint the living room', 'Labor', 'Paint walls'],
      'en',
      'pt',
      expect.objectContaining({ companyId: 'company-1' }),
    )
    const payload = vi.mocked(saveEstimate).mock.calls[0][0]
    expect(payload.expectedUpdatedAt).toBe(UPDATED)
    expect(payload.summary).toBe('Pintar a sala')
    expect(payload.sections[0].title).toBe('Mão de obra')
    expect(payload.sections[0].items[0]).toMatchObject({ description: 'Pintar paredes', quantity: 5000, unit: 'sq ft', unit_price: 3.5 })
    expect(update).toHaveBeenCalledWith({ language: 'pt' })
    expect(recordCreditDebit).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', operationType: 'refine', realCostUsd: 0.004 }),
    )
  })

  it('changes nothing and charges nothing when the model fails', async () => {
    const { update } = arrange()
    vi.mocked(translateEstimateTextsOR).mockRejectedValue(new Error('boom'))

    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'es', expectedUpdatedAt: UPDATED })

    expect(res).toEqual({ error: 'The translation failed. Nothing was changed. Try again.' })
    expect(saveEstimate).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(recordCreditDebit).not.toHaveBeenCalled()
  })

  it('refuses an answered estimate before calling the model', async () => {
    arrange(estimateRow({ client_response: 'accepted' }))
    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'pt', expectedUpdatedAt: UPDATED })
    expect(res).toMatchObject({ code: 'locked' })
    expect(translateEstimateTextsOR).not.toHaveBeenCalled()
  })

  it('refuses a stale editor copy', async () => {
    arrange()
    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'pt', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })
    expect(res).toMatchObject({ code: 'conflict' })
    expect(translateEstimateTextsOR).not.toHaveBeenCalled()
  })

  it('is a no-op for the same language', async () => {
    const { update } = arrange()
    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'en', expectedUpdatedAt: UPDATED })
    expect(res).toEqual({ ok: true, translated: 0 })
    expect(update).not.toHaveBeenCalled()
  })

  it('stops at the billing gate', async () => {
    arrange()
    vi.mocked(billingCreateDenied).mockResolvedValue({ error: 'Out of credits', code: 'out_of_credits' } as never)
    const res = await translateEstimate({ estimateId: ID, targetLanguage: 'pt', expectedUpdatedAt: UPDATED })
    expect(res).toMatchObject({ code: 'out_of_credits' })
    expect(getEstimateById).not.toHaveBeenCalled()
  })
})
