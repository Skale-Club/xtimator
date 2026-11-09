import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EstimateFloatingActions } from '@/components/workspace/estimate/estimate-floating-actions'

// Platform-admin estimate debug tool: the floating bar only draws the discreet
// "Estimate debug" button when the editor hands it an `onOpenDebug` handler, and
// the editor does that only for the server-resolved platform-admin flag.

function renderBar(onOpenDebug?: () => void) {
  return render(
    <EstimateFloatingActions
      isCurrent
      status="idle"
      onSend={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenDebug={onOpenDebug}
    />,
  )
}

describe('EstimateFloatingActions - debug trigger', () => {
  it('renders no debug button without a handler (non-admin)', () => {
    renderBar()
    expect(screen.queryByTestId('estimate-debug-trigger')).toBeNull()
    expect(screen.queryByLabelText('Estimate debug')).toBeNull()
  })

  it('renders a labelled icon-only button and calls the handler (platform admin)', () => {
    const onOpenDebug = vi.fn()
    renderBar(onOpenDebug)
    const button = screen.getByTestId('estimate-debug-trigger')
    expect(button).toHaveAttribute('aria-label', 'Estimate debug')
    expect(button).toHaveAttribute('title', 'Estimate debug')
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    expect(onOpenDebug).toHaveBeenCalledTimes(1)
  })

  it('renders nothing at all on a superseded version, debug button included', () => {
    const { container } = render(
      <EstimateFloatingActions isCurrent={false} status="idle" onSend={vi.fn()} onOpenDebug={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
