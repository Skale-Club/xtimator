import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const getSignatureEvidence = vi.fn()
vi.mock('@/lib/actions/signature-evidence', () => ({
  getSignatureEvidence: (...args: unknown[]) => getSignatureEvidence(...args),
}))

import { SignatureDetailsSheet } from '@/components/workspace/estimate/signature-details-sheet'

const HASH = 'a'.repeat(64)
const base = {
  signerName: 'Jane Client',
  signerEmail: 'jane@example.com',
  signedAt: '2026-11-21T15:30:00.000Z',
  ipAddress: '203.0.113.7',
  device: 'Safari on iPhone',
  userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1',
  signedTotal: 1234.5,
  currencyCode: 'USD',
  sha256: HASH,
  integrity: 'verified' as const,
  consentStatement: 'I agree to the terms',
  signatureDataUrl: 'data:image/png;base64,AAAA',
}

const ID = '11111111-1111-1111-1111-111111111111'

describe('SignatureDetailsSheet', () => {
  beforeEach(() => getSignatureEvidence.mockReset())

  it('does not fetch while closed', () => {
    render(<SignatureDetailsSheet estimateId={ID} open={false} onOpenChange={() => {}} />)
    expect(getSignatureEvidence).not.toHaveBeenCalled()
  })

  it('shows verified evidence', async () => {
    getSignatureEvidence.mockResolvedValue({ data: base })
    render(<SignatureDetailsSheet estimateId={ID} open onOpenChange={() => {}} />)
    expect(await screen.findByText('Jane Client')).toBeTruthy()
    expect(getSignatureEvidence).toHaveBeenCalledWith(ID)
    expect(screen.getByText('jane@example.com')).toBeTruthy()
    expect(screen.getByText('203.0.113.7')).toBeTruthy()
    expect(screen.getByText('Safari on iPhone')).toBeTruthy()
    expect(screen.getByText(/1,234\.50/)).toBeTruthy()
    expect(screen.getByTestId('signature-integrity').getAttribute('data-integrity')).toBe('verified')
    expect(screen.getByText('Stored snapshot matches its fingerprint')).toBeTruthy()
    expect(screen.getByTestId('signature-sha256').textContent).toBe(HASH)
    expect(screen.getByText(/I agree to the terms/)).toBeTruthy()
  })

  it('flags a mismatch and hides the fingerprint block without a hash', async () => {
    getSignatureEvidence.mockResolvedValue({
      data: { ...base, integrity: 'mismatch', sha256: null, signerEmail: null, ipAddress: null },
    })
    render(<SignatureDetailsSheet estimateId={ID} open onOpenChange={() => {}} />)
    expect(await screen.findByText('Stored content does not match its fingerprint')).toBeTruthy()
    expect(screen.queryByTestId('signature-sha256')).toBeNull()
    expect(screen.getByText('Not provided')).toBeTruthy()
    expect(screen.getByText('Not recorded')).toBeTruthy()
  })

  it('shows the error and retries', async () => {
    getSignatureEvidence.mockResolvedValueOnce({ error: 'Estimate not found' })
    getSignatureEvidence.mockResolvedValueOnce({ data: base })
    render(<SignatureDetailsSheet estimateId={ID} open onOpenChange={() => {}} />)
    // Server reasons are never shown as customer copy.
    expect(await screen.findByText('Could not load the signature details')).toBeTruthy()
    expect(screen.queryByText('Estimate not found')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('Jane Client')).toBeTruthy())
    expect(getSignatureEvidence).toHaveBeenCalledTimes(2)
  })

  it('fetches again when the editor switches to another version', async () => {
    getSignatureEvidence.mockResolvedValue({ data: base })
    const { rerender } = render(<SignatureDetailsSheet estimateId={ID} open onOpenChange={() => {}} />)
    await screen.findByText('Jane Client')
    const OTHER = '22222222-2222-4222-8222-222222222222'
    rerender(<SignatureDetailsSheet estimateId={OTHER} open onOpenChange={() => {}} />)
    await waitFor(() => expect(getSignatureEvidence).toHaveBeenLastCalledWith(OTHER))
    expect(getSignatureEvidence).toHaveBeenCalledTimes(2)
  })
})
