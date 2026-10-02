// tests/unit/pdf/estimate-pdf-continuation-title-and-cards.test.tsx
//
// Layout polish regressions, both PDF templates (walks the element tree the
// templates return — the repo's direct-call convention):
//   - a page that opens mid-section draws "<Section title> (cont.)" ABOVE the
//     repeated column header, styled as that template's section header, on ONE
//     line (maxLines 1 + ellipsis), and no other page draws it;
//   - Classic terms + signature cards carry padding 10 / radius 4 / margin-bottom 8
//     (and the text inside drops its own 12pt bottom margin), Modern stays box-less
//     and fill-free;
//   - Modern section titles use the readable brand colour (the rule stays neutral);
//   - Modern summary -> next block spacing is the tightened 6pt text margin on a
//     margin-less wrapper;
//   - photo tiles span the content width (172 Classic / 164 Modern) and the
//     "Photos" label lives INSIDE the first row's wrap={false} View, below the
//     row's top margin.
import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { Page as PDFPage, Text as PDFText } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { LABELS } from '@/lib/estimate/document/labels'
import { ensureReadableOnWhite } from '@/lib/color/contrast'
import { cardTintFill, ESTIMATE_PAGE_GEOMETRY, photoTileWidthPt } from '@/lib/estimate/document/tokens'
import { collectTextNodes, flattenText } from '../estimate/_pdf-text-walker'
import {
  buildFixtureEstimate,
  buildMultiPageFixtureEstimate,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
} from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type El = ReactElement<{ style?: unknown; children?: ReactNode; wrap?: boolean }>

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {})
  if (typeof style === 'object') return style as Record<string, unknown>
  return {}
}

function findElements(node: ReactNode, pred: (el: El) => boolean, out: El[] = []): El[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((n) => findElements(n, pred, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as El
  if (pred(el)) out.push(el)
  findElements(el.props.children, pred, out)
  return out
}

const isText = (el: El) => el.type === PDFText || (el.type as { displayName?: string })?.displayName === 'Text'
const textOf = (el: El) => flattenText(el.props.children)

function pageSubtrees(tree: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (tree == null || typeof tree === 'boolean') return out
  if (Array.isArray(tree)) {
    tree.forEach((n) => pageSubtrees(n, out))
    return out
  }
  if (typeof tree !== 'object' || !('props' in (tree as object))) return out
  const el = tree as El
  const displayName = (el.type as { displayName?: string } | undefined)?.displayName
  if (el.type === PDFPage || displayName === 'Page') {
    out.push(el.props.children)
    return out
  }
  pageSubtrees(el.props.children, out)
  return out
}

const COMPONENTS = { classic: EstimatePDF, modern: EstimatePDFModern } as const

function renderTree(
  templateId: EstimateTemplateId,
  estimate: Record<string, unknown>,
  opts: {
    company?: Record<string, unknown>
    signature?: typeof SIGNATURE_FIXTURE | null
    photos?: { url: string; caption: string | null }[]
    preparedBy?: string | null
  } = {}
) {
  const company = (opts.company ?? FIXTURE_COMPANY) as typeof FIXTURE_COMPANY
  const pages = buildPagesForFixture(estimate, company, templateId, {
    signature: opts.signature ?? null,
    attachedPhotos: opts.photos ?? [],
    preparedBy: opts.preparedBy ?? null,
  })
  const tree = COMPONENTS[templateId]({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: company as any,
    client: null,
    projectName: 'Layout Test',
    projectType: null,
    language: 'en',
    signature: opts.signature ?? null,
    attachedPhotos: opts.photos ?? [],
    preparedBy: opts.preparedBy ?? null,
    pages,
  })
  return { pages, tree }
}

const DATA_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

describe.each(['classic', 'modern'] as const)('%s PDF — "(cont.)" section title on continuation pages', (templateId) => {
  it('every continuesTable page draws "<Section title>" + "(cont.)" before the column header, single occurrence; no other page draws it', () => {
    const estimate = buildMultiPageFixtureEstimate()
    const { pages, tree } = renderTree(templateId, estimate)
    const subtrees = pageSubtrees(tree)
    expect(subtrees.length).toBe(pages.length)
    const continuationPages = pages.filter((p) => p.continuesTable)
    expect(continuationPages.length, 'fixture must produce at least 1 continuation page').toBeGreaterThan(0)

    const sections = estimate.sections as { id: string; title: string }[]
    pages.forEach((page, i) => {
      const texts: string[] = []
      collectTextNodes(subtrees[i], texts)
      const contCount = texts.filter((t) => t === LABELS.en.continued).length
      if (!page.continuesTable) {
        expect(contCount, `page ${i} is not a continuation page`).toBe(0)
        return
      }
      expect(contCount, `page ${i} "(cont.)" occurrences`).toBe(1)
      const sectionId = page.blocks[0].ref?.sectionId
      const title = sections.find((s) => s.id === sectionId)!.title
      const iTitle = texts.indexOf(title)
      const iCont = texts.indexOf(LABELS.en.continued)
      const iDescription = texts.indexOf(LABELS.en.description)
      // compact header text first (company name, estimate #), then title, suffix, column header
      expect(iTitle).toBeGreaterThan(-1)
      expect(iCont).toBe(iTitle + 1)
      expect(iCont).toBeLessThan(iDescription)
    })
  })

  it('the continuation title is ONE line: title Text capped with maxLines 1 + ellipsis, band marginTop 0, same band/title style as a normal section header', () => {
    const estimate = buildMultiPageFixtureEstimate()
    const { pages, tree } = renderTree(templateId, estimate)
    const idx = pages.findIndex((p) => p.continuesTable)
    const sub = pageSubtrees(tree)[idx]
    const sections = estimate.sections as { id: string; title: string }[]
    const title = sections.find((s) => s.id === pages[idx].blocks[0].ref?.sectionId)!.title

    const titleText = findElements(sub, (el) => isText(el) && textOf(el) === title)[0]
    const style = flattenStyle(titleText.props.style)
    expect(style.maxLines).toBe(1)
    expect(style.textOverflow).toBe('ellipsis')
    expect(style.fontSize).toBe(ESTIMATE_PAGE_GEOMETRY[templateId].sectionTitleFontSizePt)

    // The band is the View wrapping the title's row: sectionHeader style with marginTop 0.
    const band = findElements(sub, (el) => {
      if (isText(el)) return false
      const s = flattenStyle(el.props.style)
      return s.marginTop === 0 && typeof s.paddingVertical === 'number'
    })[0]
    expect(band).toBeDefined()
    const bandStyle = flattenStyle(band.props.style)
    expect(bandStyle.paddingVertical).toBe(templateId === 'classic' ? 8 : 6)
    if (templateId === 'classic') expect(bandStyle.backgroundColor).toBe(FIXTURE_COMPANY.brand_primary_color)
    else expect(bandStyle.borderBottomWidth).toBe(1)
  })
})

describe('Classic PDF — terms + signature cards have inner padding', () => {
  const company = { ...FIXTURE_COMPANY, estimate_terms_enabled: true, estimate_terms_text: 'Estimate terms body text.' }
  const estimate = buildFixtureEstimate({ timeline: 'Six weeks.', notes: 'Pricing valid 30 days.' })

  it('each terms card View: padding 10, borderRadius 4, marginBottom 8, brand tint fill; its text has no bottom margin', () => {
    const { tree } = renderTree('classic', estimate, { company, signature: SIGNATURE_FIXTURE })
    const cards = findElements(tree, (el) => {
      const s = flattenStyle(el.props.style)
      return el.props.wrap === false && s.backgroundColor === cardTintFill(FIXTURE_COMPANY.brand_primary_color)
    })
    // 5 terms (estimate, payment, timeline, warranty, notes) + the signature card.
    expect(cards.length).toBe(6)
    for (const card of cards) {
      const s = flattenStyle(card.props.style)
      expect(s.padding).toBe(10)
      expect(s.borderRadius).toBe(4)
      expect(s.marginBottom).toBe(8)
    }
    const bodyTexts = findElements(tree, (el) => isText(el) && textOf(el) === 'Estimate terms body text.')
    expect(flattenStyle(bodyTexts[0].props.style).marginBottom).toBe(0)
  })

  it('Modern terms + signature cards are box-less and fill-free (unchanged)', () => {
    const { tree } = renderTree('modern', estimate, { company, signature: SIGNATURE_FIXTURE })
    const atomic = findElements(tree, (el) => el.props.wrap === false)
    const cards = atomic.filter((el) => findElements(el.props.children, (c) => isText(c) && /Terms|Timeline|Notes|Warranty|Signed by/i.test(textOf(c))).length > 0)
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      const s = flattenStyle(card.props.style)
      expect(s.padding).toBeUndefined()
      expect(s.borderRadius).toBeUndefined()
      expect(s.backgroundColor).toBeUndefined()
    }
    const bodyTexts = findElements(tree, (el) => isText(el) && textOf(el) === 'Estimate terms body text.')
    expect(flattenStyle(bodyTexts[0].props.style).marginBottom).toBe(14)
  })
})

describe('Modern PDF — section titles use the brand colour, summary spacing tightened', () => {
  it('section title Text colour is the readable brand colour; the rule under it stays neutral #1f2937', () => {
    const company = { ...FIXTURE_COMPANY, brand_primary_color: '#e11d48' }
    const estimate = buildFixtureEstimate({})
    const { tree } = renderTree('modern', estimate, { company })
    const brandText = ensureReadableOnWhite('#e11d48')
    const titles = findElements(tree, (el) => isText(el) && textOf(el) === 'Labor')
    expect(titles.length).toBeGreaterThan(0)
    for (const t of titles) expect(flattenStyle(t.props.style).color).toBe(brandText)
    const band = findElements(tree, (el) => {
      const s = flattenStyle(el.props.style)
      return !isText(el) && s.borderBottomWidth === 1 && s.paddingVertical === 6
    })
    expect(band.length).toBeGreaterThan(0)
    for (const b of band) expect(flattenStyle(b.props.style).borderBottomColor).toBe('#1f2937')
  })

  it('summary: wrapper View has no margin; the text carries marginBottom 6 (summary -> section title = 6 + sectionHeader.marginTop 22 = 28pt)', () => {
    const estimate = buildFixtureEstimate({ summary: 'A summary paragraph.' })
    const { tree } = renderTree('modern', estimate)
    const text = findElements(tree, (el) => isText(el) && textOf(el) === 'A summary paragraph.')[0]
    expect(flattenStyle(text.props.style).marginBottom).toBe(6)
    const wrapper = findElements(tree, (el) => !isText(el) && findElements(el.props.children, (c) => c === text).length > 0)
    // innermost View around the summary label + text
    const summaryView = wrapper[wrapper.length - 1]
    expect(flattenStyle(summaryView.props.style).marginBottom).toBeUndefined()
  })
})

describe.each(['classic', 'modern'] as const)('%s PDF — photo grid fills the content width and the label sits above the tiles', (templateId) => {
  const photos = [
    { url: DATA_JPEG, caption: 'Front' },
    { url: DATA_JPEG, caption: null },
    { url: DATA_JPEG, caption: null },
    { url: DATA_JPEG, caption: null },
  ]

  it('tiles are square at photoTileWidthPt(contentWidthPt); a full row spans contentWidthPt', () => {
    const estimate = buildFixtureEstimate({})
    const { tree } = renderTree(templateId, estimate, { photos })
    const tile = photoTileWidthPt(ESTIMATE_PAGE_GEOMETRY[templateId].contentWidthPt)
    expect(tile).toBe(templateId === 'classic' ? 172 : 164)
    const images = findElements(tree, (el) => typeof el.props.style === 'object' && flattenStyle(el.props.style).objectFit === 'cover')
    expect(images.length).toBe(4)
    for (const img of images) {
      const s = flattenStyle(img.props.style)
      expect(s.width).toBe(tile)
      expect(s.height).toBe(tile)
    }
    expect(3 * tile + 2 * 8).toBe(ESTIMATE_PAGE_GEOMETRY[templateId].contentWidthPt)
  })

  it('the "Photos" label is the first child INSIDE the first row View (wrap=false, carrying the top margin); later rows carry the 8pt gap', () => {
    const estimate = buildFixtureEstimate({})
    const { tree } = renderTree(templateId, estimate, { photos })
    const rowViews = findElements(tree, (el) => {
      if (el.props.wrap !== false) return false
      return findElements(el.props.children, (c) => (c.type as { displayName?: string })?.displayName === 'Image' || flattenStyle(c.props.style).objectFit === 'cover').length > 0
    })
    expect(rowViews.length).toBe(2)
    const first = flattenStyle(rowViews[0].props.style)
    expect(first.marginTop).toBe(templateId === 'classic' ? 16 : 20)
    const firstChildren = ([] as ReactNode[]).concat(rowViews[0].props.children as ReactNode)
    const labelEl = firstChildren.find((c) => c && typeof c === 'object' && 'props' in (c as object)) as El
    expect(textOf(labelEl)).toBe(LABELS.en.photos)
    expect(flattenStyle(rowViews[1].props.style).marginTop).toBe(8)
    const texts: string[] = []
    collectTextNodes(rowViews[1], texts)
    expect(texts).not.toContain(LABELS.en.photos)
  })
})

describe.each(['classic', 'modern'] as const)('%s PDF — "Prepared by" sits after the signature and before the photos', (templateId) => {
  it('text order: Signed by -> signer -> Prepared by -> name -> Photos (the preview renders the same page.blocks order)', () => {
    const estimate = buildFixtureEstimate({})
    const { tree } = renderTree(templateId, estimate, {
      signature: SIGNATURE_FIXTURE,
      photos: [{ url: DATA_JPEG, caption: null }],
      preparedBy: 'Jamie Lee',
    })
    const texts: string[] = []
    collectTextNodes(tree, texts)
    const iSigned = texts.indexOf(LABELS.en.signedBy)
    const iPrepared = texts.indexOf(LABELS.en.preparedBy)
    const iName = texts.indexOf('Jamie Lee')
    const iPhotos = texts.indexOf(LABELS.en.photos)
    expect(iSigned).toBeGreaterThan(-1)
    expect(iPrepared).toBeGreaterThan(iSigned)
    expect(iName).toBe(iPrepared + 1)
    expect(iPhotos).toBeGreaterThan(iName)
  })
})
