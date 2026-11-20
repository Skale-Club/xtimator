import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import { getRefineEditor } from '@/lib/estimate/refine-bridge'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

// Owners see the sanitized review outside the document. The raw generation
// record is reserved for the platform-admin debug dialog.

const routerPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
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
  routerPush.mockReset()
})

const AI_META = {
  v: 1,
  assumptions: ['Assumes 8 ft ceilings'],
  open_questions: [{ question: 'Is the closet included?', impact: 'high' }],
  quality: { score: 58, band: 'review', findings: ['No cleanup line.'] },
}

const OWNER_REVIEW = {
  questions: ['Is trim included?'],
  assumptions: ['Owner provides paint.'],
  needsReview: true,
  lowConfidenceLines: 2,
  unpricedLines: 1,
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
  it('keeps raw metadata in the admin debug dialog when there is no sanitized owner review', () => {
    renderEditor(buildEstimate({ ai_meta: AI_META }), true)
    expect(screen.queryByTestId('ai-insights-panel')).toBeNull()
    expect(screen.queryByTestId('ai-needs-review')).toBeNull()
    expect(screen.queryByText('What the AI assumed')).toBeNull()
    expect(screen.queryByTestId('ai-open-questions')).toBeNull()
    expect(screen.queryByText('Review before sending')).toBeNull()
  })

  it('notices review stage 1: no "Review before sending" box; the questions reach "Edit with AI" through the bridge', () => {
    renderEditor(buildEstimate({ owner_review: OWNER_REVIEW }), false)
    expect(screen.queryByText('Review before sending')).toBeNull()
    expect(screen.queryByText('Is trim included?')).toBeNull()
    expect(screen.queryByTestId('estimate-debug-dialog')).toBeNull()

    const review = getRefineEditor('est-1')?.review?.()
    expect(review?.questions).toEqual(['Is trim included?'])
    expect(review?.assumptions).toEqual(['Owner provides paint.'])
  })

  it.each([
    { status: 'accepted', fields: { client_response: 'accepted' } },
    { status: 'superseded', fields: { is_current: false } },
  ])('hides the review for an $status version', ({ fields }) => {
    renderEditor(buildEstimate({ ...fields, owner_review: OWNER_REVIEW }), false)

    expect(screen.queryByText('Review before sending')).toBeNull()
    expect(screen.queryByText('Is trim included?')).toBeNull()
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

  it('keeps both the sanitized review and raw metadata outside the document and page preview', () => {
    renderEditor(buildEstimate({ owner_review: OWNER_REVIEW, ai_meta: AI_META }), true)
    expect(documentProps).toHaveBeenCalled()

    const calls = mockSetSlot.mock.calls
    const slot = calls[calls.length - 1][0] as { onViewModeChange: (m: 'width' | 'page') => void }
    act(() => slot.onViewModeChange('page'))
    expect(screen.getByTestId('paginated-preview')).toBeTruthy()
    for (const props of [documentProps, previewProps]) {
      const serialized = JSON.stringify(props.mock.calls)
      for (const ownerOnly of ['ai_meta', 'owner_review', 'Assumes 8 ft ceilings', 'Is the closet included?', 'Is trim included?', 'Owner provides paint.']) {
        expect(serialized).not.toContain(ownerOnly)
      }
    }
  })
})
