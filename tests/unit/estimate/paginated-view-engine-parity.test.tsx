// tests/unit/estimate/paginated-view-engine-parity.test.tsx
//
// Phase 185 Plan 04 (PGBRK-01/04, plan-checker Blocker 6) — the phase's
// closing integration test: binds ENGINE parity (Plan 185-01's
// browser-vs-server MeasurementProvider parity) to VIEW parity (does the
// LIVE, rendered usePaginatedPreview() + PaginatedDocumentOverlay pipeline
// actually produce that same page count in the DOM?) with ONE test, instead
// of assuming the second follows from the first by architecture alone.
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'

// Forces fontkit's REAL browser build for THIS test file's `create` calls —
// mirrors tests/unit/pagination/measure/browser-estimator-parity.test.ts's
// exact technique verbatim (see that file's comment for the full rationale:
// a naive full-module vi.mock would ALSO silently break the SERVER
// provider's `openSync` calls, since both providers import the bare
// 'fontkit' specifier from the SAME module graph under Node/Vitest).
vi.mock('fontkit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const browserBuildPath = path.resolve(process.cwd(), 'node_modules/fontkit/dist/browser.cjs')
  const browserBuild = (await import(/* @vite-ignore */ browserBuildPath)) as { create: unknown }
  return { ...actual, create: browserBuild.create }
})

// Mirrors tests/unit/estimate/document-page-view.test.tsx's exact mock
// setup (this plan's read_first) — EstimateDocument's edit-mode surface
// needs these regardless of whether this test exercises the code paths
// they gate (InlineProjectName / rename actions never fire here).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

import { usePaginatedPreview } from '@/components/workspace/estimate/use-paginated-preview'
import { PaginatedDocumentOverlay } from '@/components/workspace/estimate/paginated-document-overlay'
import { EstimateDocument } from '@/components/workspace/estimate/estimate-document'
import type { EstimateDocumentData, DocumentCompany } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { buildPagesForFixture } from '../pdf/_pages-for-fixture'
import {
  buildMultiPageFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from './fixtures/document-fixtures'

/** Serves the REAL vendored TTFs from public/fonts/** for the browser
 *  provider's fetch() calls — a real ArrayBuffer slice, mirroring
 *  browser-estimator-parity.test.ts's exact helper. */
function stubFontFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const filePath = path.join(process.cwd(), 'public', url)
    const buf = readFileSync(filePath)
    return {
      ok: true,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    }
  })
}

const company = FIXTURE_COMPANY as unknown as DocumentCompany

/** Thin test host — mirrors estimate-editor.tsx's real paginated-mode call
 *  site (usePaginatedPreview feeding PaginatedDocumentOverlay wrapping
 *  EstimateDocument mode="edit") so this test exercises the ACTUAL
 *  production wiring, not a stand-in. */
function TestHost({ data, templateId }: { data: EstimateDocumentData; templateId: EstimateTemplateId }) {
  const { pages } = usePaginatedPreview({
    data,
    structuralEpoch: 0,
    company,
    templateId,
    preparedBy: null,
    language: 'en',
    enabled: true,
  })

  return (
    <PaginatedDocumentOverlay pages={pages} company={company} templateId={templateId} language="en">
      <EstimateDocument
        mode="edit"
        data={data}
        company={company}
        client={null}
        projectName="Test Project"
        projectType={null}
        language="en"
        estimateVersion={1}
        estimateCreatedAt="2026-01-01T00:00:00Z"
        dispatch={() => {}}
      />
    </PaginatedDocumentOverlay>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each(['classic', 'modern'] as const)(
  'Paginated view engine parity — %s (Blocker 6: LIVE rendered pipeline vs. direct engine computation)',
  (templateId) => {
    it('renders exactly as many decorative page sheets as computePageBreaks() computes directly for the SAME fixture', async () => {
      const estimate = buildMultiPageFixtureEstimate()
      const data = toFixtureDocumentData(estimate) as unknown as EstimateDocumentData

      // The pure, direct engine computation — run synchronously in THIS
      // Node/Vitest process, via the exact blocksFromModel() ->
      // computePageBreaks() pipeline every PDF-direct-call test uses
      // (tests/unit/pdf/_pages-for-fixture.ts), completely independent of
      // the component tree rendered below.
      const enginePages = buildPagesForFixture(estimate, company, templateId)
      expect(enginePages.length).toBeGreaterThan(1)

      stubFontFetch()

      const { container } = render(<TestHost data={data} templateId={templateId} />)

      // The REAL usePaginatedPreview pipeline resolves asynchronously (a
      // dynamic import + font fetch/parse + measurement) — wait for the
      // rendered sheet count to settle, then assert it equals the engine's
      // own direct computation for the identical fixture + template.
      await waitFor(
        () => {
          expect(container.querySelectorAll('[data-page-sheet]').length).toBe(enginePages.length)
        },
        { timeout: 5000 }
      )
    })
  }
)
