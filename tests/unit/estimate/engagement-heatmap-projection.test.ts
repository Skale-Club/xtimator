import { describe, it, expect } from 'vitest'
import { projectClickPoint } from '@/components/workspace/estimate/engagement-heatmap'

// Phase 193 Plan 03 (Task 3) — pure y-scaling/projection helper, extracted so
// the "x = x_pct/100 * W, y = y_px * (renderedDocHeight / doc_h)" formula
// (193-03-PLAN.md Task 3) is verifiable without a canvas/DOM.

describe('projectClickPoint', () => {
  it('maps x as a straight percentage of the rendered width', () => {
    const { x } = projectClickPoint({ xPct: 50, yPx: 0, docH: 1000 }, 800, 1000)
    expect(x).toBe(400)
  })

  it('rescales y by renderedHeight/docH when the rendered doc height matches capture time (scale 1)', () => {
    const { y } = projectClickPoint({ xPct: 0, yPx: 300, docH: 1000 }, 800, 1000)
    expect(y).toBe(300)
  })

  it('rescales y proportionally when the current render is TALLER than at capture time', () => {
    // Captured on a 1000px-tall doc at y=300 (30% down); now rendered at 2000px tall.
    const { y } = projectClickPoint({ xPct: 0, yPx: 300, docH: 1000 }, 800, 2000)
    expect(y).toBe(600)
  })

  it('rescales y proportionally when the current render is SHORTER than at capture time', () => {
    const { y } = projectClickPoint({ xPct: 0, yPx: 300, docH: 1000 }, 800, 500)
    expect(y).toBe(150)
  })

  it('falls back to scale 1 (no divide-by-zero) when docH is 0', () => {
    const { y } = projectClickPoint({ xPct: 0, yPx: 300, docH: 0 }, 800, 1000)
    expect(y).toBe(300)
  })
})
