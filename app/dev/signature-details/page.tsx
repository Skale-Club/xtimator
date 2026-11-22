'use client'

import { useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { SignatureDetailsSheet } from '@/components/workspace/estimate/signature-details-sheet'
import type { SignatureEvidence } from '@/lib/estimate/signature-evidence'

/**
 * Dev-only fixture for the editor's "Signature details" panel, without signing
 * in: ?state=verified|mismatch|legacy. Sample evidence, nothing is fetched.
 * Nothing imports this route.
 */
const STATES = ['verified', 'mismatch', 'legacy'] as const
type FixtureState = (typeof STATES)[number]

// A real 1x1 PNG stands in for the signature image.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function sample(state: FixtureState): SignatureEvidence {
  const base: SignatureEvidence = {
    signerName: 'Jane Client',
    signerEmail: 'jane.client@example.com',
    signedAt: '2026-11-21T20:25:41Z',
    ipAddress: '203.0.113.9',
    device: 'Safari on iPhone',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    signedTotal: 12480.5,
    currencyCode: 'USD',
    sha256: '9f2b6c1d4e8a7b3c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4',
    integrity: 'verified',
    consentStatement: 'By signing, you agree to the pricing and terms in this estimate.',
    signatureDataUrl: PNG,
  }
  if (state === 'mismatch') return { ...base, integrity: 'mismatch' }
  if (state === 'legacy') {
    return { ...base, signerEmail: null, ipAddress: null, device: null, userAgent: null, sha256: null, integrity: 'unavailable', consentStatement: null }
  }
  return base
}

export default function SignatureDetailsPreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = useSearchParams()
  const raw = params.get('state')
  const state: FixtureState = (STATES as readonly string[]).includes(raw ?? '') ? (raw as FixtureState) : 'verified'
  const [open, setOpen] = useState(true)

  return (
    <div className="min-h-screen bg-background p-6">
      <Button onClick={() => setOpen(true)}>Open signature details ({state})</Button>
      <SignatureDetailsSheet
        key={state}
        estimateId={`dev-${state}`}
        open={open}
        onOpenChange={setOpen}
        initialEvidence={sample(state)}
      />
    </div>
  )
}
