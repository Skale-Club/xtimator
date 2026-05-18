import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockRefresh = vi.fn()
const mockImport = vi.fn().mockResolvedValue({ data: { imported: 0, skipped: 0 } })
const mockParse = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/actions/price-book', () => ({
  importPriceBookItems: (...args: any[]) => mockImport(...args),
  // Re-export others as no-op so the module shape stays valid if the dialog imports anything else from here
  createPriceBookItem: vi.fn(),
  updatePriceBookItem: vi.fn(),
  deletePriceBookItem: vi.fn(),
}))

vi.mock('@/lib/csv/price-book-import', () => ({
  parsePriceBookCsv: (...args: any[]) => mockParse(...args),
  REQUIRED_HEADERS: ['category', 'name', 'unit', 'unit_price'],
  MAX_BYTES: 1024 * 1024,
  MAX_ROWS: 1000,
}))

import { toast } from 'sonner'
import { PriceBookImportDialog } from '@/components/price-book/price-book-import-dialog'

const makeValidRow = (name: string, category = 'Labor') => ({
  rowNumber: 2,
  values: { category, name, unit: 'hr', unit_price: 75, notes: '' },
  errors: [] as string[],
  isDuplicateInFile: false,
})

const makeInvalidRow = (name: string) => ({
  rowNumber: 3,
  values: { category: '', name, unit: '', unit_price: 0, notes: '' },
  errors: ['missing_unit_price'] as string[],
  isDuplicateInFile: false,
})

describe('PriceBookImportDialog', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockImport.mockClear()
    mockParse.mockReset()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('file change triggers parsePriceBookCsv', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [makeValidRow('Item A')],
      validCount: 1,
      invalidCount: 0,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['category,name,unit,unit_price\nLabor,A,hr,75'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    expect(mockParse).toHaveBeenCalledTimes(1)
    expect(mockParse).toHaveBeenCalledWith(file)
  })

  it('preview stage renders all parsed rows', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [
        makeValidRow('Item A'),
        makeValidRow('Item B'),
        makeValidRow('Item C'),
      ],
      validCount: 3,
      invalidCount: 0,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    // All 3 rows should be rendered — check via row cells
    expect(screen.getByText('Item A')).toBeTruthy()
    expect(screen.getByText('Item B')).toBeTruthy()
    expect(screen.getByText('Item C')).toBeTruthy()
  })

  it('cancel does not call importPriceBookItems', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [makeValidRow('Item A')],
      validCount: 1,
      invalidCount: 0,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    expect(mockImport).toHaveBeenCalledTimes(0)
  })

  it('confirm calls importPriceBookItems with only valid rows', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [
        { rowNumber: 2, values: { category: 'Labor', name: 'A', unit: 'hr', unit_price: 75, notes: '' }, errors: [], isDuplicateInFile: false },
        { rowNumber: 3, values: { category: 'Labor', name: 'B', unit: 'hr', unit_price: 80, notes: '' }, errors: [], isDuplicateInFile: false },
        { rowNumber: 4, values: { category: '', name: 'C', unit: '', unit_price: 0, notes: '' }, errors: ['missing_unit_price'], isDuplicateInFile: false },
      ],
      validCount: 2,
      invalidCount: 1,
      inFileDuplicateCount: 0,
    })

    const onOpenChange = vi.fn()
    render(<PriceBookImportDialog open={true} onOpenChange={onOpenChange} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    const confirmBtn = screen.getByRole('button', { name: /Import 2 items/i })
    fireEvent.click(confirmBtn)

    await new Promise((r) => setTimeout(r, 50))

    expect(mockImport).toHaveBeenCalledTimes(1)
    const arg = mockImport.mock.calls[0][0]
    expect(arg).toHaveLength(2)
  })

  it('invalid rows have error indicator', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [
        makeValidRow('Item A'),
        makeInvalidRow('Item B'),
      ],
      validCount: 1,
      invalidCount: 1,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    const invalidRows = document.querySelectorAll('[data-testid="invalid-row"]')
    expect(invalidRows.length).toBeGreaterThanOrEqual(1)
  })

  it('fatal parse error keeps dialog in pick stage and shows friendly message', async () => {
    mockParse.mockResolvedValue({
      ok: false,
      fatal: 'too_large',
      detail: '2.00 MB exceeds 1 MB limit',
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'big.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    // Should still show file input (still in pick stage) and show error message
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
    expect(screen.getByText(/over 1 MB/i)).toBeTruthy()
  })

  it('confirm button disabled when validCount === 0', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [makeInvalidRow('Item A')],
      validCount: 0,
      invalidCount: 1,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    const confirmBtn = screen.getByRole('button', { name: /Import 0 items/i })
    expect(confirmBtn.hasAttribute('disabled')).toBe(true)
  })

  it('summary banner shows X valid · Y invalid · Z duplicates pattern', async () => {
    mockParse.mockResolvedValue({
      ok: true,
      rows: [
        makeValidRow('Item A'),
        makeValidRow('Item B'),
        makeInvalidRow('Item C'),
      ],
      validCount: 2,
      invalidCount: 1,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    expect(screen.getByText(/2 valid/i)).toBeTruthy()
    expect(screen.getByText(/1 invalid/i)).toBeTruthy()
    expect(screen.getByText(/0 duplicates/i)).toBeTruthy()
  })

  it('successful import closes dialog and refreshes router', async () => {
    mockImport.mockResolvedValue({ data: { imported: 2, skipped: 0 } })
    mockParse.mockResolvedValue({
      ok: true,
      rows: [makeValidRow('Item A'), makeValidRow('Item B')],
      validCount: 2,
      invalidCount: 0,
      inFileDuplicateCount: 0,
    })

    const onOpenChange = vi.fn()
    render(<PriceBookImportDialog open={true} onOpenChange={onOpenChange} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    const confirmBtn = screen.getByRole('button', { name: /Import 2 items/i })
    fireEvent.click(confirmBtn)

    await new Promise((r) => setTimeout(r, 50))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('error import surfaces toast.error with the action error message', async () => {
    mockImport.mockResolvedValue({ error: 'Failed to import items.' })
    mockParse.mockResolvedValue({
      ok: true,
      rows: [makeValidRow('Item A')],
      validCount: 1,
      invalidCount: 0,
      inFileDuplicateCount: 0,
    })

    render(<PriceBookImportDialog open={true} onOpenChange={vi.fn()} />)

    const file = new File(['x'], 'test.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file] } })

    await new Promise((r) => setTimeout(r, 50))

    const confirmBtn = screen.getByRole('button', { name: /Import 1 items/i })
    fireEvent.click(confirmBtn)

    await new Promise((r) => setTimeout(r, 50))

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to import items.')
  })
})
