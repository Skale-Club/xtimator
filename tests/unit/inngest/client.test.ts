import { describe, it, expect } from 'vitest'

/**
 * INNGEST-01: Inngest client singleton (Wave 0 RED stub).
 *
 * Plan 67-02 will deliver `lib/inngest/client.ts` exporting a configured
 * `Inngest` instance with `id: 'xtimator'`. These tests lock the contract:
 *   - the module exports a singleton named `inngest`
 *   - the same instance is returned on repeated import (no per-import re-construction)
 */
describe('INNGEST-01: lib/inngest/client', () => {
  it('exports a singleton `inngest` Inngest client with id "xtimator"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers lib/inngest/client.ts')
  })

  it('client is reusable — same instance on repeated import', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers lib/inngest/client.ts')
  })
})
