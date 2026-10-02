import { describe, it, expect } from 'vitest'
import {
  SIGNATURE_EXPORT_HEIGHT,
  SIGNATURE_EXPORT_WIDTH,
  clientToCanvasPoint,
  computeBitmapSize,
  computeExportLayout,
  fitTransform,
  strokesBounds,
  transformStrokes,
} from '@/components/share/signature-geometry'

describe('computeBitmapSize', () => {
  it('multiplies the displayed size by devicePixelRatio (same aspect as the box)', () => {
    const { width, height, dpr } = computeBitmapSize(330, 160, 3)
    expect({ width, height, dpr }).toEqual({ width: 990, height: 480, dpr: 3 })
    expect(width / height).toBeCloseTo(330 / 160, 2)
  })

  it('keeps the displayed aspect at fractional DPRs (no stretch)', () => {
    const { width, height } = computeBitmapSize(333, 160, 2.625)
    expect(width / height).toBeCloseTo(333 / 160, 2)
  })

  it('clamps DPR to [1, 3] and tolerates garbage', () => {
    expect(computeBitmapSize(100, 50, 0.5).dpr).toBe(1)
    expect(computeBitmapSize(100, 50, 5).dpr).toBe(3)
    expect(computeBitmapSize(100, 50, NaN).dpr).toBe(1)
  })

  it('never returns a zero-sized bitmap', () => {
    expect(computeBitmapSize(0, 0, 2)).toMatchObject({ width: 1, height: 1 })
  })
})

describe('clientToCanvasPoint', () => {
  const rect = { left: 20, top: 100, width: 330, height: 160 }

  it('maps pointer coordinates 1:1 into CSS pixels (the old code scaled x by 600/330)', () => {
    // 330px-wide phone canvas: a point 165px in must be x=165, not 165*600/330=300.
    expect(clientToCanvasPoint(20 + 165, 100 + 80, rect, 330, 160)).toEqual({ x: 165, y: 80 })
  })

  it('is origin-relative', () => {
    expect(clientToCanvasPoint(20, 100, rect, 330, 160)).toEqual({ x: 0, y: 0 })
    expect(clientToCanvasPoint(350, 260, rect, 330, 160)).toEqual({ x: 330, y: 160 })
  })

  it('applies the same factor on both axes when the rect is CSS-scaled', () => {
    const scaled = { left: 0, top: 0, width: 660, height: 320 } // 2x transform
    expect(clientToCanvasPoint(330, 160, scaled, 330, 160)).toEqual({ x: 165, y: 80 })
  })

  it('does not depend on devicePixelRatio (the context is scaled by DPR instead)', () => {
    // Same pointer, any DPR: the helper takes no DPR at all.
    expect(clientToCanvasPoint(120, 150, rect, 330, 160)).toEqual({ x: 100, y: 50 })
  })

  it('returns the origin for a degenerate rect', () => {
    expect(clientToCanvasPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 330, 160)).toEqual({ x: 0, y: 0 })
  })
})

describe('fitTransform / transformStrokes (resize preserves the drawing)', () => {
  it('uses ONE scale for both axes and centers (no stretch)', () => {
    const t = fitTransform({ width: 300, height: 160 }, { width: 600, height: 160 })
    expect(t.scale).toBe(1) // height-limited
    expect(t.offsetX).toBe(150)
    expect(t.offsetY).toBe(0)
  })

  it('shrinks uniformly when the box gets narrower', () => {
    const t = fitTransform({ width: 600, height: 160 }, { width: 300, height: 160 })
    expect(t.scale).toBe(0.5)
    expect(t.offsetY).toBe(40)
    const [stroke] = transformStrokes([[{ x: 600, y: 160 }]], t)
    expect(stroke[0]).toEqual({ x: 300, y: 120 })
  })

  it('preserves stroke shape (aspect of the stroke is unchanged)', () => {
    const before = [[{ x: 0, y: 0 }, { x: 200, y: 50 }]]
    const t = fitTransform({ width: 330, height: 160 }, { width: 500, height: 160 })
    const after = transformStrokes(before, t)
    const w = after[0][1].x - after[0][0].x
    const h = after[0][1].y - after[0][0].y
    expect(w / h).toBeCloseTo(200 / 50, 6)
  })

  it('is the identity for an unchanged size', () => {
    expect(fitTransform({ width: 330, height: 160 }, { width: 330, height: 160 })).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    })
  })
})

describe('export layout (the PNG that goes into the PDF)', () => {
  it('export frame matches the PDF signature box aspect (150x40 = 3.75:1)', () => {
    expect(SIGNATURE_EXPORT_WIDTH / SIGNATURE_EXPORT_HEIGHT).toBeCloseTo(150 / 40, 6)
  })

  it('computes bounds across strokes (and null when empty)', () => {
    expect(strokesBounds([])).toBeNull()
    expect(
      strokesBounds([
        [{ x: 10, y: 20 }, { x: 30, y: 5 }],
        [{ x: 50, y: 60 }],
      ])
    ).toEqual({ minX: 10, minY: 5, maxX: 50, maxY: 60 })
  })

  it('scales a wide signature uniformly into the frame and centers it', () => {
    const bounds = { minX: 10, minY: 40, maxX: 310, maxY: 100 } // 300x60 on a phone
    const l = computeExportLayout(bounds)
    // width-limited: (600-24)/300 = 1.92 ; height would allow (160-24)/60 = 2.27
    expect(l.scale).toBeCloseTo(1.92, 6)
    const drawnW = 300 * l.scale
    const drawnH = 60 * l.scale
    expect(l.offsetX + bounds.minX * l.scale).toBeCloseTo((600 - drawnW) / 2, 6)
    expect(l.offsetY + bounds.minY * l.scale).toBeCloseTo((160 - drawnH) / 2, 6)
  })

  it('fits a tall signature by height (never overflows the frame)', () => {
    const l = computeExportLayout({ minX: 0, minY: 0, maxX: 100, maxY: 150 })
    expect(l.scale).toBeCloseTo((160 - 24) / 150, 6)
    expect(100 * l.scale).toBeLessThanOrEqual(600)
  })

  it('caps upscaling of a tiny scribble and keeps the pen width sane', () => {
    const l = computeExportLayout({ minX: 0, minY: 0, maxX: 2, maxY: 2 })
    expect(l.scale).toBe(4)
    expect(l.lineWidth).toBeGreaterThanOrEqual(2)
    expect(l.lineWidth).toBeLessThanOrEqual(5)
  })

  it('output geometry is independent of where on the on-screen canvas it was drawn', () => {
    const a = computeExportLayout({ minX: 10, minY: 10, maxX: 210, maxY: 70 })
    const b = computeExportLayout({ minX: 110, minY: 60, maxX: 310, maxY: 120 })
    expect(a.scale).toBeCloseTo(b.scale, 9)
    // same drawn rect in the export frame
    expect(a.offsetX + 10 * a.scale).toBeCloseTo(b.offsetX + 110 * b.scale, 6)
    expect(a.offsetY + 10 * a.scale).toBeCloseTo(b.offsetY + 60 * b.scale, 6)
  })
})
