import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

/**
 * Phase 153-01 (CREDITUI-06) — top-up pack picker no-hardcode guard.
 *
 * Mirrors pricing-ui-no-hardcode.test.ts's static-source-scan convention: the
 * dollar amount shown on each pack card must be DERIVED from priceCents, never
 * a hardcoded '$20'/'$50'/'$100' string literal; the grid must receive its
 * packs via a prop (never a local hardcoded pricing constant); and the button
 * label must be parameterized (not only the literal 'Top up credits' string).
 */

const packCardSrc = readFileSync(
  resolve(__dirname, '../../../components/billing/topup-pack-card.tsx'),
  'utf8'
)
const packsGridSrc = readFileSync(
  resolve(__dirname, '../../../components/billing/topup-packs-grid.tsx'),
  'utf8'
)
const topUpButtonSrc = readFileSync(
  resolve(__dirname, '../../../components/billing/top-up-button.tsx'),
  'utf8'
)

describe('topup-pack-labels-no-hardcode', () => {
  it('topup-pack-card.tsx derives the dollar amount from priceCents, never a hardcoded $20/$50/$100 literal', () => {
    expect(packCardSrc).toMatch(/formatUsd\(priceCents\)/)
    expect(packCardSrc).not.toMatch(/['"`]\$(20|50|100)['"`]/)
  })

  it('topup-packs-grid.tsx receives packs via a prop, never a local hardcoded pricing constant', () => {
    expect(packsGridSrc).toMatch(/packs/)
    expect(packsGridSrc).not.toMatch(/const\s+TOPUP_PACKS/)
    expect(packsGridSrc).not.toMatch(/\b2000\b/)
    expect(packsGridSrc).not.toMatch(/\b5000\b/)
    expect(packsGridSrc).not.toMatch(/\b10000\b/)
  })

  it('top-up-button.tsx exposes a parameterized label prop, not only the literal "Top up credits" string', () => {
    expect(topUpButtonSrc).toMatch(/label/)
    expect(topUpButtonSrc).toMatch(/label\s*\??:\s*string/)
  })
})
