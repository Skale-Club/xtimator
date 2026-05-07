import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { PriceBookImportDialog } from '@/components/price-book/price-book-import-dialog'

describe('PriceBookImportDialog', () => {
  beforeEach(() => {
    mockRefresh.mockClear()
    mockImport.mockClear()
    mockParse.mockReset()
  })

  it('file change triggers parsePriceBookCsv', async () => {
    expect.fail('not implemented')
  })

  it('preview stage renders all parsed rows', async () => {
    expect.fail('not implemented')
  })

  it('cancel does not call importPriceBookItems', async () => {
    expect.fail('not implemented')
  })

  it('confirm calls importPriceBookItems with only valid rows', async () => {
    expect.fail('not implemented')
  })

  it('invalid rows have error indicator', async () => {
    expect.fail('not implemented')
  })

  it('fatal parse error keeps dialog in pick stage and shows friendly message', async () => {
    expect.fail('not implemented')
  })

  it('confirm button disabled when validCount === 0', async () => {
    expect.fail('not implemented')
  })

  it('summary banner shows X valid · Y invalid · Z duplicates pattern', async () => {
    expect.fail('not implemented')
  })

  it('successful import closes dialog and refreshes router', async () => {
    expect.fail('not implemented')
  })

  it('error import surfaces toast.error with the action error message', async () => {
    expect.fail('not implemented')
  })
})

// Suppress unused import warning — PriceBookImportDialog will be used in Wave 1 test bodies
void PriceBookImportDialog
