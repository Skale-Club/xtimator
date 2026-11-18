import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BottomSheetContent } from '@/components/ui/bottom-sheet'

// The shared bottom sheet (components/ui/bottom-sheet.tsx): the grab handle and
// any data-sheet-drag header really drag on phones, and a long enough pull
// closes the sheet through the caller's onOpenChange.

function mockPhone(isPhone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 639px)' ? isPhone : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

function renderSheet(onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <div data-sheet-drag="" data-testid="header">
          <DialogTitle>Title</DialogTitle>
          <button type="button">Header button</button>
        </div>
        <DialogDescription>Body</DialogDescription>
      </BottomSheetContent>
    </Dialog>,
  )
  return onOpenChange
}

function drag(el: Element, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientY: 100, button: 0, pointerType: 'touch' })
  const sheet = el.closest('[role="dialog"]')!
  fireEvent.pointerMove(sheet, { pointerId: 1, clientY: 100 + dy, pointerType: 'touch' })
  fireEvent.pointerUp(sheet, { pointerId: 1, clientY: 100 + dy, pointerType: 'touch' })
}

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom lays nothing out: give the sheet a height so the 30% rule applies.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 500 })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BottomSheetContent', () => {
  it('renders a grab handle and marks itself as a bottom sheet', () => {
    mockPhone(true)
    renderSheet()
    expect(screen.getByTestId('sheet-grabber')).toBeTruthy()
    expect(document.querySelector('[data-slot="dialog-content"][data-bottom-sheet]')).not.toBeNull()
  })

  it('a long pull on the handle closes the sheet through onOpenChange', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('the header drags too', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('header'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('a short pull springs back and keeps the sheet open', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), 40)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).not.toHaveBeenCalled()
    const sheet = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(sheet.style.transform).toBe('')
  })

  it('a button inside the header keeps its tap and never starts a drag', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByText('Header button'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('does not drag on desktop widths', () => {
    mockPhone(false)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
