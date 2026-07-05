import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Phase 152 (CREDITUI-05) — CompanyCostCard.
 *
 * The card is PURELY presentational (no DB) — a single `overview` prop of
 * shape CompanyCostOverview. We mock <T> to a passthrough so copy assertions
 * run on plain English text, mirroring credit-balance-card.test.tsx.
 *
 * Test 5 is a static import-boundary check (Validation Architecture): the
 * card must never be imported from any tenant-facing route or component.
 */

import { vi } from 'vitest'
vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))

const { CompanyCostCard } = await import('@/app/admin/companies/[id]/company-cost-card')
import type { CompanyCostOverview } from '@/lib/queries/admin-company-cost'

describe('CompanyCostCard (CREDITUI-05)', () => {
  it('Test 1: renders title "Cost & Billing" and the admin-only description', () => {
    const overview: CompanyCostOverview = {
      creditBalance: 0,
      totalRealCostUsd: 0,
      markup: 4.5,
      perOperation: [],
    }
    const { container } = render(<CompanyCostCard overview={overview} />)
    expect(container.textContent).toContain('Cost & Billing')
    expect(container.textContent).toContain(
      'Real USD cost, markup, and current balance for this company. Not visible to the tenant.'
    )
  })

  it('Test 2: renders balance, cost, and markup figures', () => {
    const overview: CompanyCostOverview = {
      creditBalance: 1500,
      totalRealCostUsd: 12.3456,
      markup: 4.5,
      perOperation: [],
    }
    const { container } = render(<CompanyCostCard overview={overview} />)
    const html = container.innerHTML
    expect(html).toContain('1500')
    expect(html).toContain('$12.3456')
    expect(html).toContain('4.5')
  })

  it('Test 3: empty perOperation renders the empty-state copy, not an empty table', () => {
    const overview: CompanyCostOverview = {
      creditBalance: 0,
      totalRealCostUsd: 0,
      markup: 4.5,
      perOperation: [],
    }
    const { container } = render(<CompanyCostCard overview={overview} />)
    const html = container.innerHTML
    expect(html).toContain('No measured cost yet for this company.')
    expect(container.querySelector('table')).toBeNull()
  })

  it('Test 4: non-empty perOperation renders a table row per operation type', () => {
    const overview: CompanyCostOverview = {
      creditBalance: 500,
      totalRealCostUsd: 0.1,
      markup: 4.5,
      perOperation: [
        { operationType: 'estimate', n: 2, meanUsd: 0.03, medianUsd: 0.03, p90Usd: 0.04 },
        { operationType: 'photo_batch', n: 4, meanUsd: 0.01, medianUsd: 0.01, p90Usd: 0.02 },
      ],
    }
    const { container } = render(<CompanyCostCard overview={overview} />)
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    const html = container.innerHTML
    expect(html).toContain('estimate')
    expect(html).toContain('photo_batch')
  })

  it('Test 5 (static import-boundary check): company-cost-card is never imported from the tenant-facing tree', () => {
    const ROOT = process.cwd()
    const SCAN_DIRS = ['app/(app)', 'components']
    function collectFiles(dirAbs: string): string[] {
      if (!existsSync(dirAbs)) return []
      const out: string[] = []
      for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
        const full = join(dirAbs, entry.name)
        if (entry.isDirectory()) out.push(...collectFiles(full))
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts'))
          out.push(full)
      }
      return out
    }
    const violations: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of collectFiles(resolve(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (src.includes('company-cost-card')) {
          violations.push(file.replace(ROOT, '').replace(/\\/g, '/'))
        }
      }
    }
    expect(violations).toEqual([])
  })
})
