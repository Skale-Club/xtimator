// tests/unit/pdf/estimate-pdf-baseline-order.test.tsx
//
// PRE-REFACTOR BASELINE (Phase 183 Wave 0) — captures today's PDF
// text-content order before the components/pdf/shared/* extraction (Plan
// 183-04/183-06) and before the signature/caption/banner additions land.
// Plan 183-07 EXTENDS this same file with the new intentional post-refactor
// order — do not silently "fix" a failure here without checking whether it
// is an intentional Phase 183 change.
//
// This is a fast structural test: EstimatePDF/EstimatePDFModern are plain
// function components, so we call them directly and walk the returned
// element tree (via the shared _pdf-text-walker helper) instead of rendering
// an actual PDF buffer. Text-order only — no style assertions here (those
// belong to Plan 183-05's dedicated banner-fill test).
//
// EXTENDED in Plan 183-07 with the post-refactor signature/caption order
// assertions — the original pre-refactor assertions above remain valid and
// unchanged (Phase 183 did not alter any of that text's presence/order, only
// added a Classic title fill and 2 new content blocks). Classic's title now
// has a solid fill (still text-order-invisible — no NEW assertion needed
// here beyond what Plan 183-04's own banner-fill test already covers, since
// this file is about ORDER, not style); the signature block (when present)
// now sits between Terms and Photos; captions (when present) sit immediately
// after their photo, inside the Photos grid.

import { describe, it, expect } from 'vitest'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import {
  buildFixtureEstimate,
  FIXTURE_COMPANY,
  SIGNATURE_FIXTURE,
  PHOTO_WITH_CAPTION,
} from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type PDFComponent = typeof EstimatePDF

function templateIdFor(component: PDFComponent): 'classic' | 'modern' {
  return component === EstimatePDF ? 'classic' : 'modern'
}

function renderTexts(component: PDFComponent, estimate: Record<string, unknown>): string[] {
  const templateId = templateIdFor(component)
  const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId)
  const tree = component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Baseline Test Project',
    projectType: null,
    language: 'en',
    pages,
  })
  const out: string[] = []
  collectTextNodes(tree, out)
  return out
}

// Plan 183-07 — same rendering path as renderTexts(), plus signature +
// captioned photo, to assert the intentional post-refactor content order.
function renderTextsSignedWithPhoto(component: PDFComponent, estimate: Record<string, unknown>): string[] {
  const templateId = templateIdFor(component)
  const pages = buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId, {
    signature: SIGNATURE_FIXTURE,
    attachedPhotos: [PHOTO_WITH_CAPTION],
  })
  const tree = component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Baseline Test Project',
    projectType: null,
    language: 'en',
    signature: SIGNATURE_FIXTURE,
    attachedPhotos: [PHOTO_WITH_CAPTION],
    pages,
  })
  const out: string[] = []
  collectTextNodes(tree, out)
  return out
}

// Plan 183-07 — intentional post-refactor order: Terms -> Signature ->
// Photos. This is a NEW assertion for structure Phase 183 added — it does
// not modify or invalidate assertBaselineOrder() above.
function assertSignatureBetweenTermsAndPhotos(texts: string[], label: string) {
  const iWarranty = texts.indexOf('Warranty')
  const iPhotos = texts.indexOf('Photos')
  const iSigner = texts.indexOf(SIGNATURE_FIXTURE.signerName)

  expect(iWarranty, `${label}: Warranty present`).toBeGreaterThan(-1)
  expect(iPhotos, `${label}: Photos section label present`).toBeGreaterThan(-1)
  expect(iSigner, `${label}: signer name present`).toBeGreaterThan(-1)

  expect(iWarranty, `${label}: Warranty before signer name`).toBeLessThan(iSigner)
  expect(iSigner, `${label}: signer name before Photos`).toBeLessThan(iPhotos)
}

// Plan 183-07 — the caption text sits after the 'Photos' section label,
// inside the grid.
function assertCaptionAfterPhotosLabel(texts: string[], label: string) {
  const iPhotos = texts.indexOf('Photos')
  const iCaption = texts.indexOf(PHOTO_WITH_CAPTION.caption)

  expect(iPhotos, `${label}: Photos label present`).toBeGreaterThan(-1)
  expect(iCaption, `${label}: caption text present`).toBeGreaterThan(-1)
  expect(iPhotos, `${label}: Photos label before caption text`).toBeLessThan(iCaption)
}

// Asserts today's milestone text-content order, shared by both templates.
// The fixture (buildFixtureEstimate({})) has: no client (no Bill To), 2
// sections (Labor, Materials), a discount + tax + deposit all configured
// (so every totals row renders), and warranty_terms/payment_terms both set.
function assertBaselineOrder(texts: string[], label: string) {
  // Company header → 'ESTIMATE' title
  const iCompany = texts.indexOf(FIXTURE_COMPANY.name)
  const iTitle = texts.indexOf('ESTIMATE')
  expect(iCompany, `${label}: company name present`).toBeGreaterThan(-1)
  expect(iTitle, `${label}: ESTIMATE title present`).toBeGreaterThan(-1)
  expect(iCompany, `${label}: company name before ESTIMATE title`).toBeLessThan(iTitle)

  // Title → 'Project' info label. No client in this fixture → no 'Bill To'.
  const iProject = texts.indexOf('Project')
  expect(iProject, `${label}: Project label present`).toBeGreaterThan(-1)
  expect(iTitle, `${label}: ESTIMATE title before Project label`).toBeLessThan(iProject)
  expect(texts, `${label}: no client → no Bill To block`).not.toContain('Bill To')

  // Project → section titles: Labor → Materials
  const iLabor = texts.indexOf('Labor')
  const iMaterials = texts.indexOf('Materials')
  expect(iLabor, `${label}: Labor section title present`).toBeGreaterThan(-1)
  expect(iMaterials, `${label}: Materials section title present`).toBeGreaterThan(-1)
  expect(iProject, `${label}: Project label before Labor section`).toBeLessThan(iLabor)
  expect(iLabor, `${label}: Labor section before Materials section`).toBeLessThan(iMaterials)

  // Materials → totals block: Subtotal → Discount → Tax → Total (grand total,
  // via lastIndexOf since 'Total' also appears as the per-section table
  // column header) → Deposit → Balance Due.
  const iSubtotal = texts.indexOf('Subtotal')
  // Discount/Tax labels render with a suffix (e.g. 'Discount (10%)',
  // 'Tax (8.25%)') so match by prefix rather than exact equality.
  const iDiscount = texts.findIndex((t) => t.startsWith('Discount'))
  const iTax = texts.findIndex((t) => t.startsWith('Tax'))
  const iGrandTotal = texts.lastIndexOf('Total')
  const iDeposit = texts.indexOf('Deposit')
  const iBalance = texts.indexOf('Balance Due')

  expect(iSubtotal, `${label}: Subtotal row present`).toBeGreaterThan(-1)
  expect(iDiscount, `${label}: Discount row present (fixture has discount_amount > 0)`).toBeGreaterThan(-1)
  expect(iTax, `${label}: Tax row present (fixture has tax_amount > 0)`).toBeGreaterThan(-1)
  expect(iGrandTotal, `${label}: grand total row present`).toBeGreaterThan(-1)
  expect(iDeposit, `${label}: Deposit row present (fixture has a deposit configured)`).toBeGreaterThan(-1)
  expect(iBalance, `${label}: Balance Due row present`).toBeGreaterThan(-1)

  expect(iMaterials, `${label}: Materials section before Subtotal`).toBeLessThan(iSubtotal)
  expect(iSubtotal, `${label}: Subtotal before Discount`).toBeLessThan(iDiscount)
  expect(iDiscount, `${label}: Discount before Tax`).toBeLessThan(iTax)
  expect(iTax, `${label}: Tax before grand Total`).toBeLessThan(iGrandTotal)
  expect(iGrandTotal, `${label}: grand Total before Deposit`).toBeLessThan(iDeposit)
  expect(iDeposit, `${label}: Deposit before Balance Due`).toBeLessThan(iBalance)

  // Balance Due → terms: Payment Terms → Warranty
  const iPaymentTerms = texts.indexOf('Payment Terms')
  const iWarranty = texts.indexOf('Warranty')
  expect(iPaymentTerms, `${label}: Payment Terms present`).toBeGreaterThan(-1)
  expect(iWarranty, `${label}: Warranty present`).toBeGreaterThan(-1)
  expect(iBalance, `${label}: Balance Due before Payment Terms`).toBeLessThan(iPaymentTerms)
  expect(iPaymentTerms, `${label}: Payment Terms before Warranty`).toBeLessThan(iWarranty)
}

describe('PRE-REFACTOR BASELINE (Phase 183 Wave 0) — PDF text-content order', () => {
  it('Classic (EstimatePDF) renders today\'s pre-refactor text-content order', () => {
    const estimate = buildFixtureEstimate({})
    const texts = renderTexts(EstimatePDF, estimate)
    assertBaselineOrder(texts, 'Classic')
  })

  it('Modern (EstimatePDFModern) renders today\'s pre-refactor text-content order', () => {
    const estimate = buildFixtureEstimate({})
    const texts = renderTexts(EstimatePDFModern, estimate)
    assertBaselineOrder(texts, 'Modern')
  })

  // Plan 183-07 — intentional post-refactor extensions. These 2 new `it`
  // blocks per template assert the signature/caption structure Phase 183
  // added: Terms -> Signature -> Photos, captions inside the Photos grid.
  it('Classic (EstimatePDF) post-refactor: signer name sits between Terms and Photos', () => {
    const estimate = buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    const texts = renderTextsSignedWithPhoto(EstimatePDF, estimate)
    assertSignatureBetweenTermsAndPhotos(texts, 'Classic')
  })

  it('Classic (EstimatePDF) post-refactor: caption text sits after the Photos label', () => {
    const estimate = buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    const texts = renderTextsSignedWithPhoto(EstimatePDF, estimate)
    assertCaptionAfterPhotosLabel(texts, 'Classic')
  })

  it('Modern (EstimatePDFModern) post-refactor: signer name sits between Terms and Photos', () => {
    const estimate = buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    const texts = renderTextsSignedWithPhoto(EstimatePDFModern, estimate)
    assertSignatureBetweenTermsAndPhotos(texts, 'Modern')
  })

  it('Modern (EstimatePDFModern) post-refactor: caption text sits after the Photos label', () => {
    const estimate = buildFixtureEstimate({ signature: SIGNATURE_FIXTURE, attachedPhotos: [PHOTO_WITH_CAPTION] })
    const texts = renderTextsSignedWithPhoto(EstimatePDFModern, estimate)
    assertCaptionAfterPhotosLabel(texts, 'Modern')
  })
})
