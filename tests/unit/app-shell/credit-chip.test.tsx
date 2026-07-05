import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 152 Plan 01 (CREDITUI-03 / CREDITUI-04) — CreditChip rewrite.
 *
 * The topbar chip now accepts ONLY `{ percentUsed }` — the raw `balance` prop
 * is GONE (app/(app)/layout.tsx computes percentUsed via
 * lib/billing/usage-percent.ts before this component ever sees a number).
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { CreditChip } = await import('@/components/app-shell/credit-chip')

describe('CreditChip (CREDITUI-03 / CREDITUI-04)', () => {
  it('Test 8: renders "{percentUsed}%" and "used", never "credits"', () => {
    const { container } = render(<CreditChip percentUsed={67} />)
    const html = container.innerHTML
    expect(html).toContain('67%')
    expect(html.toLowerCase()).toContain('used')
    expect(html.toLowerCase()).not.toContain('credits')
  })

  it('Test 9 (CREDITUI-04): never renders "$" or a raw multi-digit number followed by "credits"', () => {
    const { container } = render(<CreditChip percentUsed={67} />)
    const html = container.innerHTML
    expect(html).not.toContain('$')
    expect(html).not.toMatch(/\d{2,}\s*credits?/i)
  })
})
