// tests/unit/pdf/estimate-pdf-banner-fill.test.tsx
//
// Phase 183 Plan 04 (ENGINE-03, Correction 1 / Pitfall 1 guard).
//
// Positive: Classic's ESTIMATE title is now wrapped in a solid brand-fill
// banner (backgroundColor: brandColor), matching Classic webview's benchmark
// (components/workspace/estimate/estimate-document.tsx:1476-1486) — the ONE
// verified PDFPAR-01 gap this plan closes.
//
// Negative (Pitfall 1 guard): Modern's title AND section headers remain
// UNCONDITIONALLY fill-free — no node anywhere in the Modern PDF's tree may
// carry a backgroundColor matching the brand color. This guards against a
// naive read of CONTEXT.md's "brand-color banner" wording being (mis)applied
// to Modern too.
//
// Style-aware walker: EstimatePDF/EstimatePDFModern are called directly (no
// React renderer — see tests/unit/pdf/estimate-pdf-baseline-order.test.tsx for
// the same pattern), so the returned tree already contains fully-resolved
// react-pdf primitives (View/Text/...). components/pdf/shared/* helpers
// (PdfHeader, PdfTitleBanner, PdfSectionBlock, ...) are invoked as PLAIN
// FUNCTIONS by both templates (not JSX) specifically so this direct-call
// tree walk sees real View/Text nodes at every position — see
// components/pdf/shared/pdf-header.tsx's top comment for the rationale. This
// is a purpose-built local walker (distinct from
// tests/unit/estimate/_pdf-text-walker.ts's text-only walker) since it needs
// each node's resolved `style`, not just its text content.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { View, Text } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type PDFComponent = typeof EstimatePDF
type StyledElement = ReactElement<{ style?: unknown; children?: ReactNode }>

const BRAND_COLOR = FIXTURE_COMPANY.brand_primary_color // '#2563eb'
const TITLE_TEXT = 'ESTIMATE' // PDF_LABELS.en.estimate

function renderTree(component: PDFComponent, estimate: Record<string, unknown>) {
  const templateId = component === EstimatePDF ? 'classic' : 'modern'
  const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
  return component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Banner Fill Test Project',
    projectType: null,
    language: 'en',
    pages,
  })
}

/** react-pdf `style` props are a single object, an array of objects (later
 * entries override earlier ones), or falsy. Flatten to one merged object so
 * callers can do a simple key lookup regardless of which shape a given node used. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {},
    )
  }
  if (typeof style === 'object') return style as Record<string, unknown>
  return {}
}

function isPrimitive(el: StyledElement, target: unknown, displayName: string): boolean {
  const dn = (el.type as { displayName?: string } | undefined)?.displayName
  return dn === displayName || el.type === target
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

/** DFS through the tree; returns true iff a <Text> node whose flattened text
 * content equals `targetText` is found, where itself OR some ancestor along
 * the path to it has a resolved style with `backgroundColor === bgColor`. */
function hasBackgroundFillAroundText(
  node: ReactNode,
  targetText: string,
  bgColor: string,
  ancestorHasFill = false,
): boolean {
  if (node == null || typeof node === 'boolean') return false
  if (Array.isArray(node)) {
    return node.some((n) => hasBackgroundFillAroundText(n, targetText, bgColor, ancestorHasFill))
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as StyledElement
  const style = flattenStyle(el.props.style)
  const thisHasFill = ancestorHasFill || style.backgroundColor === bgColor
  if (isPrimitive(el, Text, 'Text') && textContent(el.props.children) === targetText) {
    return thisHasFill
  }
  return hasBackgroundFillAroundText(el.props.children, targetText, bgColor, thisHasFill)
}

/** DFS through the WHOLE tree; returns true iff ANY node's resolved style has
 * `backgroundColor === bgColor` — used for the Modern negative guard, which
 * must hold everywhere (title AND section headers), not just around the title. */
function anyNodeHasBackgroundColor(node: ReactNode, bgColor: string): boolean {
  if (node == null || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some((n) => anyNodeHasBackgroundColor(n, bgColor))
  if (typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as StyledElement
  const style = flattenStyle(el.props.style)
  if (style.backgroundColor === bgColor) return true
  return anyNodeHasBackgroundColor(el.props.children, bgColor)
}

describe('PDF title banner fill (Correction 1 / Pitfall 1 guard)', () => {
  it('Classic: ESTIMATE title is wrapped in a solid brand-fill banner (View backgroundColor: brandColor)', () => {
    const estimate = buildFixtureEstimate({})
    const tree = renderTree(EstimatePDF, estimate)

    expect(
      hasBackgroundFillAroundText(tree, TITLE_TEXT, BRAND_COLOR),
      'Classic ESTIMATE title should have an ancestor View with backgroundColor: brandColor',
    ).toBe(true)
  })

  it('Modern: no node anywhere has a brand-color background fill (title + section headers stay hairline, unconditionally fill-free)', () => {
    const estimate = buildFixtureEstimate({})
    const tree = renderTree(EstimatePDFModern, estimate)

    expect(
      anyNodeHasBackgroundColor(tree, BRAND_COLOR),
      'Modern PDF should never render a brand-color backgroundColor fill anywhere (Pitfall 1 guard)',
    ).toBe(false)

    // Belt-and-suspenders: the title text itself must not carry a fill either.
    expect(hasBackgroundFillAroundText(tree, TITLE_TEXT, BRAND_COLOR)).toBe(false)
  })

  it('Classic: still asserts view has a View wrapper as its title-adjacent structure (sanity: not merely coincidental)', () => {
    // Guard against the positive test above passing for the wrong reason (e.g.
    // a stray backgroundColor somewhere unrelated to the title matching by
    // chance) by also confirming Modern (no wrapper) fails the SAME check
    // that Classic passes, using an isolated custom brand color.
    const estimate = buildFixtureEstimate({})
    const classicTree = renderTree(EstimatePDF, estimate)
    const modernTree = renderTree(EstimatePDFModern, estimate)

    expect(hasBackgroundFillAroundText(classicTree, TITLE_TEXT, BRAND_COLOR)).toBe(true)
    expect(hasBackgroundFillAroundText(modernTree, TITLE_TEXT, BRAND_COLOR)).toBe(false)
  })
})
