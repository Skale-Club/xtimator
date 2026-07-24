import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react'
import type { DeletedPriceBookItem } from '@/lib/queries/price-book'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => '/trash',
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockRestore = vi.fn().mockResolvedValue({ data: { restored: 1 } })
const mockDestroy = vi.fn().mockResolvedValue({ data: { destroyed: 1 } })
const mockEmpty = vi.fn().mockResolvedValue({ data: { destroyed: 2 } })

vi.mock('@/lib/actions/price-book', () => ({
  restorePriceBookItems: (...args: any[]) => mockRestore(...args),
  destroyPriceBookItems: (...args: any[]) => mockDestroy(...args),
  emptyPriceBookTrash: (...args: any[]) => mockEmpty(...args),
}))

import { TrashList } from '@/components/trash/trash-list'

const ITEM_DEFAULTS = {
  company_id: 'c1',
  currency_code: 'USD',
  unit: 'hr',
  notes: null,
  created_at: '2026-07-01',
  image_url: null,
  pricing_type: 'fixed' as const,
  base_price: null,
  price_per_unit: null,
  minimum_price: null,
  area_sizes: null,
  image_position: null,
}

const mockItems: DeletedPriceBookItem[] = [
  {
    ...ITEM_DEFAULTS,
    id: 'd1',
    folder_id: 'f1',
    folder_name: 'Labor',
    name: 'Old Labor Rate',
    unit_price: 60,
    deleted_at: '2026-07-17T12:00:00Z',
  },
  {
    ...ITEM_DEFAULTS,
    id: 'd2',
    folder_id: null,
    folder_name: null,
    name: 'Old Pipe',
    unit_price: 2,
    deleted_at: '2026-07-16T12:00:00Z',
  },
]

describe('TrashList (quick-260718-t7d)', () => {
  beforeEach(() => {
    cleanup()
    mockRefresh.mockClear()
    mockRestore.mockClear()
    mockDestroy.mockClear()
    mockEmpty.mockClear()
  })

  it('renders empty state when trash is empty (no Empty Trash button)', () => {
    render(<TrashList items={[]} />)
    expect(screen.getByText('Trash is empty')).toBeDefined()
    expect(screen.queryByTestId('empty-trash-btn')).toBeNull()
  })

  it('renders deleted items with name and category', () => {
    render(<TrashList items={mockItems} />)
    // Desktop table + mobile cards both render (responsive split) — tolerate duplicates
    expect(screen.getAllByText('Old Labor Rate').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Old Pipe').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Labor').length).toBeGreaterThan(0)
  })

  it('Restore calls restorePriceBookItems with the item id', async () => {
    render(<TrashList items={mockItems} />)
    const restoreButtons = screen.getAllByRole('button', { name: /restore/i })
    fireEvent.click(restoreButtons[0])
    await waitFor(() => expect(mockRestore).toHaveBeenCalledTimes(1))
    expect(mockRestore).toHaveBeenCalledWith(['d1'])
  })

  it('Delete forever opens a confirm dialog and calls destroyPriceBookItems on confirm', async () => {
    render(<TrashList items={mockItems} />)
    const destroyButtons = screen.getAllByRole('button', { name: /delete forever/i })
    fireEvent.click(destroyButtons[0])

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/cannot be undone/i)).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: /delete forever/i }))

    await waitFor(() => expect(mockDestroy).toHaveBeenCalledTimes(1))
    expect(mockDestroy).toHaveBeenCalledWith(['d1'])
  })

  it('Empty Trash opens a confirm dialog and calls emptyPriceBookTrash on confirm', async () => {
    render(<TrashList items={mockItems} />)
    fireEvent.click(screen.getByTestId('empty-trash-btn'))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/cannot be undone/i)).toBeDefined()
    fireEvent.click(screen.getByTestId('confirm-empty-trash'))

    await waitFor(() => expect(mockEmpty).toHaveBeenCalledTimes(1))
  })
})
