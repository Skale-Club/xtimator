import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EstimateFloatingActions } from '@/components/workspace/estimate/estimate-floating-actions'

// Wave 4 (162-04) — DOCUX-01 gear button real assertions replacing the Wave 0
// placeholder scaffolds. Every test targets estimate-floating-actions.tsx —
// the `<Pill>` that hosts the gear icon LEFTMOST of linkClientSlot / Photos /
// Send.

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

  it('gear button is the LEFTMOST child of the Pill (order: [Gear] linkClientSlot Photos Send)', () => {
    render(
      <EstimateFloatingActions
        isCurrent
        status="idle"
        onSend={vi.fn()}
        onOpenPhotos={vi.fn()}
        onOpenSettings={vi.fn()}
        linkClientSlot={<span data-testid="lcs">slot</span>}
      />,
    )
    const gear = screen.getByRole('button', { name: /^settings$/i })
    const slot = screen.getByTestId('lcs')
    const photos = screen.getByRole('button', { name: /photos/i })
    const send = screen.getByRole('button', { name: /^send$/i })
    // DOCUMENT_POSITION_FOLLOWING === 4 — LHS precedes RHS in document order.
    expect(gear.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(slot.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(photos.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
