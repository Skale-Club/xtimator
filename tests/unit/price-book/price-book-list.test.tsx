import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => '/price-book',
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
const mockTrash = vi.fn().mockResolvedValue({ data: { trashed: 2 } })

vi.mock('@/lib/actions/price-book', () => ({
  createPriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  updatePriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  deletePriceBookItem: (...args: any[]) => mockDelete(...args),
  trashPriceBookItems: (...args: any[]) => mockTrash(...args),
  bulkAdjustPriceBookFolder: vi.fn().mockResolvedValue({ data: { updated: 2 } }),
  createFolder: vi.fn().mockResolvedValue({ data: {} }),
  updateFolder: vi.fn().mockResolvedValue({ data: { updated: true } }),
  deleteFolder: vi.fn().mockResolvedValue({ data: { deleted: true } }),
}))

vi.mock('@/components/price-book/price-book-item-dialog', () => ({
  PriceBookItemDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="price-book-dialog">Dialog Open</div> : null,
}))

vi.mock('@/components/price-book/import-wizard', () => ({
  PriceBookImportWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="price-book-import-dialog">Import Open</div> : null,
}))

vi.mock('@/components/price-book/bulk-adjust-dialog', () => ({
  BulkAdjustDialog: ({ open, folderName }: { open: boolean; folderName: string }) =>
    open ? <div data-testid="bulk-adjust-dialog">Bulk Adjust: {folderName}</div> : null,
}))

import { PriceBookList } from '@/components/price-book/price-book-list'

// Two items with no folder + one with a folder
const mockFolders: PriceBookFolder[] = [
  { id: 'folder-labor', company_id: 'c1', name: 'Labor', sort_order: 0, created_at: '2026-01-01' },
]

const ITEM_DEFAULTS = {
  pricing_type: 'fixed' as const,
  base_price: null,
  price_per_unit: null,
  minimum_price: null,
  area_sizes: null,
}

const mockItems: PriceBookItem[] = [
  {
    ...ITEM_DEFAULTS,
    id: '1',
    company_id: 'c1',
    folder_id: 'folder-labor',
    folder_name: 'Labor',
    name: 'General Labor',
    unit: 'hr',
    unit_price: 75,
    notes: null,
    created_at: '2026-01-01',
    image_url: null,
  },
  {
    ...ITEM_DEFAULTS,
    id: '2',
    company_id: 'c1',
    folder_id: 'folder-labor',
    folder_name: 'Labor',
    name: 'Supervisor',
    unit: 'hr',
    unit_price: 120,
    notes: 'Lead only',
    created_at: '2026-01-02',
    image_url: null,
  },
  {
    ...ITEM_DEFAULTS,
    id: '3',
    company_id: 'c1',
    folder_id: null,
    folder_name: null,
    name: 'PVC Pipe 2in',
    unit: 'ft',
    unit_price: 3.5,
    notes: null,
    created_at: '2026-01-03',
    image_url: null,
  },
]

describe('PriceBookList', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockDelete.mockClear()
  })

  it('renders empty state when items array is empty and no folders', () => {
    render(<PriceBookList items={[]} folders={[]} companyId="c1" />)
    expect(screen.getByText('No price book items yet')).toBeDefined()
    expect(screen.getByRole('button', { name: /Add first item/i })).toBeDefined()
  })

  it('renders folder section header for each folder + Uncategorized for null-folder items', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    // Folder name appears in header
    expect(screen.getByText('Labor')).toBeDefined()
    // Virtual Uncategorized section for items with folder_id === null — confirmed via testid
    expect(screen.getByTestId('adjust-btn-folder-uncategorized')).toBeDefined()
    // and label appears somewhere in the DOM
    expect(document.body.textContent).toContain('Uncategorized')
  })

  it('items in same folder render in folder section', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    // Item names render in both desktop Table and mobile Card list (responsive split),
    // so use getAllByText to tolerate the duplicated DOM (same pattern as client-list.test.tsx).
    expect(screen.getAllByText('General Labor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Supervisor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PVC Pipe 2in').length).toBeGreaterThan(0)
  })

  it('search filters items by name', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'PVC' } })

    expect(screen.getAllByText('PVC Pipe 2in').length).toBeGreaterThan(0)
    expect(screen.queryByText('General Labor')).toBeNull()
    expect(screen.queryByText('Supervisor')).toBeNull()
  })

  it('search filters items by folder name', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'Labor' } })

    expect(screen.getAllByText('General Labor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Supervisor').length).toBeGreaterThan(0)
    expect(screen.queryByText('PVC Pipe 2in')).toBeNull()
  })

  it('"no results" state appears when search matches nothing', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'zzzznotfound' } })

    expect(screen.getByText('No items match your search')).toBeDefined()
  })

  it('add dialog opens when Add Service button clicked', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const addBtn = screen.getByRole('button', { name: /Add Service/i })
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
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const buttons = screen.getAllByRole('button')
    const dropdownTriggers = buttons.filter((b) => b.className.includes('h-8 w-8'))
    expect(dropdownTriggers.length).toBeGreaterThan(0)
    openDropdown(dropdownTriggers[0])

    const editItems = screen.getAllByText('Edit')
    fireEvent.click(editItems[0])

    expect(screen.getByTestId('price-book-dialog')).toBeDefined()
  })

  it('delete AlertDialog appears when Delete selected from dropdown', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const buttons = screen.getAllByRole('button')
    const dropdownTriggers = buttons.filter((b) => b.className.includes('h-8 w-8'))
    openDropdown(dropdownTriggers[0])

    const deleteItems = screen.getAllByText('Delete')
    fireEvent.click(deleteItems[0])

    expect(screen.getByText('Delete Item')).toBeDefined()
  })

  it('Import CSV button renders in header', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.getByRole('button', { name: /Import CSV/i })).toBeDefined()
  })

  it('empty state shows Import CSV alongside Add first item', () => {
    render(<PriceBookList items={[]} folders={[]} companyId="c1" />)
    expect(screen.getByRole('button', { name: /Add first item/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Import CSV/i })).toBeDefined()
  })
})

// Quick-260718-t7d — bulk select-all + move-to-Trash from the category header.
describe('Bulk select and delete (quick-260718-t7d)', () => {
  beforeEach(() => {
    mockTrash.mockClear()
    mockRefresh.mockClear()
  })

  it('category header renders a select-all checkbox per section', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.getByTestId('select-all-folder-folder-labor')).toBeDefined()
    expect(screen.getByTestId('select-all-folder-uncategorized')).toBeDefined()
  })

  it('select-all checks the category items and shows the bulk bar with the count', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('select-all-folder-folder-labor'))
    // Labor has 2 items → "2 selected" + Delete button appear
    expect(document.body.textContent).toContain('2 selected')
    expect(screen.getByTestId('bulk-delete-btn')).toBeDefined()
  })

  it('bulk bar is hidden when nothing is selected', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.queryByTestId('bulk-delete-btn')).toBeNull()
  })

  it('confirming bulk delete calls trashPriceBookItems with the selected ids', async () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('select-all-folder-folder-labor'))
    fireEvent.click(screen.getByTestId('bulk-delete-btn'))

    // Confirm dialog opens
    expect(screen.getByText('Delete selected items')).toBeDefined()
    const dialog = screen.getByRole('alertdialog')
    const confirmBtn = within(dialog).getByRole('button', { name: /^Delete$/ })
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(mockTrash).toHaveBeenCalledTimes(1))
    expect(mockTrash).toHaveBeenCalledWith(expect.arrayContaining(['1', '2']))
    expect((mockTrash.mock.calls[0][0] as string[]).length).toBe(2)
  })

  it('search-filtered select-all only selects VISIBLE items of the category', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search items...')
    fireEvent.change(searchInput, { target: { value: 'Supervisor' } })
    fireEvent.click(screen.getByTestId('select-all-folder-folder-labor'))
    expect(document.body.textContent).toContain('1 selected')
  })
})

describe('Adjust % button per folder', () => {
  it('renders adjust button for each folder section (named + uncategorized)', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.getByTestId('adjust-btn-folder-folder-labor')).toBeDefined()
    expect(screen.getByTestId('adjust-btn-folder-uncategorized')).toBeDefined()
  })

  it('button is enabled when folder has items', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const laborBtn = screen.getByTestId('adjust-btn-folder-folder-labor')
    expect((laborBtn as HTMLButtonElement).disabled).toBe(false)
    const uncatBtn = screen.getByTestId('adjust-btn-folder-uncategorized')
    expect((uncatBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('clicking button opens BulkAdjustDialog with correct folder name', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('adjust-btn-folder-folder-labor'))
    expect(screen.getByTestId('bulk-adjust-dialog')).toBeDefined()
    expect(screen.getByText('Bulk Adjust: Labor')).toBeDefined()
  })

  it('clicking uncategorized button opens dialog with Uncategorized name', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('adjust-btn-folder-uncategorized'))
    expect(screen.getByText('Bulk Adjust: Uncategorized')).toBeDefined()
  })
})
