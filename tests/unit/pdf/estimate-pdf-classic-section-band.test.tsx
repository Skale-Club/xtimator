// tests/unit/pdf/estimate-pdf-classic-section-band.test.tsx
//
// Regression guard: Classic's section band must sit on the page's content rail
// (same edges as the ESTIMATE title banner) — no negative marginHorizontal
// bleed — with a 10pt inner title inset that the pagination engine mirrors
// (TEMPLATE_LITERALS.classic.sectionTitleHorizontalPaddingPt, covered in
// tests/unit/pagination/blocks-from-model.test.ts). Vertical padding and
// marginTop are charged by blocks-from-model.ts (`8 * 2 + 16`) and must not
// drift.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type StyledElement = ReactElement<{ style?: unknown; children?: ReactNode }>

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {})
  }
  if (typeof style === 'object') return style as Record<string, unknown>
  return {}
}

/** Collects the flattened style of every node whose backgroundColor is `bg`
 * and that directly wraps a text child equal to `title`. */
function findBandStyles(node: ReactNode, bg: string, title: string, out: Record<string, unknown>[] = []) {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => findBandStyles(n, bg, title, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as StyledElement
  const style = flattenStyle(el.props.style)
  const kids = el.props.children
  const kidArr = Array.isArray(kids) ? kids : [kids]
  const wrapsTitle = kidArr.some(
    (k) =>
      k && typeof k === 'object' && 'props' in (k as object) &&
      (k as StyledElement).props.children === title,
  )
  if (style.backgroundColor === bg && wrapsTitle) out.push(style)
  return findBandStyles(kids, bg, title, out)
}

describe('Classic PDF section band geometry', () => {
  it('sits on the content rail: no negative margin, 10pt title inset, vertical metrics unchanged', () => {
    const estimate = buildFixtureEstimate({})
    const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, 'classic')
    const tree = EstimatePDF({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: FIXTURE_COMPANY as any,
      client: null,
      projectName: 'Section Band Test',
      projectType: null,
      language: 'en',
      pages,
    })

    const sections = (estimate as { sections: { title: string }[] }).sections
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      const bands = findBandStyles(tree, FIXTURE_COMPANY.brand_primary_color, section.title)
      expect(bands.length, `band for "${section.title}"`).toBeGreaterThan(0)
      for (const s of bands) {
        expect(s.marginHorizontal ?? 0).toBe(0)
        expect(s.marginLeft ?? 0).toBe(0)
        expect(s.marginRight ?? 0).toBe(0)
        expect(s.paddingHorizontal).toBe(10)
        // Engine charge: 8 * 2 + 16 (blocks-from-model.ts).
        expect(s.paddingVertical).toBe(8)
        expect(s.marginTop).toBe(16)
      }
    }
  })
})
