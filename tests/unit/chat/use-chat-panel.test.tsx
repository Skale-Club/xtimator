import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useChatPanel } from '@/hooks/use-chat-panel'

const MOBILE_KEY = 'xtimator.chat-panel.v1.mobile'
const DESKTOP_KEY = 'xtimator.chat-panel.v1.desktop'
const saved = { x: 24, y: 40, width: 320, height: 500 }

class FakeViewport extends EventTarget {
  offsetLeft = 0
  offsetTop = 0
  width = 390
  height = 844
  resize(height: number, offsetTop = 0) {
    this.height = height
    this.offsetTop = offsetTop
    this.dispatchEvent(new Event('resize'))
  }
}

function pointerTarget() {
  return Object.assign(document.createElement('div'), {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  })
}

function pointer(target: HTMLElement, type: string, x = 100, y = 200, pointerId = 1, pointerType = 'touch'): ReactPointerEvent<HTMLElement> {
  return { currentTarget: target, target, type, clientX: x, clientY: y, pointerId, pointerType, button: 0, preventDefault: vi.fn() } as unknown as ReactPointerEvent<HTMLElement>
}

describe('useChatPanel', () => {
  let viewport: FakeViewport

  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 844)
    viewport = new FakeViewport()
    vi.stubGlobal('visualViewport', viewport)
    localStorage.setItem(MOBILE_KEY, JSON.stringify(saved))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('restores saved geometry when reopening and after a fresh mount', () => {
    const first = renderHook(() => useChatPanel())
    expect(first.result.current.rect).toEqual(saved)
    act(() => first.result.current.place(new DOMRect(300, 740, 56, 56)))
    expect(first.result.current.rect).toEqual(saved)
    first.unmount()
    expect(renderHook(() => useChatPanel()).result.current.rect).toEqual(saved)
  })

  it('temporarily fits the visual viewport keyboard and restores the preference when it closes', () => {
    const { result } = renderHook(() => useChatPanel())
    act(() => viewport.resize(340, 100))
    expect(result.current.rect.height).toBeLessThan(saved.height)
    expect(result.current.rect.y).toBeGreaterThanOrEqual(100)
    expect(result.current.rect.y + result.current.rect.height).toBeLessThanOrEqual(440)
    expect(JSON.parse(localStorage.getItem(MOBILE_KEY)!)).toEqual(saved)
    act(() => viewport.resize(844))
    expect(result.current.rect).toEqual(saved)
  })

  it.each(['move', 'top', 'corner'] as const)('captures a touch %s gesture and persists only its completed result', (kind) => {
    const { result } = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => result.current.handlers(kind).onPointerDown(pointer(target, 'pointerdown')))
    expect(target.setPointerCapture).toHaveBeenCalledWith(1)
    act(() => result.current.handlers(kind).onPointerMove(pointer(target, 'pointermove', 120, 250)))
    expect(result.current.rect).not.toEqual(saved)
    expect(JSON.parse(localStorage.getItem(MOBILE_KEY)!)).toEqual(saved)
    act(() => result.current.handlers(kind).onPointerUp(pointer(target, 'pointerup', 120, 250)))
    expect(JSON.parse(localStorage.getItem(MOBILE_KEY)!)).toEqual(result.current.rect)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(result.current.gestureKind).toBeNull()
  })

  it('finishes a moved gesture if pointer capture is lost', () => {
    const { result } = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => result.current.handlers('move').onPointerDown(pointer(target, 'pointerdown')))
    act(() => result.current.handlers('move').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    act(() => result.current.handlers('move').onLostPointerCapture(pointer(target, 'lostpointercapture')))
    expect(JSON.parse(localStorage.getItem(MOBILE_KEY)!)).toEqual(result.current.rect)
    expect(result.current.gestureKind).toBeNull()
  })

  it('reopens and reloads a completed resize at the chosen position and size', () => {
    const hook = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => hook.result.current.handlers('corner').onPointerDown(pointer(target, 'pointerdown')))
    act(() => hook.result.current.handlers('corner').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    act(() => hook.result.current.handlers('corner').onPointerUp(pointer(target, 'pointerup', 120, 250)))
    const chosen = { ...hook.result.current.rect }
    expect(chosen).toEqual({ ...saved, width: 340, height: 550 })
    act(() => hook.result.current.place(new DOMRect(12, 740, 56, 56)))
    expect(hook.result.current.rect).toEqual(chosen)
    hook.unmount()
    expect(renderHook(() => useChatPanel()).result.current.rect).toEqual(chosen)
  })

  it('cancels a touch gesture without saving the partially dragged position', () => {
    const { result } = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => result.current.handlers('move').onPointerDown(pointer(target, 'pointerdown')))
    act(() => result.current.handlers('move').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    act(() => result.current.handlers('move').onPointerCancel(pointer(target, 'pointercancel')))
    expect(result.current.rect).toEqual(saved)
    expect(JSON.parse(localStorage.getItem(MOBILE_KEY)!)).toEqual(saved)
  })

  it('retains the full preferred rectangle after a gesture is cancelled with the keyboard open', () => {
    const { result } = renderHook(() => useChatPanel())
    act(() => viewport.resize(340))
    const target = pointerTarget()
    act(() => result.current.handlers('move').onPointerDown(pointer(target, 'pointerdown')))
    act(() => result.current.handlers('move').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    act(() => result.current.handlers('move').onPointerCancel(pointer(target, 'pointercancel')))
    act(() => viewport.resize(844))
    expect(result.current.rect).toEqual(saved)
  })

  it('ignores additional touch pointers until the first gesture has ended', () => {
    const { result } = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => result.current.handlers('move').onPointerDown(pointer(target, 'pointerdown')))
    act(() => result.current.handlers('move').onPointerDown(pointer(target, 'pointerdown', 200, 300, 2)))
    act(() => result.current.handlers('move').onPointerMove(pointer(target, 'pointermove', 220, 350, 2)))
    expect(result.current.rect).toEqual(saved)
    act(() => result.current.handlers('move').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    expect(result.current.rect).toEqual({ ...saved, x: 44, y: 90 })
  })

  it('switches between separate desktop and phone preferences on a layout resize', () => {
    const desktop = { x: 700, y: 150, width: 420, height: 600 }
    localStorage.setItem(DESKTOP_KEY, JSON.stringify(desktop))
    const { result } = renderHook(() => useChatPanel())
    act(() => {
      vi.stubGlobal('innerWidth', 1440)
      viewport.width = 1440
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.rect).toEqual(desktop)
    act(() => {
      vi.stubGlobal('innerWidth', 390)
      viewport.width = 390
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.rect).toEqual(saved)
  })

  it('falls back to the layout viewport when visualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined)
    const { result } = renderHook(() => useChatPanel())
    expect(result.current.rect).toEqual(saved)
  })

  it('keeps working for the session when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useChatPanel())
    const target = pointerTarget()
    act(() => result.current.handlers('corner').onPointerDown(pointer(target, 'pointerdown')))
    act(() => result.current.handlers('corner').onPointerMove(pointer(target, 'pointermove', 120, 250)))
    act(() => result.current.handlers('corner').onPointerUp(pointer(target, 'pointerup', 120, 250)))
    const chosen = { ...result.current.rect }
    act(() => result.current.place())
    expect(result.current.rect).toEqual(chosen)
  })
})
