import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

// SEED-057 Phase G: the AI notes (assumptions, open questions, review verdict) are
// no longer shown in the editor page flow. They live in the platform-admin-only
// debug dialog, reached from the floating bar. The editor wires that trigger only
// when the server-resolved `isPlatformAdmin` flag is true, and neither the editable
// document nor the page-view preview is ever handed the AI notes.

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
const floatingProps = vi.fn()
vi.mock('@/components/workspace/estimate/estimate-floating-actions', () => ({
  EstimateFloatingActions: (props: { onOpenDebug?: () => void }) => {
    floatingProps(props)
    return null
  },
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
  floatingProps.mockReset()
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

function renderEditor(estimate: EstimateWithSections, isPlatformAdmin?: boolean) {
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
      isPlatformAdmin={isPlatformAdmin}
    />
  )
}

describe('EstimateEditor - AI insights (SEED-057 G)', () => {
  it('never renders the inline AI panel or the review banner, for admins or not', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }), true)
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
    expect(screen.queryByTestId('ai-needs-review')).toBeNull()
    expect(screen.queryByText('What the AI assumed')).toBeNull()
    expect(screen.queryByTestId('ai-open-questions')).toBeNull()
  })

  it('wires no debug trigger for a non-admin (default), even when ai_meta is present', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }))
    const props = floatingProps.mock.calls[floatingProps.mock.calls.length - 1][0] as { onOpenDebug?: () => void }
    expect(props.onOpenDebug).toBeUndefined()
    renderEditor(buildEstimate({ ai_meta: AI_META }), false)
    const again = floatingProps.mock.calls[floatingProps.mock.calls.length - 1][0] as { onOpenDebug?: () => void }
    expect(again.onOpenDebug).toBeUndefined()
  })

  it('wires the debug trigger for a platform admin and opens the debug sheet with the AI record', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }), true)
    const props = floatingProps.mock.calls[floatingProps.mock.calls.length - 1][0] as { onOpenDebug?: () => void }
    expect(typeof props.onOpenDebug).toBe('function')
    expect(screen.queryByTestId('estimate-debug-dialog')).toBeNull()
    act(() => props.onOpenDebug?.())
    expect(screen.getByTestId('estimate-debug-dialog')).toBeTruthy()
    expect(screen.getByTestId('debug-quality').textContent).toContain('No cleanup line.')
    expect(screen.getByTestId('ai-open-questions').textContent).toContain('Is the closet included?')
  })

  it('the debug sheet says so when an admin opens an estimate without an AI record', () => {
    renderEditor(buildEstimate(), true)
    const props = floatingProps.mock.calls[floatingProps.mock.calls.length - 1][0] as { onOpenDebug?: () => void }
    act(() => props.onOpenDebug?.())
    expect(screen.getByTestId('debug-no-record').textContent).toContain('No AI record for this estimate.')
  })

  it('never hands the document or the page-view preview any of the AI notes', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }), true)
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
