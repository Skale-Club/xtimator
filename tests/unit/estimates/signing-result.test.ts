import { beforeEach, describe, expect, it, vi } from 'vitest'
const wake = vi.fn()
vi.mock('@/lib/estimate/signature-receipt', () => ({ enqueueSignatureReceipt: (...args: unknown[]) => wake(...args) }))
import { committedSigningResult } from '@/lib/estimates/signing-result'
const stored = { signer_name: 'Original signer', signature_data: 'Original PNG', signed_at: '2026-11-23T12:00:00Z', signed_content: { contract: { before: 1000, after: 1100, revision: 'stored' } } }
function client(data: unknown = stored, error: unknown = null) {
  const filters: unknown[] = []
  const chain = {
    select: () => chain, eq: (...args: unknown[]) => { filters.push(args); return chain },
    order: () => chain, limit: () => chain, maybeSingle: async () => ({ data, error }),
  }
  return { db: { from: vi.fn(() => chain) }, filters }
}
beforeEach(() => { vi.clearAllMocks(); wake.mockResolvedValue(undefined) })
describe('authoritative signing result', () => {
  it.each(['estimate', 'change_order'] as const)('returns original stored evidence for a lost %s reply', async (kind) => {
    const { db, filters } = client()
    const result = await committedSigningResult(db as never, kind, 'doc', 'company', true)
    expect(result).toMatchObject({ alreadySigned: true, signature: { signerName: stored.signer_name, signedAt: stored.signed_at, signatureDataUrl: stored.signature_data } })
    expect(filters).toContainEqual(['company_id', 'company'])
    expect(filters).toContainEqual([kind === 'estimate' ? 'estimate_id' : 'change_order_id', 'doc'])
    expect(wake).toHaveBeenCalledWith({ kind, documentId: 'doc', companyId: 'company' })
    if (kind === 'change_order') expect(result).toHaveProperty('signedContract', stored.signed_content.contract)
  })
  it.each([null, {}, { ...stored, signature_data: null }])('refuses absent/incomplete evidence', async (row) => {
    const { db } = client(row)
    await expect(committedSigningResult(db as never, 'estimate', 'doc', 'company')).rejects.toThrow(/unavailable/)
    expect(wake).not.toHaveBeenCalled()
  })
  it('fails closed when the evidence query returns an error', async () => {
    const { db } = client(stored, { code: '08006' })
    await expect(committedSigningResult(db as never, 'estimate', 'doc', 'company')).rejects.toThrow(/unavailable/)
  })
  it('keeps the committed success when waking durable receipt delivery fails', async () => {
    wake.mockRejectedValue(new Error('Inngest unavailable'))
    const { db } = client()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try { expect(await committedSigningResult(db as never, 'estimate', 'doc', 'company')).toHaveProperty('success', true) }
    finally { warning.mockRestore() }
  })
})
