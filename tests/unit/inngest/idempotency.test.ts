import { describe, it, expect } from 'vitest'

/**
 * INNGEST-06: Idempotency contract across all 4 Inngest functions (Wave 0 RED stub).
 *
 * Cross-cutting test — asserts every Inngest function exports a config with a
 * non-empty `idempotency` CEL expression. The implementation in Plans 02-04
 * makes each individual function pass; this stub locks down the meta-contract.
 *
 * Verification approach (in GREEN wave): import each function module,
 * inspect the createFunction args (either via vi.spyOn on createFunction or by
 * reading the exported function's `.opts.idempotency` field).
 */
describe('INNGEST-06: idempotency configuration across all functions', () => {
  it('all 4 Inngest functions export config with a non-empty `idempotency` CEL expression', () => {
    expect.fail('not implemented — Wave 1+ (Plans 67-02..04) wire idempotency on every function')
  })
})
