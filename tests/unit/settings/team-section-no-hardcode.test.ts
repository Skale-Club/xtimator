import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEAT-08 (nothing hardcoded) — STATIC SOURCE GUARD for the team seat-cost line.
 *
 * The Settings → Team seat-cost summary must render EVERY figure from the
 * `seatCost` prop via `formatUSD` — the per-seat price + the projected monthly
 * cost are read at runtime from billing_config (through buildSeatCostSummary),
 * never baked into the component as a dollar/seat literal. This mirrors
 * tests/unit/billing/seat-config-no-hardcode.test.ts: a PURE readFileSync grep,
 * no DB, no mocks, no secrets.
 */

const ROOT = process.cwd()
const REL = 'components/settings/team-section.tsx'

describe('SEAT-08: team-section seat-cost line has no hardcoded cost', () => {
  const src = readFileSync(resolve(ROOT, REL), 'utf8')

  it('renders from the seatCost prop', () => {
    expect(src).toMatch(/seatCost/)
  })

  it('formats the money via formatUSD(seatCost...) — not a literal', () => {
    expect(src).toMatch(/formatUSD\(seatCost/)
  })

  it('does NOT embed a $-prefixed numeric literal in the seat-cost copy', () => {
    // No "$15", "$0.00", etc. baked into the JSX/strings — the price is rendered
    // from the prop through formatUSD, which produces the currency symbol itself.
    expect(src).not.toMatch(/\$[0-9]/)
  })

  it('does NOT assign a numeric literal to perSeatCents / monthlyCents', () => {
    expect(src).not.toMatch(/perSeatCents\s*=\s*\d/)
    expect(src).not.toMatch(/monthlyCents\s*=\s*\d/)
  })

  it('renders the truthful not-yet-active note keyed on enforcementEnabled', () => {
    expect(src).toMatch(/enforcementEnabled/)
  })
})
