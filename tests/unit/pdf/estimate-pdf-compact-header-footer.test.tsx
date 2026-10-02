// tests/unit/pdf/estimate-pdf-compact-header-footer.test.tsx
//
// Header/footer identification on a multi-page estimate PDF, both templates:
//   - page 1 draws the FULL header (contacts + address), pages 2+ the one-line
//     COMPACT header (company name + "Estimate #<number>" and nothing else);
//   - the language chip ("ES"/"PT") is drawn only for non-English documents,
//     only on page 1 (the compact header never has it);
//   - the number reuses the info grid's formatting (estimate_number, falling
//     back to the 4-digit-padded sequence);
//   - the footer reads "{company} · Estimate #{n} · Page N of M" and M equals the
//     real page count (real render, text-extracted with poppler's pdftotext,
//     skipped visibly where that binary is absent).
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { renderToBuffer, Page as PDFPage } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { LABELS as PDF_LABELS } from '@/lib/estimate/document/labels'
import { formatEstimateNumber } from '@/lib/estimate/document/format'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import { buildMultiPageFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type ElementWithChildren = ReactElement<{ children?: ReactNode }>
type PDFComponent = typeof EstimatePDF

const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined

function isPageElement(node: ReactNode): boolean {
  if (node == null || typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as ElementWithChildren
  return el.type === PDFPage || (el.type as { displayName?: string })?.displayName === 'Page'
}

function collectPageSubtrees(node: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => collectPageSubtrees(n, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as ElementWithChildren
  if (isPageElement(el)) {
    out.push(el.props.children)
    return out
  }
  collectPageSubtrees(el.props.children, out)
  return out
}

const FULL_HEADER_ONLY_TEXTS = ['jamie@acme.test', 'https://acme.test', '123 Main St\nAustin, TX 78701']

function props(estimate: Record<string, unknown>, language: EstimateLanguage, templateId: EstimateTemplateId) {
  return {
    estimate: estimate as never,
    company: FIXTURE_COMPANY as never,
    client: null,
    projectName: 'Header Test',
    projectType: null,
    language,
    pages: buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId, { language }),
  }
}

function pdftotextLayout(buf: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hdrftr-'))
  try {
    const file = path.join(dir, 'out.pdf')
    writeFileSync(file, buf)
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe.each([
  ['Classic', EstimatePDF, 'classic'],
  ['Modern', EstimatePDFModern, 'modern'],
] as const)('%s PDF — compact header on pages 2+, footer identification', (_label, component: PDFComponent, templateId: EstimateTemplateId) => {
  const estimate = buildMultiPageFixtureEstimate({ estimate_number: 'EST-1042' })

  it('page 1 has the full header; every later page has ONLY company name + estimate identifier', () => {
    const p = props(estimate, 'en', templateId)
    expect(p.pages.length).toBeGreaterThanOrEqual(3)
    const subtrees = collectPageSubtrees(component(p))
    expect(subtrees.length).toBe(p.pages.length)

    const identifier = `${PDF_LABELS.en.estimateNum}EST-1042`
    subtrees.forEach((subtree, i) => {
      const texts: string[] = []
      collectTextNodes(subtree, texts)
      expect(texts, `page ${i + 1} company name`).toContain('Acme Renovations')
      if (i === 0) {
        for (const t of FULL_HEADER_ONLY_TEXTS) expect(texts.join('|'), `page 1 has ${t}`).toContain(t)
      } else {
        expect(texts, `page ${i + 1} identifier`).toContain(identifier)
        for (const t of FULL_HEADER_ONLY_TEXTS) expect(texts.join('|'), `page ${i + 1} must not repeat ${t}`).not.toContain(t)
      }
    })
  })

  it('the identifier falls back to the zero-padded sequence when estimate_number is null (same as the info grid)', () => {
    const noNumber = buildMultiPageFixtureEstimate({ estimate_number: null, estimate_seq: 7 })
    const subtrees = collectPageSubtrees(component(props(noNumber, 'en', templateId)))
    const texts: string[] = []
    collectTextNodes(subtrees[1], texts)
    expect(texts).toContain(`${PDF_LABELS.en.estimateNum}0007`)
    expect(formatEstimateNumber({ estimate_number: null, estimate_seq: 7 })).toBe('0007')
  })

  it.each([
    ['en', false],
    ['es', true],
    ['pt', true],
  ] as const)('language chip for %s is drawn on page 1: %s — and never on pages 2+', (language, shown) => {
    const subtrees = collectPageSubtrees(component(props(estimate, language, templateId)))
    const chip = language.toUpperCase()
    subtrees.forEach((subtree, i) => {
      const texts: string[] = []
      collectTextNodes(subtree, texts)
      expect(texts.includes(chip), `page ${i + 1}`).toBe(i === 0 && shown)
    })
  })

  it.skipIf(!hasPdftotext)('real render: footer is "{company} · Estimate #{n} · Page N of M" with M = the real page count', async () => {
    const p = props(estimate, 'en', templateId)
    const buf = Buffer.from(await renderToBuffer(createElement(component, p) as never))
    const real = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    expect(real, 'engine page count == real page count').toBe(p.pages.length)

    const text = pdftotextLayout(buf)
    const footers = text.split('\n').filter((l) => /Page \d+ of \d+/.test(l)).map((l) => l.trim())
    expect(footers).toEqual(
      Array.from({ length: real }, (_, i) => `Acme Renovations · Estimate #EST-1042 · Page ${i + 1} of ${real}`)
    )
  })

  it.skipIf(!hasPdftotext)('real render: a very long company name is ellipsized on ONE line in the compact header and the footer', async () => {
    const longName = 'Acme Renovations and Custom Residential Remodeling & Design Build Specialists of Greater Austin and Central Texas LLC'
    const company = { ...FIXTURE_COMPANY, name: longName }
    const pages = buildPagesForFixture(estimate, company, templateId, { language: 'en' })
    const buf = Buffer.from(
      await renderToBuffer(
        createElement(component, { estimate: estimate as never, company: company as never, client: null, projectName: 'x', projectType: null, language: 'en', pages }) as never
      )
    )
    const lines = pdftotextLayout(buf).split('\n')
    // Footer: still one line, ellipsized name, and the tail is intact.
    const footers = lines.filter((l) => /Page \d+ of \d+/.test(l))
    expect(footers.length).toBe(pages.length)
    for (const f of footers) expect(f).toMatch(/…|\.\.\./)
    // Compact header (page 2): name ellipsized, identifier on the SAME line, intact.
    const compact = lines.filter((l) => l.includes('Estimate #EST-1042') && !l.includes('Page '))
    // 1 per continuation page (page 1's info grid has the same text but is not "Acme..." led)
    expect(compact.some((l) => /^\s*Acme Renovations.*(…|\.\.\.).*Estimate #EST-1042\s*$/.test(l))).toBe(true)
  })
})
