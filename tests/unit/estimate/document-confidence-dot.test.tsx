// SEED-057 Phase G: the per-line AI confidence dot lives ONLY on the owner's
// editable row. It is absent in view mode (the page view), and absent once the
// owner has edited the line by hand.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from './fixtures/document-fixtures'

afterEach(cleanup)

const company: DocumentCompany = FIXTURE_COMPANY as DocumentCompany

function buildData(patch?: (data: EstimateDocumentData) => void): EstimateDocumentData {
  const data = toFixtureDocumentData(buildFixtureEstimate({})) as unknown as EstimateDocumentData
  patch?.(data)
  return data
}

function renderDoc(data: EstimateDocumentData, mode: 'edit' | 'view') {
  return render(
    <EstimateDocument
      mode={mode}
      data={data}
      company={company}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-01-01T00:00:00Z"
      dispatch={mode === 'edit' ? vi.fn() : undefined}
    />
  )
}

const withConfidence = (data: EstimateDocumentData) => {
  data.sections[0].items[0] = { ...data.sections[0].items[0], confidence: 'low', basis: 'guessed from the photo' }
}

describe('confidence dot on the document', () => {
  it('shows on the editable row, with the basis on hover', () => {
    const data = buildData(withConfidence)
    const { container } = renderDoc(data, 'edit')
    const row = container.querySelector(`[data-item-id="${data.sections[0].items[0].id}"]`)!
    const dot = row.querySelector('[data-testid="confidence-dot"]')
    expect(dot).toBeTruthy()
    expect(dot!.getAttribute('data-confidence')).toBe('low')
    expect(dot!.getAttribute('title')).toContain('guessed from the photo')
  })

  it('only the lines that have a confidence get one', () => {
    const data = buildData(withConfidence)
    const { container } = renderDoc(data, 'edit')
    expect(container.querySelectorAll('[data-testid="confidence-dot"]')).toHaveLength(1)
  })

  it('is absent in view mode (page view / anything a client could see)', () => {
    const { container } = renderDoc(buildData(withConfidence), 'view')
    expect(container.querySelector('[data-testid="confidence-dot"]')).toBeNull()
    expect(container.textContent).not.toContain('guessed from the photo')
  })

  it('disappears once the owner edits the line by hand', () => {
    const data = buildData((d) => {
      withConfidence(d)
      d.sections[0].items[0] = { ...d.sections[0].items[0], isManuallyEdited: true }
    })
    const { container } = renderDoc(data, 'edit')
    expect(container.querySelector('[data-testid="confidence-dot"]')).toBeNull()
  })

  it('a document with no AI metadata is unchanged: no dot, no extra cell class', () => {
    const data = buildData()
    const { container } = renderDoc(data, 'edit')
    expect(container.querySelector('[data-testid="confidence-dot"]')).toBeNull()
    const row = container.querySelector(`[data-item-id="${data.sections[0].items[0].id}"]`)!
    expect(row.querySelectorAll('td.relative')).toHaveLength(0)
  })
})
