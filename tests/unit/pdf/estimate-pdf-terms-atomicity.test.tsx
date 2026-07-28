// tests/unit/pdf/estimate-pdf-terms-atomicity.test.tsx
//
// Phase 184 Plan 04 (PGBRK-02) — structural atomicity guard: given all 5
// terms populated (Estimate Terms / Payment Terms / Timeline / Warranty /
// Notes), each renders as its OWN `wrap={false}` PdfTermsCard — none of them
// were individually atomic before this plan (a single shared, non-atomic
// `<View style={termsSection}>` held all 5). Also asserts the totals block's
// outer container is `wrap={false}` (previously relied on default Yoga wrap
// — a real pre-existing gap, not a NEW rule).
//
// Direct-invocation convention: EstimatePDF/EstimatePDFModern are called
// directly (no React renderer — see tests/unit/pdf/estimate-pdf-baseline-
// order.test.tsx for the same pattern). This is a purpose-built local walker
// adapted from tests/unit/pdf/estimate-pdf-banner-fill.test.tsx's
// style-aware DFS pattern, checking `el.props.wrap === false` instead of
// `backgroundColor`.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { View, Text } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type PDFComponent = typeof EstimatePDF
type PropsElement = ReactElement<{ wrap?: boolean; style?: unknown; children?: ReactNode }>

// The fixed emission order this plan pins: estimate -> payment -> timeline ->
// warranty -> notes (English labels — component/labels.ts LABELS.en).
const TERMS_CARD_TITLES = new Set(['Estimate Terms', 'Payment Terms', 'Timeline', 'Warranty', 'Notes'])

const COMPANY_WITH_ESTIMATE_TERMS = {
  ...FIXTURE_COMPANY,
  estimate_terms_enabled: true,
  estimate_terms_text: 'All work guaranteed per the signed contract.',
}

function renderTree(component: PDFComponent) {
  // buildFixtureEstimate({}) already sets payment_terms + warranty_terms —
  // add timeline + notes so all 5 terms cards render.
  const estimate = buildFixtureEstimate({
    timeline: '2-3 weeks from start date',
    notes: 'Please call ahead before arrival.',
  })
  const templateId = component === EstimatePDF ? 'classic' : 'modern'
  const pages = buildPagesForFixture(estimate, COMPANY_WITH_ESTIMATE_TERMS, templateId)
  return component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: COMPANY_WITH_ESTIMATE_TERMS as any,
    client: null,
    projectName: 'Terms Atomicity Test',
    projectType: null,
    language: 'en',
    pages,
  })
}

function isPrimitive(el: PropsElement, target: unknown, displayName: string): boolean {
  const dn = (el.type as { displayName?: string } | undefined)?.displayName
  return dn === displayName || el.type === target
}

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    return textContent((node as PropsElement).props.children)
  }
  return ''
}

/** A PdfTermsCard's View has exactly 2 children: [title Text, body Text] —
 * its own FIRST child is always the title. */
function firstChildTitle(children: ReactNode): string | null {
  const first = Array.isArray(children) ? children[0] : children
  if (first == null || typeof first === 'boolean') return null
  if (typeof first !== 'object' || !('props' in (first as object))) return null
  const el = first as PropsElement
  if (isPrimitive(el, Text, 'Text')) return textContent(el.props.children)
  return null
}

/** DFS collecting every View node with `wrap === false` whose first child is
 * a <Text> matching one of the 5 known terms-card titles — i.e. every
 * individually-atomic PdfTermsCard. */
function collectTermsCardWrapFalseNodes(node: ReactNode, out: PropsElement[]): void {
  if (node == null || typeof node === 'boolean') return
  if (Array.isArray(node)) {
    node.forEach((n) => collectTermsCardWrapFalseNodes(n, out))
    return
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return
  const el = node as PropsElement
  if (isPrimitive(el, View, 'View') && el.props.wrap === false) {
    const title = firstChildTitle(el.props.children)
    if (title && TERMS_CARD_TITLES.has(title)) {
      out.push(el)
    }
  }
  collectTermsCardWrapFalseNodes(el.props.children, out)
}

function containsText(node: ReactNode, target: string): boolean {
  if (node == null || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some((n) => containsText(n, target))
  if (typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as PropsElement
  if (isPrimitive(el, Text, 'Text') && textContent(el.props.children) === target) return true
  return containsText(el.props.children, target)
}

/** The totals block's outer container is the first `wrap={false}` View whose
 * subtree contains the 'Subtotal' label — unambiguous since no terms card or
 * photo-grid row renders that text. */
function findTotalsWrapFalseNode(node: ReactNode): PropsElement | null {
  if (node == null || typeof node === 'boolean') return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findTotalsWrapFalseNode(n)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return null
  const el = node as PropsElement
  if (isPrimitive(el, View, 'View') && el.props.wrap === false && containsText(el.props.children, 'Subtotal')) {
    return el
  }
  return findTotalsWrapFalseNode(el.props.children)
}

describe.each([
  ['Classic', EstimatePDF],
  ['Modern', EstimatePDFModern],
] as const)('%s PDF terms + totals atomicity (PGBRK-02)', (_label, component) => {
  it('all 5 terms cards are independently wrap={false} PdfTermsCards', () => {
    const tree = renderTree(component)
    const nodes: PropsElement[] = []
    collectTermsCardWrapFalseNodes(tree, nodes)
    expect(nodes).toHaveLength(5)
    for (const node of nodes) {
      expect(node.props.wrap).toBe(false)
    }
  })

  it("the totals block's outer container is wrap={false}", () => {
    const tree = renderTree(component)
    const totalsNode = findTotalsWrapFalseNode(tree)
    expect(totalsNode).not.toBeNull()
    expect(totalsNode?.props.wrap).toBe(false)
  })
})
