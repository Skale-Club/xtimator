// tests/unit/pdf/estimate-pdf-modern-company-name-color.test.tsx
//
// Regression guard: Modern's header wraps the company name in a react-pdf
// <Link> when the company has a website. react-pdf paints a <Link> its default
// blue unless the Link's OWN style carries a color (the parent <Text> color
// does not cascade into it), and Modern — unlike Classic — passes no
// `companyNameColor` override to PdfHeader. So Modern's `nameLink` style must
// itself resolve to the same dark gray as `companyName` (#1f2937).
//
// EstimatePDFModern is called as a plain function (no React renderer) and the
// returned tree is walked directly — see estimate-pdf-banner-fill.test.tsx.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { Link } from '@react-pdf/renderer'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type StyledElement = ReactElement<{ style?: unknown; children?: ReactNode; src?: string }>

const NAME_COLOR = '#1f2937'

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

/** Collects every <Link> element whose text equals `text`. */
function findLinksWithText(node: ReactNode, text: string, out: StyledElement[] = []): StyledElement[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => findLinksWithText(n, text, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as StyledElement
  const dn = (el.type as { displayName?: string } | undefined)?.displayName
  if ((el.type === Link || dn === 'Link') && textContent(el.props.children) === text) out.push(el)
  return findLinksWithText(el.props.children, text, out)
}

function renderModern(company: typeof FIXTURE_COMPANY) {
  const estimate = buildFixtureEstimate({})
  const pages = buildPagesForFixture(estimate, company, 'modern')
  return EstimatePDFModern({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: company as any,
    client: null,
    projectName: 'Company Name Color Test',
    projectType: null,
    language: 'en',
    pages,
  })
}

describe('Modern PDF company-name link color', () => {
  it('the website-linked company name resolves to #1f2937, never a blue default', () => {
    expect(FIXTURE_COMPANY.website).toBeTruthy()
    const tree = renderModern(FIXTURE_COMPANY)

    const links = findLinksWithText(tree, FIXTURE_COMPANY.name)
    expect(links.length, 'company name should render inside a <Link> when a website is set').toBeGreaterThan(0)

    for (const link of links) {
      const style = flattenStyle(link.props.style)
      expect(style.color, 'Link style must set an explicit color (else react-pdf paints it blue)').toBe(NAME_COLOR)
      expect(style.textDecoration).toBe('none')
    }
  })
})
