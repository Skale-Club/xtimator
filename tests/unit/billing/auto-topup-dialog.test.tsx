import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Phase 156 Plan 01 (CREDITFIX-01) — AutoTopupDialog pack-picker regression
 * guard.
 *
 * Repairs a confirmed v4.15 CREDITUI-04 violation: the SelectItem label used
 * to render "$X (≈Y credits)". The parenthetical is gone — the label must
 * show ONLY the dollar amount.
 *
 * Static source-read approach (mirrors topup-pack-labels-no-hardcode.test.ts):
 * Radix Select's SelectContent only mounts in a portal when opened, which is
 * unreliable in jsdom without extra interaction setup — a static source scan
 * is the established precedent in this test directory.
 */

const autoTopupDialogSrc = readFileSync(
  resolve(__dirname, '../../../components/billing/auto-topup-dialog.tsx'),
  'utf8'
)

// Scope the assertion to the SelectItem's rendered label — the file
// legitimately uses "credits" elsewhere (prop/type names like
// `packs: Array<{ credits: number }>`, the unrelated "We'll check this every
// time credits are used." copy for the threshold field). The bug class this
// guards against is specifically the pack-picker's rendered dollar label
// growing a "(≈X credits)" parenthetical back.
const selectItemMatch = autoTopupDialogSrc.match(
  /<SelectItem key=\{i\} value=\{String\(i\)\}>([\s\S]*?)<\/SelectItem>/
)

describe('auto-topup-dialog (CREDITFIX-01 / CREDITUI-04)', () => {
  it('Test B (sanity): the SelectItem block was found in source', () => {
    expect(selectItemMatch).not.toBeNull()
  })

  it('Test B: rendered SelectItem label never matches /credits/i and never contains "≈"', () => {
    const label = selectItemMatch?.[1] ?? ''
    expect(label).not.toMatch(/credits/i)
    expect(label).not.toContain('≈')
  })

  it('Test B (continued): dollar amount is still derived from priceCents', () => {
    const label = selectItemMatch?.[1] ?? ''
    expect(label).toMatch(/formatUsd\(pack\.priceCents\)/)
  })
})
