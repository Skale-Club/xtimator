import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

// SEED-057 Phase G: the editor shows the AI panel (assumptions, open questions,
// "AI needs review") when the estimate carries ai_meta, and nothing otherwise.
// The panel sits OUTSIDE the document stage, so neither the editable document
// nor the page-view preview is ever handed its content.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const mockSetSlot = vi.fn()
vi.mock('@/components/workspace/estimate-version-context', () => ({
  useEstimateVersionSlot: () => ({ setSlot: mockSetSlot }),
}))
vi.mock('@/lib/actions/estimate', () => ({
  saveEstimate: vi.fn(),
  savePresentationSettings: vi.fn(),
  createBlankEstimate: vi.fn(),
  getEstimateByIdAction: vi.fn(),
}))
vi.mock('@/lib/actions/estimate-photo', () => ({ removePhotoFromEstimate: vi.fn() }))
vi.mock('@/lib/actions/project', () => ({ renameProjectAction: vi.fn() }))

const documentProps = vi.fn()
vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: (props: unknown) => {
    documentProps(props)
    return <div data-testid="edit-document" />
  },
}))
const previewProps = vi.fn()
vi.mock('@/components/workspace/estimate/paginated-preview', () => ({
  PaginatedPreview: (props: unknown) => {
    previewProps(props)
    return <div data-testid="paginated-preview" />
  },
}))
vi.mock('@/components/workspace/estimate/use-paginated-preview', () => ({
  usePaginatedPreview: () => ({ pages: null }),
}))
vi.mock('@/components/workspace/estimate/estimate-floating-actions', () => ({
  EstimateFloatingActions: () => null,
}))
vi.mock('@/components/workspace/estimate/presentation-settings-panel', () => ({
  PresentationSettingsPanel: () => null,
}))
vi.mock('@/components/workspace/estimate/issued-invoices-panel', () => ({
  IssuedInvoicesPanel: () => null,
}))
vi.mock('@/components/workspace/estimate/generate-invoice-dialog', () => ({
  GenerateInvoiceDialog: () => null,
}))

beforeEach(() => {
  mockSetSlot.mockReset()
  documentProps.mockReset()
  previewProps.mockReset()
})

const AI_META = {
  v: 1,
  assumptions: ['Assumes 8 ft ceilings'],
  open_questions: [{ question: 'Is the closet included?', impact: 'high' }],
  quality: { score: 58, band: 'review', findings: ['No cleanup line.'] },
}

function buildEstimate(over: Record<string, unknown> = {}): EstimateWithSections {
  return {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'company-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 0,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 0,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null,
    attachedPhotos: [],
    hasSignature: false,
    sections: [],
    ...over,
  } as unknown as EstimateWithSections
}

function renderEditor(estimate: EstimateWithSections) {
  const company: DocumentCompany = {
    name: 'Acme Co',
    owner_name: null,
    phone: null,
    email: null,
    website: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    logo_url: null,
    brand_primary_color: null,
  }
  const companyDefaults: CompanyDefaults = { payment_terms: null, warranty_terms: null, tax_rate: 0 }
  return render(
    <EstimateEditor
      estimate={estimate}
      versions={[]}
      issuedInvoices={[]}
      paymentsEnabled={false}
      projectId="proj-1"
      companyId="company-1"
      companyBrandColor={null}
      company={company}
      companyDefaults={companyDefaults}
      estimateTemplateId="classic"
      preparedBy={null}
      recordings={[]}
      photos={[]}
      projectName="Test Project"
      projectType={null}
      client={null}
      priceBookItems={[]}
    />
  )
}

describe('EstimateEditor - AI insights (SEED-057 G)', () => {
  it('shows the panel and the review banner when the estimate carries ai_meta', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }))
    expect(screen.getByTestId('ai-insights-panel')).toBeTruthy()
    expect(screen.getByTestId('ai-needs-review').textContent).toContain('No cleanup line.')
    expect(screen.getByTestId('ai-open-questions').textContent).toContain('Is the closet included?')
  })

  it('shows nothing for an estimate without ai_meta (every legacy estimate)', () => {
    renderEditor(buildEstimate())
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
  })

  it('shows nothing for garbage ai_meta, never throwing', () => {
    renderEditor(buildEstimate({ ai_meta: 'not an object' }))
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
    renderEditor(buildEstimate({ ai_meta: { assumptions: 7 } }))
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
  })

  it('shows nothing on a superseded (non-current) version', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META, is_current: false }))
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
  })

  it('never hands the document or the page-view preview any of the AI notes', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }))
    expect(JSON.stringify(documentProps.mock.calls)).not.toContain('Assumes 8 ft ceilings')
    expect(JSON.stringify(documentProps.mock.calls)).not.toContain('Is the closet included?')
    expect(JSON.stringify(documentProps.mock.calls)).not.toContain('ai_meta')

    const calls = mockSetSlot.mock.calls
    const slot = calls[calls.length - 1][0] as { onViewModeChange: (m: 'width' | 'page') => void }
    act(() => slot.onViewModeChange('page'))
    expect(screen.getByTestId('paginated-preview')).toBeTruthy()
    expect(JSON.stringify(previewProps.mock.calls)).not.toContain('Assumes 8 ft ceilings')
    expect(JSON.stringify(previewProps.mock.calls)).not.toContain('ai_meta')
  })
})
