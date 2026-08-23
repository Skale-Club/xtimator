import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 152 Plan 01 (CREDITUI-03 / CREDITUI-04) — CreditChip rewrite.
 *
 * The topbar chip now accepts ONLY `{ percentUsed }` — the raw `balance` prop
 * is GONE (app/(app)/layout.tsx computes percentUsed via
 * lib/billing/usage-percent.ts before this component ever sees a number).
 *
 * Phase 156 (CREDITFIX-02) — added a real visual progress-bar element, reusing
 * the same color-escalation thresholds as UsageProgressBar via the shared
 * lib/billing/usage-color.ts helper.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { CreditChip } = await import('@/components/app-shell/credit-chip')

describe('CreditChip (CREDITFIX-02 / CREDITUI-04)', () => {
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

  it('Test 10 (CREDITFIX-02): renders a real visible progress-bar element', () => {
    const { container } = render(<CreditChip percentUsed={67} />)
    expect(container.querySelector('[data-slot="progress"]')).toBeTruthy()
  })

  it('Test 11 (CREDITFIX-02): bar uses the healthy/green band under 70%', () => {
    const { container } = render(<CreditChip percentUsed={50} />)
    const bar = container.querySelector('[data-slot="progress"]')
    expect(bar?.className).toContain('--success')
  })

  it('Test 12 (CREDITFIX-02): bar uses the critical/red band at 90%+', () => {
    const { container } = render(<CreditChip percentUsed={95} />)
    const bar = container.querySelector('[data-slot="progress"]')
    expect(bar?.className).toContain('--danger')
  })

  // CREDITFIX-01 (audit finding #1): percentUsed is nullable — when nothing
  // has been granted this cycle, render the raw balance instead of a
  // misleading 0%/100% bar.
  describe('null percentUsed (nothing granted this cycle) — CREDITFIX-01', () => {
    it('Test 13: renders the balance, not a progress bar', () => {
      const { container } = render(<CreditChip percentUsed={null} balance={7500} />)
      expect(container.textContent).toContain('7,500')
      expect(container.querySelector('[data-slot="progress"]')).toBeNull()
    })

    it('Test 14: never renders "%" when percentUsed is null', () => {
      const { container } = render(<CreditChip percentUsed={null} balance={7500} />)
      expect(container.textContent).not.toContain('%')
    })

    it('Test 15: defaults to 0 when balance is omitted', () => {
      const { container } = render(<CreditChip percentUsed={null} />)
      expect(container.textContent).toContain('0')
    })
  })
})
