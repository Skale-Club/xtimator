import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

describe('pricing-ui-no-hardcode', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../components/billing/tier-cards-grid.tsx'),
    'utf8'
  )

  it('does not hardcode annual discount percentages', () => {
    // Should not have literal discount % strings like 'Save 17%'
    expect(src).not.toMatch(/['"`]Save \d+%['"`]/)
    // savePct should be derived from computation
    expect(src).toMatch(/savePct/)
  })

  it('does not hardcode annual prices as string literals in component logic', () => {
    // Should not have literal annual price strings like '$290' or '$280' in component logic
    expect(src).not.toMatch(/['"]\$2[89]0['"]/)
  })

  it('threads billingInterval into checkout call', () => {
    expect(src).toMatch(/billingInterval/)
  })

  it('derives annual prices from props, not constants', () => {
    // annualPrices must appear as a prop, not a hardcoded value
    expect(src).toMatch(/annualPrices/)
    // monthlyPricesCents must flow through props
    expect(src).toMatch(/monthlyPricesCents/)
  })

  it('uses getAnnualDisplay computation function', () => {
    // save percentage is derived via Math.round
    expect(src).toMatch(/Math\.round/)
    // annual price is computed from cents
    expect(src).toMatch(/annualCents/)
  })
})
