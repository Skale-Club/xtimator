import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => '/price-book',
  // The search is kept in the URL.
  useSearchParams: () => new URLSearchParams(),
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
const mockTrash = vi.fn().mockResolvedValue({ data: { deleted: 2 } })
const mockDeleteFolderWithItems = vi.fn().mockResolvedValue({ data: { deleted: true } })

vi.mock('@/lib/actions/price-book', () => ({
  createPriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  updatePriceBookItem: vi.fn().mockResolvedValue({ data: {} }),
  deletePriceBookItem: (...args: any[]) => mockDelete(...args),
  deletePriceBookItems: (...args: any[]) => mockTrash(...args),
  bulkAdjustPriceBookFolder: vi.fn().mockResolvedValue({ data: { updated: 2 } }),
  createFolder: vi.fn().mockResolvedValue({ data: {} }),
  updateFolder: vi.fn().mockResolvedValue({ data: { updated: true } }),
  deleteFolder: vi.fn().mockResolvedValue({ data: { deleted: true } }),
  deleteFolderWithItems: (...args: any[]) => mockDeleteFolderWithItems(...args),
}))

vi.mock('@/components/price-book/price-book-item-dialog', () => ({
  PriceBookItemDialog: ({ open, item, onDelete, defaultFolderId }: any) =>
    open ? (
      <div data-testid="price-book-dialog" data-default-folder={defaultFolderId ?? ''}>
        Dialog Open{item ? `: ${item.name}` : ''}
        {item && onDelete && <button onClick={() => onDelete(item)}>Delete from dialog</button>}
      </div>
    ) : null,
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
  image_position: null,
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
    // Each category is a named section with a heading (the name also appears in the category column)
    expect(within(screen.getByRole('region', { name: 'Labor' })).getByRole('heading', { name: /Labor/ })).toBeDefined()
    expect(screen.getByRole('region', { name: 'Uncategorized' })).toBeDefined()
    // Virtual Uncategorized section for items with folder_id === null — confirmed via testid
    expect(screen.getByTestId('adjust-btn-folder-uncategorized')).toBeDefined()
    // and label appears somewhere in the DOM
    expect(document.body.textContent).toContain('Uncategorized')
  })

  it('items in same folder render in folder section', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    // One row element per service on every screen.
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

  it('tapping a service row opens the editor for that service', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /^General Labor/ }))
    expect(screen.getByTestId('price-book-dialog').textContent).toContain('General Labor')
  })

  it('Delete inside the editor opens the delete confirmation', async () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /^Supervisor/ }))
    fireEvent.click(screen.getByText('Delete from dialog'))
    expect(screen.queryByTestId('price-book-dialog')).toBeNull()
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Delete Item')).toBeDefined()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('2'))
  })

  it('while selecting, tapping a row toggles it instead of opening the editor', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByLabelText('Select General Labor'))
    fireEvent.click(screen.getByRole('button', { name: /^Supervisor/ }))
    expect(screen.queryByTestId('price-book-dialog')).toBeNull()
    expect(document.body.textContent).toContain('2 selected')
  })

  it('renders each service once (no duplicated table + card trees)', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.getAllByLabelText('Select General Labor')).toHaveLength(1)
    expect(screen.getAllByText('General Labor')).toHaveLength(1)
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

// Quick-260718-t7d — bulk select-all + permanent delete from the category header.
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

  it('confirming bulk delete calls deletePriceBookItems with the selected ids', async () => {
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

// Quick-260718-s8a — the category select-all is an icon button (ListChecks), not
// an empty checkbox: click selects all visible items, click again deselects,
// and a partial selection completes to all.
describe('Select-all icon button (quick-260718-s8a)', () => {
  it('renders a button (not a checkbox role) with a Select all label', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const btn = screen.getByTestId('select-all-folder-folder-labor')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('aria-label')).toBe('Select all in Labor')
    expect(btn.getAttribute('title')).toBe('Select all')
  })

  it('toggles: first click selects all, second click deselects all', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    const btn = screen.getByTestId('select-all-folder-folder-labor')
    fireEvent.click(btn)
    expect(document.body.textContent).toContain('2 selected')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.getAttribute('title')).toBe('Deselect all')
    fireEvent.click(btn)
    expect(screen.queryByTestId('bulk-delete-btn')).toBeNull()
  })

  it('partial selection completes to all instead of deselecting', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByLabelText('Select General Labor'))
    expect(document.body.textContent).toContain('1 selected')
    fireEvent.click(screen.getByTestId('select-all-folder-folder-labor'))
    expect(document.body.textContent).toContain('2 selected')
  })
})

// Quick-260718-d2f — category trash button is dual-function: with a selection it
// bulk-deletes the selected items; with none it deletes the category + its items.
describe('Category trash button dual function (quick-260718-d2f)', () => {
  beforeEach(() => {
    mockTrash.mockClear()
    mockDeleteFolderWithItems.mockClear()
    mockRefresh.mockClear()
  })

  it('with a selection, opens the bulk-delete dialog and deletes the selected ids', async () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('select-all-folder-folder-labor'))
    fireEvent.click(screen.getByTestId('delete-folder-btn-folder-labor'))

    expect(screen.getByText('Delete selected items')).toBeDefined()
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }))

    await waitFor(() => expect(mockTrash).toHaveBeenCalledTimes(1))
    expect(mockTrash).toHaveBeenCalledWith(expect.arrayContaining(['1', '2']))
    expect(mockDeleteFolderWithItems).not.toHaveBeenCalled()
  })

  it('with no selection, opens the Delete Category dialog showing the item count', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('delete-folder-btn-folder-labor'))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('heading', { name: 'Delete Category' })).toBeDefined()
    // Labor has 2 (unfiltered) items — copy warns they are deleted for good
    expect(dialog.textContent).toContain('2')
    expect(dialog.textContent).toContain('permanently delete its')
    expect(dialog.textContent).toContain('This cannot be undone.')
  })

  it('confirming the Delete Category dialog calls deleteFolderWithItems with the folder id', async () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('delete-folder-btn-folder-labor'))

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete Category/ }))

    await waitFor(() => expect(mockDeleteFolderWithItems).toHaveBeenCalledWith('folder-labor'))
    expect(mockTrash).not.toHaveBeenCalled()
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

describe('Category filter', () => {
  it('lists All plus every category with its count, and a summary line', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    expect(screen.getByTestId('category-filter-all').textContent).toContain('3')
    expect(screen.getByTestId('category-filter-folder-labor').textContent).toContain('2')
    expect(screen.getByTestId('category-filter-uncategorized').textContent).toContain('1')
    expect(screen.getByTestId('price-book-summary').textContent).toContain('3 services')
    expect(screen.getByTestId('price-book-summary').textContent).toContain('1 category')
  })

  it('selecting a category shows only its services, and new services start in it', () => {
    render(<PriceBookList items={mockItems} folders={mockFolders} companyId="c1" />)
    fireEvent.click(screen.getByTestId('category-filter-folder-labor'))
    expect(screen.getByText('General Labor')).toBeDefined()
    expect(screen.queryByText('PVC Pipe 2in')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Add Service/i }))
    expect(screen.getByTestId('price-book-dialog').getAttribute('data-default-folder')).toBe('folder-labor')
  })

  it('an empty category shows only when selected, with an add button', () => {
    const folders = [...mockFolders, { id: 'folder-empty', company_id: 'c1', name: 'Roofing', sort_order: 1, created_at: '2026-01-01' }]
    render(<PriceBookList items={mockItems} folders={folders} companyId="c1" />)
    expect(screen.queryByRole('region', { name: 'Roofing' })).toBeNull()
    fireEvent.click(screen.getByTestId('category-filter-folder-empty'))
    expect(screen.getByRole('region', { name: 'Roofing' })).toBeDefined()
    expect(screen.getByText('No services in this category yet.')).toBeDefined()
  })

  it('shows a category filter box once there are many categories', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, company_id: 'c1', name: `Trade ${i}`, sort_order: i, created_at: '2026-01-01' }))
    render(<PriceBookList items={mockItems} folders={many} companyId="c1" />)
    fireEvent.change(screen.getByLabelText('Filter categories'), { target: { value: 'Trade 3' } })
    expect(screen.getByTestId('category-filter-f3')).toBeDefined()
    expect(screen.queryByTestId('category-filter-f4')).toBeNull()
  })
})
