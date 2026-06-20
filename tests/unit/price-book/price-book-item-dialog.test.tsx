import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PriceBookItemDialog } from '@/components/price-book/price-book-item-dialog'
import type { PriceBookItem } from '@/lib/queries/price-book'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/price-book', () => ({
  createPriceBookItem: vi.fn(),
  updatePriceBookItem: vi.fn(),
}))

function makeItem(unit: string): PriceBookItem {
  return {
    id: 'i1',
    company_id: 'c1',
    currency_code: 'USD',
    folder_id: null,
    folder_name: null,
    name: 'General Labor',
    unit,
    unit_price: 50,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    image_url: null,
  }
}

function renderDialog(item: PriceBookItem | null) {
  return render(
    <PriceBookItemDialog
      open
      onOpenChange={() => {}}
      item={item}
      currencyCode="USD"
      folders={[]}
    />,
  )
}

describe('PriceBookItemDialog — unit quantity + measure', () => {
  it('splits a "30 min" unit into quantity 30 and a listed measure (no custom box)', async () => {
    renderDialog(makeItem('30 min'))
    await waitFor(() =>
      expect((screen.getByLabelText('Unit quantity') as HTMLInputElement).value).toBe('30'),
    )
    expect(screen.queryByLabelText('Custom unit')).toBeNull()
  })

  it('routes an unlisted unit ("hr") into the custom box, preserving it', async () => {
    renderDialog(makeItem('hr'))
    const custom = (await screen.findByLabelText('Custom unit')) as HTMLInputElement
    expect(custom.value).toBe('hr')
    expect((screen.getByLabelText('Unit quantity') as HTMLInputElement).value).toBe('')
  })

  it('keeps quantity + custom unit for "100 sq ft"', async () => {
    renderDialog(makeItem('100 sq ft'))
    const custom = (await screen.findByLabelText('Custom unit')) as HTMLInputElement
    expect(custom.value).toBe('sq ft')
    expect((screen.getByLabelText('Unit quantity') as HTMLInputElement).value).toBe('100')
  })

  it('starts blank for a new service (no item)', async () => {
    renderDialog(null)
    await waitFor(() =>
      expect((screen.getByLabelText('Unit quantity') as HTMLInputElement).value).toBe(''),
    )
    expect(screen.queryByLabelText('Custom unit')).toBeNull()
  })
})
