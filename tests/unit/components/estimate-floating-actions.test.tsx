import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EstimateFloatingActions } from '@/components/workspace/estimate/estimate-floating-actions'

// Wave 4 (162-04) — DOCUX-01 gear button real assertions replacing the Wave 0
// placeholder scaffolds. Every test targets estimate-floating-actions.tsx —
// the `<Pill>` that hosts the gear icon LEFTMOST of Photos / Share. The pill's
// Link-Client slot and "Refine with AI" trigger were removed (Link Client now
// lives inside the gear panel; "Edit with AI" in the header is the single AI
// entry point) — a narrower pill can no longer overflow the preview sideways.

beforeEach(() => {
  cleanup()
})

describe('EstimateFloatingActions gear button (DOCUX-01)', () => {
  it('renders gear button when onOpenSettings prop is provided', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /^settings$/i }),
    ).toBeTruthy()
  })

  it('does NOT render gear button when onOpenSettings prop is undefined (backward-compat)', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /^settings$/i }),
    ).toBeNull()
  })

  it('gear opens settings — clicking gear button invokes onOpenSettings callback', () => {
    const onOpenSettings = vi.fn()
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    )
    const gear = screen.getByRole('button', { name: /^settings$/i })
    fireEvent.click(gear)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('gear button is the LEFTMOST child of the Pill (order: [Gear] Photos Share)', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenPhotos={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    const gear = screen.getByRole('button', { name: /^settings$/i })
    const photos = screen.getByRole('button', { name: /photos/i })
    const share = screen.getByRole('button', { name: /^share$/i })
    // DOCUMENT_POSITION_FOLLOWING === 4 — LHS precedes RHS in document order.
    expect(gear.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(photos.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no "Refine with AI" trigger — the header\'s "Edit with AI" is the one AI entry point', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenPhotos={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(screen.queryByText(/refine with ai/i)).toBeNull()
  })

  it('gear button has aria-label="Settings" for screen readers', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    const gear = screen.getByRole('button', { name: /^settings$/i })
    expect(gear.getAttribute('aria-label')).toBe('Settings')
  })

  it('gear button renders Settings icon from lucide-react (h-3.5 w-3.5)', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    const gear = screen.getByRole('button', { name: /^settings$/i })
    const icon = gear.querySelector('svg')
    expect(icon).toBeTruthy()
    // Lucide sizing tokens applied via className
    expect(icon!.getAttribute('class') ?? '').toMatch(/h-3\.5/)
    expect(icon!.getAttribute('class') ?? '').toMatch(/w-3\.5/)
  })
})

// Quick-260718-w4k — collapsible pill: a chevron after Share collapses the
// pill to a single "Show actions" button; clicking that restores everything.
describe('EstimateFloatingActions collapsible pill (quick-260718-w4k)', () => {
  function renderFull() {
    return render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenPhotos={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
  }

  it('renders expanded by default with a "Hide actions" chevron AFTER Share', () => {
    renderFull()
    const share = screen.getByRole('button', { name: /^share$/i })
    const hide = screen.getByRole('button', { name: /^hide actions$/i })
    expect(share.compareDocumentPosition(hide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^show actions$/i })).toBeNull()
  })

  it('clicking "Hide actions" collapses the pill to a single "Show actions" button', () => {
    renderFull()
    fireEvent.click(screen.getByRole('button', { name: /^hide actions$/i }))
    expect(screen.queryByRole('button', { name: /^show actions$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /photos/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^settings$/i })).toBeNull()
  })

  it('clicking "Show actions" restores all action buttons', () => {
    renderFull()
    fireEvent.click(screen.getByRole('button', { name: /^hide actions$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^show actions$/i }))
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /photos/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^settings$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^hide actions$/i })).toBeTruthy()
  })
})
