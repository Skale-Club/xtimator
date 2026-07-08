// Phase 163 (SENDHUB-02): SMS delivery byte-identical body across all 3 formats.
// The SMS route today is already link-only (research Q4 confirmed) -- this
// test locks that contract as we add the `format` field to the request body.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('SENDHUB-02: SMS format-fallback contract', () => {
  // Static contract test -- works pre-Wave-3 (this Wave 0 plan)
  it('the send-sms route source declares it accepts a `format` field on the request body', () => {
    const source = readFileSync('app/api/estimates/[id]/send-sms/route.ts', 'utf8')
    // Post-Wave-3 the request schema must reference `format` (in zod, in the destructure, etc.).
    // This starts RED and turns GREEN when Wave 3 wires it in.
    expect(source, 'send-sms route must reference `format` in request body handling').toMatch(/\bformat\b/)
  })

  it.todo('POST /send-sms with format=pdf produces identical outbound body to format=online_link')
  it.todo('POST /send-sms records `format` in the estimate_deliveries insert for each call')
})
