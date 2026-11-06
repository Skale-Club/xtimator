// tests/unit/estimate/document-classic-colors-subtotal.test.tsx
//
// Classic web document (EstimateDocument — editor width view + public share page):
//   - company name is neutral foreground, not brand-coloured
//   - ESTIMATE banner text is white on the default brand blue
//   - view mode with ONE visible section hides "Section Subtotal"; 2 sections keep it
//   - edit mode keeps it even with one section (the owner may add a second)

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import {
  EstimateDocument,
  type DocumentSection,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'
import { FIXTURE_COMPANY } from './fixtures/document-fixtures'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn().mockResolvedValue({ data: {} }),
  unlinkProjectFromClient: vi.fn().mockResolvedValue({ data: {} }),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const BLUE = '#406EF1'

const sectionA: DocumentSection = {
  id: 'sec-1',
  title: 'Materials',
  subtotal: 100,
  items: [{ id: 'i1', description: 'Cedar planks', quantity: 10, unit: 'ea', unit_price: 10, total: 100 }],
}
const sectionB: DocumentSection = { ...sectionA, id: 'sec-2', title: 'Labor' }
// A section whose only item has a blank description: dropped in view mode.
const blankSection: DocumentSection = {
  id: 'sec-3',
  title: 'Empty one',
  subtotal: 0,
  items: [{ id: 'i3', description: '  ', quantity: 1, unit: null, unit_price: 0, total: 0 }],
}

function data(sections: DocumentSection[]): EstimateDocumentData {
  return {
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    subtotal: 100,
    total: 100,
    deposit_type: 'none',
    deposit_value: null,
    deposit: 0,
    balance_due: 100,
    currency_code: 'USD',
    sections,
    estimate_date: '2026-07-08',
    estimate_number: '0001',
    presentation_settings: null,
  } as EstimateDocumentData
}

const base = {
  client: null,
  projectName: 'Deck Rebuild',
  projectType: null,
  estimateVersion: 1,
  estimateSeq: 1,
  estimateCreatedAt: '2026-07-08T00:00:00Z',
  projectId: 'project-1',
} as const

const company = { ...FIXTURE_COMPANY, brand_primary_color: BLUE } as never

function renderView(sections: DocumentSection[]) {
  return render(<EstimateDocument mode="view" {...base} company={company} data={data(sections)} />)
}

describe('Classic web document — company name colour & banner contrast', () => {
  it('company name carries no brand-colour inline style', () => {
    const { getByText } = renderView([sectionA, sectionB])
    const name = getByText(FIXTURE_COMPANY.name)
    expect((name as HTMLElement).style.color).toBe('')
  })

  it('ESTIMATE banner text is white on the default brand blue', () => {
    const { getByText } = renderView([sectionA, sectionB])
    expect((getByText('ESTIMATE') as HTMLElement).style.color).toBe('rgb(255, 255, 255)')
  })
})

describe('Classic web document — Section Subtotal', () => {
  it('view mode, one visible section: no Section Subtotal row', () => {
    const { queryByText } = renderView([sectionA])
    expect(queryByText('Section Subtotal')).toBeNull()
  })

  it('view mode, one real section + one blank section (dropped): still no row', () => {
    const { queryByText } = renderView([sectionA, blankSection])
    expect(queryByText('Section Subtotal')).toBeNull()
  })

  it('view mode, two visible sections: one row per section', () => {
    const { queryAllByText } = renderView([sectionA, sectionB])
    expect(queryAllByText('Section Subtotal')).toHaveLength(2)
  })

  it('edit mode, one section: the row stays (owner may be adding a second section)', () => {
    const { queryAllByText } = render(
      <EstimateDocument mode="edit" {...base} brandColor={BLUE} data={data([sectionA])} dispatch={vi.fn()} />,
    )
    expect(queryAllByText('Section Subtotal')).toHaveLength(1)
  })
})
