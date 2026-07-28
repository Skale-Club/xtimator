import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
  PHOTO_WITH_CAPTION,
  PHOTO_NO_CAPTION,
} from './fixtures/document-fixtures'

// Phase 183 Plan 05 (PDFPAR-03) — webview photo caption coverage. Both
// templates: a captioned photo shows its caption as visible text beneath the
// thumbnail; a caption-less photo contributes no caption text node (no empty
// space).

const company = FIXTURE_COMPANY as DocumentCompany

function renderClassic(data: EstimateDocumentData) {
  return render(
    <EstimateDocument
      mode="view"
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

function renderModern(data: EstimateDocumentData) {
  return render(
    <EstimateDocumentModern
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
    />
  )
}

describe('Photo captions — Classic webview (PDFPAR-03)', () => {
  it('captioned photo renders its caption exactly once; caption-less photo contributes no caption text', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION] })
    ) as unknown as EstimateDocumentData
    renderClassic(data)

    expect(screen.queryAllByText(PHOTO_WITH_CAPTION.caption).length).toBe(1)
  })
})

describe('Photo captions — Modern webview (PDFPAR-03)', () => {
  it('captioned photo renders its caption exactly once; caption-less photo contributes no caption text', () => {
    const data = toFixtureDocumentData(
      buildFixtureEstimate({ attachedPhotos: [PHOTO_WITH_CAPTION, PHOTO_NO_CAPTION] })
    ) as unknown as EstimateDocumentData
    renderModern(data)

    expect(screen.queryAllByText(PHOTO_WITH_CAPTION.caption).length).toBe(1)
  })
})
