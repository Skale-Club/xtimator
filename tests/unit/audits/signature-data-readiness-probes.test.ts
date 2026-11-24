// @vitest-environment node
// Regression coverage for the signature data readiness findings.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSignableSnapshot, fingerprintSignedContent } from '@/lib/estimate/content-fingerprint'
import { buildSigningIdentity } from '@/lib/estimate/signing-identity'
import { getEstimateByPublicToken, getEstimateByShareToken } from '@/lib/queries/share'
import { getCurrentEstimate, getEstimateWithContext } from '@/lib/queries/estimate'
import { loadChangeOrder } from '@/lib/change-orders/load'
import { getChangeOrderByShareToken } from '@/lib/change-orders/queries'
import { buildChangeOrderSnapshot, hashChangeOrderSnapshot } from '@/lib/change-orders/snapshot'

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown>,
  failedTable: null as string | null,
  contract: { before: 1000, after: 1100, revision: 'revision-1' },
}))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => fake }))
vi.mock('@/lib/queries/estimate-photo', () => ({ getEstimatePhotos: async () => [] }))
vi.mock('@/lib/storage/server', () => ({ serverStorage: () => ({}) }))

const fake = {
  rpc: async () => ({ data: state.contract, error: null }),
  from(table: string) {
    const result = (list = false) => ({
      data: state.failedTable === table ? null : (list ? state.lists[table] : undefined) ?? state.rows[table] ?? null,
      error: state.failedTable === table ? { code: '08006', message: 'Read failed' } : null,
    })
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, in: () => chain, not: () => chain,
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (r: ReturnType<typeof result>) => unknown) => Promise.resolve(result(true)).then(resolve),
    }
    return chain
  },
}

function setup() {
  const estimate = {
    id: 'e1', company_id: 'c1', project_id: 'p1', share_token: 'tok',
    client_response: 'accepted', is_current: true, total: 1000, subtotal: 1000, currency_code: 'USD',
    language: 'pt', created_by_user_id: 'u1', responded_at: '2026-11-22T12:00:00Z',
    summary: 'Original scope', tax_rate: 0, tax_amount: 0,
    notes: null, timeline: null, payment_terms: null, warranty_terms: null,
    estimate_date: '2026-11-23', estimate_number: 'EST-1', valid_until: '2026-12-23',
    discount_type: null, discount_value: null, discount_amount: null,
    deposit_type: null, deposit_value: null, balance_due: 1000, presentation_settings: null,
  }
  const company = { id: 'c1', name: 'Original contractor', estimate_terms_enabled: false, estimate_terms_text: null }
  const project = { name: 'Original job', project_type: 'Remodel', client: { id: 'client1', name: 'Original client', address: 'Original site' } }
  const identity = buildSigningIdentity(company, project, 'Original preparer', estimate.language)
  const signed = buildSignableSnapshot(estimate, [], company, identity)
  state.failedTable = null
  state.rows = {
    estimates: estimate, estimate_sections: [], invoices: [],
    projects: project,
    companies: company,
    company_members: { display_name: 'Original preparer' },
    estimate_signatures: { id: 's1', signer_name: 'Audit Signer', signature_data: 'data:image/png;base64,PNG', signed_at: '2026-11-23T12:00:00Z', signed_content: signed, signed_total: 1000, snapshot_sha256: fingerprintSignedContent(signed) },
  }
  return { estimate, signed, identity }
}

afterEach(() => {
  state.rows = {}
  state.lists = {}
  state.failedTable = null
  state.contract = { before: 1000, after: 1100, revision: 'revision-1' }
})

function changeParties() {
  state.rows.projects = { name: 'Different job', client: { id: 'client2', name: 'Different client', address: 'Different site' } }
  state.rows.companies = { ...state.rows.companies as object, name: 'Different contractor' }
  state.rows.company_members = { display_name: 'Different preparer' }
}

describe('Signature data readiness regressions', () => {
  it.each([getEstimateByShareToken, getEstimateByPublicToken])('preserves the signed parties for %p after project edits', async (load) => {
    setup()
    const original = await load('tok')
    changeParties()
    state.failedTable = 'company_members'
    const changed = await load('tok')
    expect(original?.client?.name).toBe('Original client')
    expect(changed?.client).toMatchObject({ name: 'Original client', address: 'Original site' })
    expect(changed?.estimate.project).toEqual({ name: 'Original job', project_type: 'Remodel' })
    expect(changed?.estimate.company.name).toBe('Original contractor')
    expect(changed?.preparedBy).toBe('Original preparer')
    expect(changed?.estimate.signatureImageDataUrl).toBe(original?.estimate.signatureImageDataUrl)
  })

  it('uses the signed scope, validity and identity in workspace and PDF contexts', async () => {
    setup()
    changeParties()
    state.rows.estimates = { ...state.rows.estimates as object, summary: 'Different scope', valid_until: null, language: 'en' }

    const estimate = await getCurrentEstimate(fake as never, 'p1')
    const pdfContext = await getEstimateWithContext(fake as never, 'e1')

    expect(estimate).toMatchObject({ summary: 'Original scope', valid_until: '2026-12-23', language: 'pt' })
    expect(estimate?.signedIdentity).toMatchObject({ preparedBy: 'Original preparer', client: { name: 'Original client' } })
    expect(pdfContext?.project).toMatchObject({ name: 'Original job', client: { name: 'Original client' } })
    expect(pdfContext?.company?.name).toBe('Original contractor')
  })

  it('requires review again when the identity changes before signing', async () => {
    const { signed } = setup()
    state.rows.estimate_signatures = null
    expect((await getEstimateByShareToken('tok'))?.estimate.contentFingerprint).toBe(fingerprintSignedContent(signed))
    changeParties()
    expect((await getEstimateByPublicToken('tok'))?.estimate.contentFingerprint).not.toBe(fingerprintSignedContent(signed))
  })

  it('rejects document loading when the signature read fails', async () => {
    setup()
    state.rows.estimates = { ...state.rows.estimates as object, summary: 'Live scope differs from signed scope' }
    state.failedTable = 'estimate_signatures'
    await expect(getEstimateByShareToken('tok')).rejects.toThrow('Could not load the estimate signature')
    await expect(getEstimateWithContext(fake as never, 'e1')).rejects.toThrow('Could not load the estimate signature')
  })

  function seedChangeOrder() {
    const { identity, estimate } = setup()
    const row = { id: 'co1', company_id: 'c1', estimate_id: 'e1', project_id: 'p1', number: 1, title: 'Original title', total: 100, subtotal: 100, tax_rate: 0, tax_amount: 0, client_response: null, status: 'sent' }
    const item = { id: 'i1', description: 'Original change order scope', quantity: 1, unit_price: 100, total: 100, sort_order: 0 }
    state.rows.change_orders = row
    state.rows.change_order_items = [item]
    state.lists.change_orders = [row]
    return { row, items: [item], identity, estimate: { number: estimate.estimate_number, acceptedAt: estimate.responded_at } }
  }

  function storeChangeOrderSnapshot(signed: ReturnType<typeof buildChangeOrderSnapshot>) {
    state.rows.change_order_signatures = { signer_name: 'Audit Signer', signature_data: 'PNG', signed_at: '2026-11-23T12:00:00Z', signed_content: signed, signed_total: signed.total, snapshot_sha256: hashChangeOrderSnapshot(signed), signer_email: 'signer@example.test', ip_address: '192.0.2.1' }
  }

  it('keeps the signed change order content and contract totals after later changes', async () => {
    const { row, items, identity, estimate } = seedChangeOrder()
    storeChangeOrderSnapshot(buildChangeOrderSnapshot(row, items, { identity, contract: state.contract, estimate }))
    changeParties()
    state.rows.change_orders = { ...row, title: 'Different title', total: 250 }
    state.rows.change_order_items = [{ ...items[0], description: 'Different scope' }]
    state.rows.estimates = { ...state.rows.estimates as object, estimate_number: 'EST-CHANGED' }
    state.lists.change_orders = [{ ...row, client_response: 'accepted', status: 'accepted' }, { ...row, id: 'co2', number: 2, client_response: 'accepted', status: 'accepted', total: 200 }]

    const result = await getChangeOrderByShareToken('tok')
    expect(result?.changeOrder).toMatchObject({ hasSignature: true, title: 'Original title', total: 100, items, signedContract: { before: 1000, after: 1100, revision: 'revision-1' } })
    expect(result?.company.name).toBe('Original contractor')
    expect(result?.estimate).toMatchObject({ estimateNumber: 'EST-1', projectName: 'Original job', clientName: 'Original client', language: 'pt' })
    expect(result?.contract.contractTotal).toBe(1300)
    expect(JSON.stringify(result)).not.toMatch(/signer@example\.test|192\.0\.2\.1|Original site/)
  })

  it('uses the current contract revision in the change order fingerprint', async () => {
    const { row, items, identity, estimate } = seedChangeOrder()
    const loaded = await getChangeOrderByShareToken('tok')
    expect(loaded?.signingContract).toEqual(state.contract)
    expect(loaded?.contentFingerprint).toBe(hashChangeOrderSnapshot(buildChangeOrderSnapshot(row, items, { identity, contract: state.contract, estimate })))

    state.contract = { before: 1200, after: 1300, revision: 'revision-2' }
    expect((await getChangeOrderByShareToken('tok'))?.contentFingerprint).not.toBe(loaded?.contentFingerprint)
  })

  it('does not invent signing-time contract totals for a legacy change order', async () => {
    const { row, items } = seedChangeOrder()
    storeChangeOrderSnapshot(buildChangeOrderSnapshot(row, items))
    const result = await loadChangeOrder(fake as never, { id: 'co1' })
    expect(result?.hasSignature).toBe(true)
    expect(result?.signedContract).toBeNull()
  })

  it('rejects change order reads on evidence failure or a mismatched hash', async () => {
    const { row, items } = seedChangeOrder()
    state.failedTable = 'change_order_signatures'
    await expect(loadChangeOrder(fake as never, { id: 'co1' })).rejects.toThrow('Could not load the change order signature')

    state.failedTable = null
    storeChangeOrderSnapshot(buildChangeOrderSnapshot(row, items))
    state.rows.change_order_signatures = { ...state.rows.change_order_signatures as object, snapshot_sha256: 'wrong' }
    await expect(loadChangeOrder(fake as never, { id: 'co1' })).rejects.toThrow('does not match its signed document')
  })
})
