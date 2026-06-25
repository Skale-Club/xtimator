import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DISC-01 + DISC-02 — static-source persistence gate (Plan 131-03).
 *
 * A pure readFileSync source-string assertion (mirrors
 * tests/unit/mcp/mcp-generation-parity.test.ts — no DB, no mocks, no secrets).
 * It proves the generate-estimate engine WIRES the discount from the computed
 * values rather than persisting the hardcoded null/0/0 stub:
 *   - discountAmount is threaded out of computeEstimateTotals
 *   - the estimates insert persists discount_amount/discount_value from
 *     safeDiscountAmount (NOT the literal `discount_amount: 0`)
 *   - the estimate_items insert carries the per-item line discount
 *   - the hardcoded `discount_amount: 0` stub is GONE (value is computed)
 */

const SRC = readFileSync(
  join(process.cwd(), 'lib/services/generate-estimate.ts'),
  'utf8'
)

describe('DISC-01/DISC-02: engine persists discount from computed values (not hardcoded 0)', () => {
  it('threads discountAmount out of computeEstimateTotals', () => {
    const callIdx = SRC.indexOf('computeEstimateTotals(')
    expect(callIdx).toBeGreaterThan(-1)
    // The destructure block precedes the call; assert discountAmount is in scope.
    expect(SRC).toContain('discountAmount')
  })

  it('persists the global discount on estimates from safeDiscountAmount', () => {
    expect(SRC).toContain('discount_amount: safeDiscountAmount')
    expect(SRC).toContain('discount_value: safeDiscountAmount')
  })

  it('persists the per-item line discount on estimate_items', () => {
    expect(SRC).toContain('discount: (item.discount')
  })

  it('no longer persists the hardcoded discount_amount: 0 stub', () => {
    expect(SRC).not.toContain('discount_amount: 0')
  })
})
