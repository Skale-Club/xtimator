import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SignaturePad } from '@/components/share/signature-pad'

// jsdom has no canvas: stub a recording 2D context, layout sizes, DPR and
// ResizeObserver so the pad's sizing + pointer mapping can be exercised.
const calls: { fn: string; args: unknown[] }[] = []
function makeCtx() {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        return (...args: unknown[]) => {
          calls.push({ fn: prop, args })
        }
      },
      set() {
        return true
      },
    }
  )
}

let box = { w: 330, h: 160 }
let roCallbacks: (() => void)[] = []

beforeEach(() => {
  calls.length = 0
  box = { w: 330, h: 160 }
  roCallbacks = []
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => makeCtx() as unknown as CanvasRenderingContext2D
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ left: 10, top: 20, width: box.w, height: box.h, right: 0, bottom: 0, x: 10, y: 20, toJSON() {} }) as DOMRect
  )
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => box.w })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => box.h })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // @ts-expect-error cleanup of the test-only overrides
  delete HTMLCanvasElement.prototype.clientWidth
  // @ts-expect-error cleanup of the test-only overrides
  delete HTMLCanvasElement.prototype.clientHeight
})

function mount(onSignatureChange = vi.fn()) {
  const utils = render(
    <SignaturePad
      signerName=""
      onSignerNameChange={() => {}}
      signerEmail=""
      onSignerEmailChange={() => {}}
      onSignatureChange={onSignatureChange}
    />
  )
  const canvas = utils.container.querySelector('canvas') as HTMLCanvasElement
  return { ...utils, canvas, onSignatureChange }
}

function stroke(canvas: HTMLCanvasElement, pts: [number, number][]) {
  const [first, ...rest] = pts
  fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: first[0], clientY: first[1] })
  for (const [x, y] of rest) fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y })
  fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' })
}

describe('SignaturePad canvas', () => {
  it('sizes the bitmap from displayed size x DPR and scales the context by DPR', () => {
    const { canvas } = mount()
    expect(canvas.width).toBe(660)
    expect(canvas.height).toBe(320)
    expect(calls.some((c) => c.fn === 'setTransform' && c.args.join() === '2,0,0,2,0,0')).toBe(true)
    // The displayed size is CSS-only: 160px tall (h-40), full width, no inline stretch.
    expect(canvas.className).toContain('h-40')
    expect(canvas.className).toContain('touch-none')
    expect(canvas.style.height).toBe('')
  })

  it('maps pointer positions in CSS pixels (no 600/width stretch, no DPR factor)', () => {
    const { canvas } = mount()
    calls.length = 0
    // canvas rect origin is (10,20): client (175,100) -> css (165,80)
    stroke(canvas, [[175, 100], [185, 110]])
    const move = calls.find((c) => c.fn === 'moveTo')!
    const line = calls.find((c) => c.fn === 'lineTo')!
    expect(move.args).toEqual([165, 80])
    expect(line.args).toEqual([175, 90])
  })

  it('exports a fixed 600x160 PNG regardless of displayed size / DPR', () => {
    const { canvas, onSignatureChange } = mount()
    const createSpy = vi.spyOn(document, 'createElement')
    stroke(canvas, [[20, 40], [200, 60], [300, 120]])
    expect(onSignatureChange).toHaveBeenLastCalledWith('data:image/png;base64,AAAA')
    const out = createSpy.mock.results
      .map((r) => r.value)
      .find((el) => el instanceof HTMLCanvasElement) as HTMLCanvasElement
    expect(out.width).toBe(600)
    expect(out.height).toBe(160)
  })

  it('a bare tap leaves no signature', () => {
    const { canvas, onSignatureChange } = mount()
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' })
    expect(onSignatureChange).not.toHaveBeenCalled()
    expect(screen.queryByText('Clear')).toBeNull()
  })

  it('resize PRESERVES the drawing: bitmap re-sized, strokes redrawn uniformly, still non-empty', () => {
    const { canvas } = mount()
    stroke(canvas, [[20, 40], [200, 60]])
    expect(screen.getByText('Clear')).toBeTruthy()

    calls.length = 0
    box = { w: 660, h: 160 } // e.g. phone rotated to landscape
    act(() => roCallbacks.forEach((cb) => cb()))

    expect(canvas.width).toBe(1320)
    expect(canvas.height).toBe(320)
    // strokes were redrawn (moveTo/lineTo after the clear) with a uniform scale of 1
    // (height-limited) and horizontal centering: x shifted by (660-330)/2 = 165.
    const move = calls.find((c) => c.fn === 'moveTo')!
    const line = calls.find((c) => c.fn === 'lineTo')!
    expect(move.args).toEqual([10 + 165, 20])
    expect(line.args).toEqual([190 + 165, 40])
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('Clear resets to the empty state and reports null', () => {
    const { canvas, onSignatureChange } = mount()
    stroke(canvas, [[20, 40], [200, 60]])
    fireEvent.click(screen.getByText('Clear'))
    expect(onSignatureChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText('Clear')).toBeNull()
  })
})
