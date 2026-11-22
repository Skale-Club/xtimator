// tests/unit/pdf/estimate-pdf-signature-certificate.test.tsx
//
// The "Signature certificate" page: a signed estimate's PDF gets ONE extra LAST
// page, in both templates, only when signature evidence is present.
//   - direct-call tree walk (cross-platform): one more <Page>, whose text holds
//     the signer, IP, fingerprint and integrity line;
//   - real renderToBuffer: the page count grows by exactly one, and (where
//     poppler's pdftotext exists) the LAST page carries the certificate text.
// Without evidence the page count is unchanged. Set CERT_SAMPLE_DIR to also write
// the two sample PDFs for a visual check.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { renderToBuffer, Page as PDFPage } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import type { SignatureEvidence } from '@/lib/estimate/signature-evidence'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { formatCertificateDateTime } from '@/components/pdf/shared/pdf-signature-certificate'
import { collectTextNodes } from '../estimate/_pdf-text-walker'
import { buildFixtureEstimate, FIXTURE_COMPANY, SIGNATURE_FIXTURE } from '../estimate/fixtures/document-fixtures'
import { buildPagesForFixture } from './_pages-for-fixture'

type ElementWithChildren = ReactElement<{ children?: ReactNode }>
const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined

const SHA = 'a3f1c9d2e4b7085f6a1c3d9e0b2f4a6c8d1e3f5a7b9c0d2e4f6a8b1c3d5e7f90'
const EVIDENCE: SignatureEvidence = {
  signerName: SIGNATURE_FIXTURE.signerName,
  signerEmail: 'jane.doe@example.test',
  signedAt: '2026-11-21T20:25:00.000Z',
  ipAddress: '203.0.113.42',
  device: 'Safari on iPhone',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  signedTotal: 12480.5,
  currencyCode: 'USD',
  sha256: SHA,
  integrity: 'verified',
  consentStatement: 'I agree that my typed name and drawn signature are legally binding.',
  signatureDataUrl: SIGNATURE_FIXTURE.signatureDataUrl,
}

const COMPONENTS = { classic: EstimatePDF, modern: EstimatePDFModern } as const

function isPage(el: ElementWithChildren): boolean {
  return el.type === PDFPage || (el.type as { displayName?: string })?.displayName === 'Page'
}

function collectPages(node: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (node == null || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    node.forEach((c) => collectPages(c as ReactNode, out))
    return out
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return out
  const el = node as ElementWithChildren
  if (isPage(el)) {
    out.push(el.props.children)
    return out
  }
  return collectPages(el.props.children, out)
}

function lastPageTexts(node: ReactNode): string[] {
  const pages = collectPages(node)
  const texts: string[] = []
  collectTextNodes(pages[pages.length - 1], texts)
  return texts
}

function props(templateId: EstimateTemplateId, withEvidence: boolean) {
  const estimate = buildFixtureEstimate({})
  return {
    estimate: estimate as never,
    company: FIXTURE_COMPANY as never,
    client: null,
    projectName: 'Cert Test',
    projectType: null,
    language: 'en' as const,
    signature: SIGNATURE_FIXTURE,
    signatureEvidence: withEvidence ? EVIDENCE : null,
    pages: buildPagesForFixture(estimate, FIXTURE_COMPANY, templateId, { signature: SIGNATURE_FIXTURE }),
  }
}

/** Page count of a rendered PDF: page dictionaries are plain objects in react-pdf output. */
function realPageCount(buf: Buffer): number {
  return (buf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length
}

describe.each(['classic', 'modern'] as const)('signature certificate page (%s)', (templateId) => {
  const Component = COMPONENTS[templateId]

  it('direct call: evidence adds exactly one last page holding signer, IP, fingerprint and integrity', () => {
    const without = Component(props(templateId, false))
    const withEv = Component(props(templateId, true))
    expect(collectPages(withEv)).toHaveLength(collectPages(without).length + 1)

    const texts = lastPageTexts(withEv)
    expect(texts).toContain('Signature certificate')
    expect(texts).toContain(EVIDENCE.signerName)
    expect(texts).toContain(EVIDENCE.signerEmail)
    expect(texts).toContain(EVIDENCE.ipAddress)
    expect(texts).toContain('Safari on iPhone')
    expect(texts).toContain(SHA)
    expect(texts).toContain('Content unchanged since signing')
    expect(texts).toContain(EVIDENCE.consentStatement)
    expect(texts).toContain(formatCertificateDateTime(EVIDENCE.signedAt, 'en'))
    expect(texts).toContain('$12,480.50')
    // the title never appears on an estimate page
    const before: string[] = []
    collectTextNodes(without, before)
    expect(before).not.toContain('Signature certificate')
  })

  it('direct call: missing optional fields fall back, and a null sha omits the fingerprint row', () => {
    const el = Component({
      ...props(templateId, true),
      signatureEvidence: { ...EVIDENCE, signerEmail: null, ipAddress: null, sha256: null, integrity: 'unavailable' },
    })
    const texts = lastPageTexts(el)
    expect(texts).toContain('Not provided')
    expect(texts).toContain('Not recorded')
    expect(texts).toContain('Fingerprint not available')
    expect(texts).not.toContain('Fingerprint')
    expect(texts).not.toContain('SHA-256 of the signed content')
  })

  it('real render: one more page with evidence, unchanged without', async () => {
    const withoutBuf = Buffer.from(await renderToBuffer(createElement(Component, props(templateId, false)) as never))
    const withBuf = Buffer.from(await renderToBuffer(createElement(Component, props(templateId, true)) as never))
    expect(realPageCount(withBuf)).toBe(realPageCount(withoutBuf) + 1)

    const sampleDir = process.env.CERT_SAMPLE_DIR
    if (sampleDir) {
      mkdirSync(sampleDir, { recursive: true })
      writeFileSync(path.join(sampleDir, `cert-${templateId}.pdf`), withBuf)
    }

    if (hasPdftotext) {
      const dir = mkdtempSync(path.join(tmpdir(), 'cert-'))
      try {
        const file = path.join(dir, 'out.pdf')
        writeFileSync(file, withBuf)
        const pages = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
          .split('\f')
          .filter((p) => p.trim())
        const last = pages[pages.length - 1].replace(/\s+/g, ' ')
        expect(pages).toHaveLength(realPageCount(withBuf))
        expect(last).toContain('Signature certificate')
        expect(last).toContain('203.0.113.42')
        expect(last).toContain(SHA)
        expect(last).toContain('Content unchanged since signing')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })
})
