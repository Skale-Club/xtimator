import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, createEvent, cleanup, act } from '@testing-library/react'
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

/** Fires a pointer event with an explicit timeStamp (jsdom's own is wall time). */
function pointer(type: 'pointerDown' | 'pointerMove' | 'pointerUp', el: Element, clientY: number, t: number) {
  const event = createEvent[type](el, { pointerId: 1, clientY, button: 0, pointerType: 'touch' })
  Object.defineProperty(event, 'timeStamp', { value: t })
  fireEvent(el, event)
}

/** A drag that stops before letting go, so the release is a placement, not a flick. */
function drag(el: Element, dy: number) {
  const sheet = el.closest('[role="dialog"]')!
  pointer('pointerDown', el, 400, 0)
  pointer('pointerMove', sheet, 400 + dy, 200)
  pointer('pointerMove', sheet, 400 + dy, 400) // held still: velocity 0
  pointer('pointerUp', sheet, 400 + dy, 450)
}

/** A fast drag: the last step covers 60px in 20ms (3 px/ms). */
function flick(el: Element, dy: number) {
  const sheet = el.closest('[role="dialog"]')!
  pointer('pointerDown', el, 400, 0)
  pointer('pointerMove', sheet, 400 + dy - Math.sign(dy) * 60, 100)
  pointer('pointerMove', sheet, 400 + dy, 120)
  pointer('pointerUp', sheet, 400 + dy, 125)
}

const NATURAL = 500
const sheetEl = () => document.querySelector<HTMLElement>('[role="dialog"]')!
const sheetHeight = () => sheetEl().style.getPropertyValue('--sheet-h')

beforeEach(() => {
  vi.useFakeTimers()
  window.innerHeight = 800
  // jsdom lays nothing out: the sheet's natural height is 500px, and a sheet
  // pulled taller is as tall as the --sheet-h the drag wrote (globals.css
  // turns that into a min-height on a real page).
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-sheet-resized')) return Number.parseFloat(this.style.getPropertyValue('--sheet-h'))
      return NATURAL
    },
  })
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
    expect(sheetEl().hasAttribute('data-sheet-resized')).toBe(false)
  })
})

describe('BottomSheetContent resize', () => {
  it('pulling up makes the sheet taller and never lifts it off the bottom edge', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), -120)
    act(() => { vi.advanceTimersByTime(400) })
    expect(sheetEl().hasAttribute('data-sheet-resized')).toBe(true)
    expect(sheetHeight()).toBe('620px')
    // The old rubber band translated the sheet up and showed its bottom edge.
    expect(sheetEl().style.transform).toBe('')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('stops at the sheet max-height', () => {
    mockPhone(true)
    renderSheet()
    sheetEl().style.maxHeight = '700px'
    drag(screen.getByTestId('sheet-grabber'), -2000)
    expect(sheetHeight()).toBe('700px')
    expect(sheetEl().style.transform).toBe('')
  })

  it('falls back to the window height when no max-height resolves', () => {
    mockPhone(true)
    renderSheet()
    drag(screen.getByTestId('sheet-grabber'), -2000)
    expect(sheetHeight()).toBe('800px')
  })

  it('a slow release keeps the height it was left at', () => {
    mockPhone(true)
    renderSheet()
    drag(screen.getByTestId('header'), -80)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(sheetHeight()).toBe('580px')
  })

  it('pulling down from a taller sheet shrinks it to its natural height before closing', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), -200) // 700px
    drag(screen.getByTestId('sheet-grabber'), 150) // back to 550px
    act(() => { vi.advanceTimersByTime(400) })
    expect(sheetHeight()).toBe('550px')
    expect(sheetEl().style.transform).toBe('')
    expect(onOpenChange).not.toHaveBeenCalled()

    // Down to the floor and 50px past it: springs back at the natural height.
    drag(screen.getByTestId('sheet-grabber'), 100)
    act(() => { vi.advanceTimersByTime(400) })
    expect(sheetEl().hasAttribute('data-sheet-resized')).toBe(false)
    expect(sheetEl().style.transform).toBe('')
    expect(onOpenChange).not.toHaveBeenCalled()

    // A long pull past the floor closes it.
    drag(screen.getByTestId('sheet-grabber'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('one long pull from a taller sheet goes through the floor and closes', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), -200) // 700px
    drag(screen.getByTestId('sheet-grabber'), 500) // 200px to the floor, 300px past it
    act(() => { vi.advanceTimersByTime(400) })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('a flick up opens the sheet to its max-height', () => {
    mockPhone(true)
    renderSheet()
    sheetEl().style.maxHeight = '720px'
    flick(screen.getByTestId('sheet-grabber'), -100)
    expect(sheetHeight()).toBe('720px')
  })

  it('a flick down on a taller sheet returns it to its natural height without closing', () => {
    mockPhone(true)
    const onOpenChange = renderSheet()
    drag(screen.getByTestId('sheet-grabber'), -250) // 750px
    flick(screen.getByTestId('sheet-grabber'), 100) // 650px, flicked down
    act(() => { vi.advanceTimersByTime(400) })
    expect(sheetEl().hasAttribute('data-sheet-resized')).toBe(false)
    expect(sheetEl().style.transform).toBe('')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('a sheet that already opens at its max-height does not grow', () => {
    mockPhone(true)
    renderSheet()
    sheetEl().style.maxHeight = `${NATURAL}px`
    drag(screen.getByTestId('sheet-grabber'), -150)
    expect(sheetEl().hasAttribute('data-sheet-resized')).toBe(false)
    expect(sheetEl().style.transform).toBe('')
  })

  it('a caller that refuses to close keeps the sheet and it springs back', () => {
    mockPhone(true)
    renderSheet(vi.fn()) // never closes: open stays true
    drag(screen.getByTestId('sheet-grabber'), 300)
    act(() => { vi.advanceTimersByTime(400) })
    expect(sheetEl().isConnected).toBe(true)
    expect(sheetEl().style.transform).toBe('')
  })
})
