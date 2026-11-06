import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-056: the block flag follows the text behind it. updateDefaults and
// updateEstimateTerms read-merge-write companies.document_blocks and preserve
// every other key.

let row: Record<string, unknown>
const updates: Array<Record<string, unknown>> = []

function makeClient() {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'u1' } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: row, error: null })) })),
      })),
      update: vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch)
        row = { ...row, ...patch }
        return { eq: vi.fn(async () => ({ error: null })) }
      }),
    })),
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => makeClient()) }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/storage/server', () => ({ serverStorage: {} }))
vi.mock('@/lib/storage/asset-url', () => ({ storageProxyPath: vi.fn() }))
vi.mock('@/lib/image/webp', () => ({ convertImageToWebp: vi.fn() }))
vi.mock('@/lib/price-book-seed', () => ({ appendIndustryPriceBook: vi.fn() }))
vi.mock('@/lib/email/account-emails', () => ({ sendProfileUpdatedEmail: vi.fn(), diffProfileFields: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn(async () => 'company-1') }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: vi.fn(async () => null) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))

import { updateDefaults, updateEstimateTerms } from '@/lib/actions/settings'
import { blockFlagForTextChange } from '@/lib/estimate/document-blocks-store'

const base = { defaultTaxRate: 0.1, defaultValidityDays: 30 }

beforeEach(() => {
  updates.length = 0
  row = {
    default_payment_terms: null,
    default_warranty_terms: null,
    document_blocks: { timeline: true, notes: false, summary: true },
  }
})

const lastBlocks = () =>
  [...updates].reverse().find((u) => 'document_blocks' in u)?.document_blocks as Record<string, boolean> | undefined

describe('blockFlagForTextChange', () => {
  it('empty -> text turns on, text -> empty turns off, unchanged leaves it alone', () => {
    expect(blockFlagForTextChange(null, '50% upfront')).toBe(true)
    expect(blockFlagForTextChange('', ' x ')).toBe(true)
    expect(blockFlagForTextChange('old', '')).toBe(false)
    expect(blockFlagForTextChange(null, '   ')).toBe(false)
    expect(blockFlagForTextChange('same', 'same')).toBeUndefined()
  })
})

describe('updateDefaults keeps document_blocks in step with the terms text', () => {
  it('new payment text sets payment_terms true and preserves the other keys', async () => {
    const res = await updateDefaults({ ...base, defaultPaymentTerms: '50% upfront', defaultWarrantyTerms: '' })
    expect(res).toEqual({ success: true })
    expect(lastBlocks()).toEqual({ timeline: true, notes: false, summary: true, payment_terms: true, warranty_terms: false })
  })

  it('new warranty text sets warranty_terms true', async () => {
    await updateDefaults({ ...base, defaultPaymentTerms: '', defaultWarrantyTerms: '2 years' })
    expect(lastBlocks()?.warranty_terms).toBe(true)
  })

  it('clearing the text sets the flag false', async () => {
    row.default_payment_terms = 'old'
    row.document_blocks = { payment_terms: true, notes: true }
    await updateDefaults({ ...base, defaultPaymentTerms: '', defaultWarrantyTerms: '' })
    expect(lastBlocks()).toEqual({ payment_terms: false, notes: true, warranty_terms: false })
  })

  it('an unchanged text does not flip a switch the owner turned off', async () => {
    row.default_payment_terms = 'Net 15'
    row.default_warranty_terms = '1 yr'
    row.document_blocks = { payment_terms: false, warranty_terms: false }
    await updateDefaults({ ...base, defaultPaymentTerms: 'Net 15', defaultWarrantyTerms: '1 yr' })
    expect(lastBlocks()).toBeUndefined()
  })

  it('works when document_blocks is NULL', async () => {
    row.document_blocks = null
    await updateDefaults({ ...base, defaultPaymentTerms: 'Net 15', defaultWarrantyTerms: '' })
    expect(lastBlocks()).toEqual({ payment_terms: true, warranty_terms: false })
  })
})

describe('updateEstimateTerms keeps estimate_terms in step', () => {
  it('enabled with text -> true, other keys preserved', async () => {
    await updateEstimateTerms({ estimateTermsEnabled: true, estimateTermsText: 'Fine print' })
    expect(lastBlocks()).toEqual({ timeline: true, notes: false, summary: true, estimate_terms: true })
  })

  it('enabled but empty, or disabled -> false', async () => {
    await updateEstimateTerms({ estimateTermsEnabled: true, estimateTermsText: '  ' })
    expect(lastBlocks()?.estimate_terms).toBe(false)
    await updateEstimateTerms({ estimateTermsEnabled: false, estimateTermsText: 'Fine print' })
    expect(lastBlocks()?.estimate_terms).toBe(false)
  })
})
