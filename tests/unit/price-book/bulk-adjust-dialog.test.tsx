import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PriceBookItem } from '@/lib/queries/price-book'

const mockRefresh = vi.fn()
const mockBulkAdjust = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/price-book', () => ({
  bulkAdjustPriceBookFolder: (...args: any[]) => mockBulkAdjust(...args),
}))

import { BulkAdjustDialog } from '@/components/price-book/bulk-adjust-dialog'
import { toast } from 'sonner'

const mockItems: PriceBookItem[] = [
  {
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
    id: '2',
    company_id: 'c1',
    folder_id: 'folder-labor',
    folder_name: 'Labor',
    name: 'Supervisor',
    unit: 'hr',
    unit_price: 100,
    notes: null,
    created_at: '2026-01-01',
    image_url: null,
  },
]

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  folderId: 'folder-labor',
  folderName: 'Labor',
  items: mockItems,
}

describe('BulkAdjustDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBulkAdjust.mockResolvedValue({ data: { updated: 2 } })
  })

  it('renders dialog title with folder name', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    // Title renders as "Adjust prices | {folderName}" across two text nodes; assert via the heading.
    expect(screen.getByRole('heading', { name: /adjust prices/i }).textContent).toContain('Labor')
  })

  it('shows adjustment % input', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    expect(screen.getByLabelText(/adjustment %/i)).toBeDefined()
  })

  it('preview table is empty when percent is 0', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    // No price rows when percent = 0
    expect(screen.queryByText('$75.00')).toBeNull()
  })

  it('preview table shows item rows when percent is non-zero', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    const input = screen.getByLabelText(/adjustment %/i)
    fireEvent.change(input, { target: { value: '10' } })
    expect(screen.getByText('General Labor')).toBeDefined()
    expect(screen.getByText('Supervisor')).toBeDefined()
  })

  it('confirm button label shows item count', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    expect(screen.getByRole('button', { name: /apply to 2 items/i })).toBeDefined()
  })

  it('confirm button is disabled when percent is 0', () => {
    render(<BulkAdjustDialog {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /apply to 2 items/i })
    expect(btn).toHaveProperty('disabled', true)
  })

  it('on success: calls onOpenChange(false) and router.refresh()', async () => {
    const onOpenChange = vi.fn()
    render(<BulkAdjustDialog {...defaultProps} onOpenChange={onOpenChange} />)
    const input = screen.getByLabelText(/adjustment %/i)
    fireEvent.change(input, { target: { value: '10' } })
    const btn = screen.getByRole('button', { name: /apply to 2 items/i })
    fireEvent.click(btn)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('on error: does NOT close dialog, calls toast.error', async () => {
    mockBulkAdjust.mockResolvedValue({ error: 'DB failed' })
    const onOpenChange = vi.fn()
    render(<BulkAdjustDialog {...defaultProps} onOpenChange={onOpenChange} />)
    const input = screen.getByLabelText(/adjustment %/i)
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 2 items/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('DB failed'))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('passes folderId === null to action when "Uncategorized" bucket', async () => {
    render(
      <BulkAdjustDialog
        {...defaultProps}
        folderId={null}
        folderName="Uncategorized"
      />
    )
    const input = screen.getByLabelText(/adjustment %/i)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /apply to 2 items/i }))
    await waitFor(() => {
      expect(mockBulkAdjust).toHaveBeenCalledWith(null, 5)
    })
  })
})
