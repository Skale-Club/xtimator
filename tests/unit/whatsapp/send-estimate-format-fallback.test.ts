// Phase 163 (SENDHUB-02): WhatsApp forced-link fallback for pdf/plain_text.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('SENDHUB-02: WhatsApp format-fallback contract', () => {
  it('deliverEstimateViaWhatsApp accepts a `format` param', () => {
    const source = readFileSync('lib/whatsapp/send-estimate.ts', 'utf8')
    // Post-Wave-3 the params interface must have `format?: ...`.
    expect(source, 'deliverEstimateViaWhatsApp must accept a `format` param').toMatch(/\bformat\?:/)
  })

  it('the effectiveDeliveryFormat branch forces share_link for pdf/plain_text', () => {
    const source = readFileSync('lib/whatsapp/send-estimate.ts', 'utf8')
    // The `effectiveDeliveryFormat` variable name locked by 163-RESEARCH.md § 4.
    expect(source).toMatch(/effectiveDeliveryFormat/)
    expect(source).toMatch(/params\.format\s*===\s*['"]pdf['"]/)
    expect(source).toMatch(/params\.format\s*===\s*['"]plain_text['"]/)
  })

  it.todo('deliverEstimateViaWhatsApp({format: pdf}) with account pdf_attachment -> outbound is type:text share-link')
  it.todo('deliverEstimateViaWhatsApp records `format` in the estimate_deliveries insert')
})
