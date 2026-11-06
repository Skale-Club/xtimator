// tests/unit/pdf/estimate-pdf-classic-colors-subtotal.test.tsx
//
// Classic PDF polish:
//   1. The ESTIMATE banner and the section header bands use white text on the
//      default saturated brand blue (largeText contrast rule), not black.
//   2. The company name (full header AND compact header) is neutral foreground
//      (#1f2937), never the brand colour.
//   3. A single visible section draws no "Section Subtotal" row; two sections
//      keep one per section.
//
// EstimatePDF is called as a plain function and the returned tree is walked
// directly — same technique as estimate-pdf-banner-fill.test.tsx.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type StyledElement = ReactElement<{ style?: unknown; children?: ReactNode }>

const DEFAULT_BLUE = '#406EF1' // white 4.45 vs black 4.72 -> raw contrast would pick black
const NAME_COLOR = '#1f2937'
const COMPANY = { ...FIXTURE_COMPANY, brand_primary_color: DEFAULT_BLUE }

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {})
  }
  if (typeof style === 'object') return style as Record<string, unknown>
  return {}
}

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    return textContent((node as StyledElement).props.children)
  }
  return ''
}

/** Every element whose flattened text content equals `text`, innermost matches only. */
function findByText(node: ReactNode, text: string, out: StyledElement[] = []): StyledElement[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => findByText(n, text, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as StyledElement
  const before = out.length
  findByText(el.props.children, text, out)
  if (out.length === before && textContent(el.props.children) === text) out.push(el)
  return out
}

function render(estimate: Record<string, unknown>) {
  const pages = buildPagesForFixture(estimate, COMPANY, 'classic')
  return {
    pages,
    tree: EstimatePDF({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      estimate: estimate as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: COMPANY as any,
      client: null,
      projectName: 'Colors Test Project',
      projectType: null,
      language: 'en',
      pages,
    }),
  }
}

function twoSectionEstimate() {
  return buildFixtureEstimate({})
}

function oneSectionEstimate() {
  const e = buildFixtureEstimate({}) as { sections: unknown[] }
  return buildFixtureEstimate({ sections: [e.sections[0]] })
}

describe('Classic PDF — contrast on brand fills', () => {
  it('ESTIMATE banner text is white on the default brand blue', () => {
    const { tree } = render(twoSectionEstimate())
    const els = findByText(tree, 'ESTIMATE')
    expect(els.length).toBeGreaterThan(0)
    expect(flattenStyle(els[0].props.style).color).toBe('#ffffff')
  })

  it('section header band text is white on the default brand blue', () => {
    const e = twoSectionEstimate() as { sections: { title: string }[] }
    const { tree } = render(e)
    const els = findByText(tree, e.sections[0].title)
    expect(els.length).toBeGreaterThan(0)
    expect(flattenStyle(els[0].props.style).color).toBe('#ffffff')
  })
})

describe('Classic PDF — company name colour', () => {
  it('full header company name (and its website link) is neutral foreground, not the brand colour', () => {
    const { tree } = render(twoSectionEstimate())
    // The footer repeats the name without a colour override (inherits the page
    // colour #1f2937), so only elements that set a colour are checked here.
    const els = findByText(tree, COMPANY.name).filter((el) => flattenStyle(el.props.style).color !== undefined)
    expect(els.length).toBeGreaterThan(0)
    for (const el of els) {
      const color = flattenStyle(el.props.style).color
      expect(color).toBe(NAME_COLOR)
      expect(color).not.toBe(DEFAULT_BLUE)
    }
  })

  it('compact header company name (pages 2+) is neutral foreground too', () => {
    // Force several pages so a compact header is rendered.
    const e = buildFixtureEstimate({}) as { sections: { items: unknown[] }[] }
    const bigItems = Array.from({ length: 90 }, (_, i) => ({
      ...(e.sections[0].items[0] as object),
      id: `big-${i}`,
      description: `Long line item number ${i}`,
    }))
    const big = buildFixtureEstimate({ sections: [{ ...e.sections[0], items: bigItems }, e.sections[1]] })
    const { tree, pages } = render(big)
    expect(pages.length).toBeGreaterThan(1)
    const els = findByText(tree, COMPANY.name).filter((el) => flattenStyle(el.props.style).color !== undefined)
    expect(els.length).toBeGreaterThan(1)
    for (const el of els) expect(flattenStyle(el.props.style).color).toBe(NAME_COLOR)
  })
})

describe('Classic PDF — Section Subtotal', () => {
  it('single visible section: no Section Subtotal row (page blocks and drawn tree)', () => {
    const { tree, pages } = render(oneSectionEstimate())
    expect(pages.flatMap((p) => p.blocks).some((b) => b.kind === 'section-subtotal')).toBe(false)
    expect(findByText(tree, 'Section Subtotal')).toHaveLength(0)
  })

  it('two sections: one Section Subtotal row per section', () => {
    const { tree, pages } = render(twoSectionEstimate())
    expect(pages.flatMap((p) => p.blocks).filter((b) => b.kind === 'section-subtotal')).toHaveLength(2)
    expect(findByText(tree, 'Section Subtotal')).toHaveLength(2)
  })
})
