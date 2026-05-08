import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PriceBookItem } from '@/lib/queries/price-book'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => '/settings/price-book',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockDelete = vi.fn().mockResolvedValue({ data: { deleted: true } })

vi.mock('@/lib/actions/price-book', () => ({
  createPriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  updatePriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  deletePriceBookItem: (...args: any[]) => mockDelete(...args),
}))

vi.mock('@/components/price-book/price-book-item-dialog', () => ({
  PriceBookItemDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="price-book-dialog">Dialog Open</div> : null,
}))

vi.mock('@/components/price-book/price-book-import-dialog', () => ({
  PriceBookImportDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="price-book-import-dialog">Import Open</div> : null,
}))

import { PriceBookList } from '@/components/price-book/price-book-list'

const mockItems: PriceBookItem[] = [
  {
    id: '1',
    company_id: 'c1',
    category: 'Labor',
    name: 'General Labor',
    unit: 'hr',
    unit_price: 75,
    notes: null,
    created_at: '2026-01-01',
  },
  {
    id: '2',
    company_id: 'c1',
    category: 'Labor',
    name: 'Supervisor',
    unit: 'hr',
    unit_price: 120,
    notes: 'Lead only',
    created_at: '2026-01-02',
  },
  {
    id: '3',
    company_id: 'c1',
    category: 'Materials',
    name: 'PVC Pipe 2in',
    unit: 'ft',
    unit_price: 3.5,
    notes: null,
    created_at: '2026-01-03',
  },
]

describe('PriceBookList', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockDelete.mockClear()
  })

  it('renders empty state when items array is empty', () => {
    render(<PriceBookList items={[]} companyId="c1" />)
    expect(screen.getByText('No price book items yet')).toBeDefined()
    // CTA button labeled "Add first item"
    expect(screen.getByRole('button', { name: /Add first item/i })).toBeDefined()
  })

  it('renders category headers for each distinct category', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    expect(screen.getByText('Labor')).toBeDefined()
    expect(screen.getByText('Materials')).toBeDefined()
  })

  it('items sorted alphabetically within each category', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    // Both Labor items are present
    expect(screen.getByText('General Labor')).toBeDefined()
    expect(screen.getByText('Supervisor')).toBeDefined()

    // General Labor must appear before Supervisor in DOM order
    const html = document.body.innerHTML
    const generalIdx = html.indexOf('General Labor')
    const supIdx = html.indexOf('Supervisor')
    expect(generalIdx).toBeGreaterThan(-1)
    expect(supIdx).toBeGreaterThan(-1)
    expect(generalIdx).toBeLessThan(supIdx)
  })

  it('search filters items by name', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'PVC' } })

    expect(screen.getByText('PVC Pipe 2in')).toBeDefined()
    expect(screen.queryByText('General Labor')).toBeNull()
    expect(screen.queryByText('Supervisor')).toBeNull()
  })

  it('search filters items by category', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'Labor' } })

    expect(screen.getByText('General Labor')).toBeDefined()
    expect(screen.getByText('Supervisor')).toBeDefined()
    expect(screen.queryByText('PVC Pipe 2in')).toBeNull()
  })

  it('"no results" state appears when search matches nothing', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'zzzznotfound' } })

    expect(screen.getByText('No items match your search')).toBeDefined()
  })

  it('add dialog opens when Add Item button clicked', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const addBtn = screen.getByRole('button', { name: /Add Item/i })
    fireEvent.click(addBtn)
    expect(screen.getByTestId('price-book-dialog')).toBeDefined()
  })

  // Helper: Radix DropdownMenu uses pointerdown to open (jsdom needs this explicit trigger)
  function openDropdown(triggerEl: Element) {
    fireEvent.pointerDown(triggerEl, { button: 0, ctrlKey: false })
    fireEvent.pointerUp(triggerEl, { button: 0 })
    fireEvent.click(triggerEl)
  }

  it('edit dialog opens when Edit selected from dropdown', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const buttons = screen.getAllByRole('button')
    const dropdownTriggers = buttons.filter((b) => b.className.includes('h-8 w-8'))
    expect(dropdownTriggers.length).toBeGreaterThan(0)
    openDropdown(dropdownTriggers[0])

    const editItems = screen.getAllByText('Edit')
    fireEvent.click(editItems[0])

    expect(screen.getByTestId('price-book-dialog')).toBeDefined()
  })

  it('delete AlertDialog appears when Delete selected from dropdown', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    const buttons = screen.getAllByRole('button')
    const dropdownTriggers = buttons.filter((b) => b.className.includes('h-8 w-8'))
    openDropdown(dropdownTriggers[0])

    const deleteItems = screen.getAllByText('Delete')
    fireEvent.click(deleteItems[0])

    expect(screen.getByText('Delete Item')).toBeDefined()
  })

  it('delete calls deletePriceBookItem and refreshes on confirm', async () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    // Items grouped Labor first (General Labor idx 0, Supervisor idx 1),
    // then Materials (PVC idx 2). Trigger #2 is for item id '3'.
    const buttons = screen.getAllByRole('button')
    const dropdownTriggers = buttons.filter((b) => b.className.includes('h-8 w-8'))
    openDropdown(dropdownTriggers[2])

    const deleteItems = screen.getAllByText('Delete')
    fireEvent.click(deleteItems[0])

    // The AlertDialog has another "Delete" button now (the destructive action).
    const allDeleteBtns = screen.getAllByText('Delete')
    fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])

    // Wait for the transition + promise to resolve
    await new Promise((r) => setTimeout(r, 50))

    expect(mockDelete).toHaveBeenCalledWith('3')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('Import CSV button renders in header', () => {
    render(<PriceBookList items={mockItems} companyId="c1" />)
    expect(screen.getByRole('button', { name: /Import CSV/i })).toBeDefined()
  })

  it('empty state shows Import CSV alongside Add first item', () => {
    render(<PriceBookList items={[]} companyId="c1" />)
    expect(screen.getByRole('button', { name: /Add first item/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Import CSV/i })).toBeDefined()
  })
})
