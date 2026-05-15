import { describe, it, expect } from 'vitest'
import { Inngest } from 'inngest'
import { inngest } from '@/lib/inngest/client'

/**
 * INNGEST-01: Inngest client singleton (Wave 1 GREEN).
 *
 * Plan 67-02 delivers `lib/inngest/client.ts` exporting a configured
 * `Inngest` instance with `id: 'xtimator'`. These tests lock the contract:
 *   - the module exports a singleton named `inngest`
 *   - the same instance is returned on repeated import (no per-import re-construction)
 */
describe('INNGEST-01: lib/inngest/client', () => {
  it('exports a singleton `inngest` Inngest client with id "xtimator"', () => {
    expect(inngest).toBeDefined()
    expect(inngest).toBeInstanceOf(Inngest)
    // The Inngest constructor stores id on the instance as `.id`
    expect((inngest as unknown as { id: string }).id).toBe('xtimator')
  })

  it('client is reusable — same instance on repeated import', async () => {
    const first = (await import('@/lib/inngest/client')).inngest
    const second = (await import('@/lib/inngest/client')).inngest
    expect(first).toBe(second)
  })
})
