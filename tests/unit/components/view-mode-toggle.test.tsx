import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ViewModeToggle } from '@/components/workspace/view-mode-toggle'

// Phase 185 Plan 02 (PGMODE-01) — the header ViewModeToggle, the SINGLE
// page-view control in the product (185-UI-SPEC.md §1). Replaces the retired
// floating-pill "Full page"/"Full width" toggle.

beforeEach(() => {
  cleanup()
})

describe('ViewModeToggle (PGMODE-01)', () => {
  it('renders nothing when mode is undefined (slot absent / not yet published)', () => {
    const { container } = render(<ViewModeToggle />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('group', { name: /document view mode/i })).toBeNull()
  })

  it('given mode="width", the Full width button is aria-pressed and Paginated is not', () => {
    render(<ViewModeToggle mode="width" onModeChange={vi.fn()} />)
    const widthBtn = screen.getByRole('button', { name: /full width view/i })
    const pageBtn = screen.getByRole('button', { name: /paginated view/i })
    expect(widthBtn.getAttribute('aria-pressed')).toBe('true')
    expect(pageBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('given mode="page", aria-pressed flips correctly on both buttons', () => {
    render(<ViewModeToggle mode="page" onModeChange={vi.fn()} />)
    const widthBtn = screen.getByRole('button', { name: /full width view/i })
    const pageBtn = screen.getByRole('button', { name: /paginated view/i })
    expect(widthBtn.getAttribute('aria-pressed')).toBe('false')
    expect(pageBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking the paginated-icon button calls onModeChange("page")', () => {
    const onModeChange = vi.fn()
    render(<ViewModeToggle mode="width" onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole('button', { name: /paginated view/i }))
    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('page')
  })

  it('clicking the full-width-icon button calls onModeChange("width")', () => {
    const onModeChange = vi.fn()
    render(<ViewModeToggle mode="page" onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole('button', { name: /full width view/i }))
    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange).toHaveBeenCalledWith('width')
  })

  it('renders exact tooltip copy for both buttons (Copywriting Contract, 185-UI-SPEC.md §6)', async () => {
    render(<ViewModeToggle mode="width" onModeChange={vi.fn()} />)
    fireEvent.focus(screen.getByRole('button', { name: /full width view/i }))
    await vi.waitFor(() => expect(screen.getAllByText('Full width').length).toBeGreaterThan(0))
    fireEvent.focus(screen.getByRole('button', { name: /paginated view/i }))
    await vi.waitFor(() => expect(screen.getAllByText('Paginated (PDF preview)').length).toBeGreaterThan(0))
  })
})
