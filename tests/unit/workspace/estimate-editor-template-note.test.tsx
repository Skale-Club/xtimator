import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'
import { getEstimateByIdAction, savePresentationSettings } from '@/lib/actions/estimate'
import { buildSigningIdentity } from '@/lib/estimate/signing-identity'

// The editable 'width' document is always the standard (Classic) layout, while
// the Page-view preview renders the company's template. For a Modern company
// the editor therefore shows a small note in width mode (and only there), with
// a button that jumps to Page view.

const NOTE_TEXT =
  'Editing in the standard layout. Clients see the Modern template — switch to Page view to see and edit it that way.'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const mockSetSlot = vi.fn()
const mockWidthDocument = vi.fn()
const mockPageDocument = vi.fn()
const mockPresentationSettings = vi.fn()
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

vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: (props: unknown) => {
    mockWidthDocument(props)
    return <div data-testid="edit-document" />
  },
}))
vi.mock('@/components/workspace/estimate/paginated-preview', () => ({
  PaginatedPreview: (props: { templateId: string }) => {
    mockPageDocument(props)
    return <div data-testid="paginated-preview" data-template-id={props.templateId} />
  },
}))
vi.mock('@/components/workspace/estimate/use-paginated-preview', () => ({
  usePaginatedPreview: () => ({ pages: null }),
}))
vi.mock('@/components/workspace/estimate/estimate-floating-actions', () => ({
  EstimateFloatingActions: () => null,
}))
vi.mock('@/components/workspace/estimate/presentation-settings-panel', () => ({
  PresentationSettingsPanel: (props: unknown) => { mockPresentationSettings(props); return null },
}))
vi.mock('@/components/workspace/estimate/issued-invoices-panel', () => ({
  IssuedInvoicesPanel: () => null,
}))
vi.mock('@/components/workspace/estimate/generate-invoice-dialog', () => ({
  GenerateInvoiceDialog: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function buildEstimate(): EstimateWithSections {
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
  } as unknown as EstimateWithSections
}

function renderEditor(templateId: EstimateTemplateId, estimate = buildEstimate()) {
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
      estimateTemplateId={templateId}
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

/** The header's ViewModeToggle drives the editor through the version slot. */
function setViewMode(mode: 'width' | 'page') {
  const calls = mockSetSlot.mock.calls
  const slot = calls[calls.length - 1][0] as { onViewModeChange: (m: 'width' | 'page') => void }
  act(() => slot.onViewModeChange(mode))
}

describe('EstimateEditor — Modern template note', () => {
  it('shows the note for a Modern company in width mode (default)', () => {
    renderEditor('modern')
    expect(screen.getByTestId('edit-document')).toBeTruthy()
    expect(screen.getByTestId('modern-layout-note').textContent).toContain(NOTE_TEXT)
  })

  it('does not show it for a Classic company, in either view mode', () => {
    renderEditor('classic')
    expect(screen.queryByTestId('modern-layout-note')).toBeNull()
    setViewMode('page')
    expect(screen.queryByTestId('modern-layout-note')).toBeNull()
    expect(screen.getByTestId('paginated-preview').getAttribute('data-template-id')).toBe('classic')
  })

  it('hides it in Page view and hands the preview the Modern template id', () => {
    renderEditor('modern')
    setViewMode('page')
    expect(screen.queryByTestId('modern-layout-note')).toBeNull()
    expect(screen.getByTestId('paginated-preview').getAttribute('data-template-id')).toBe('modern')
  })

  it('its button switches to Page view', () => {
    renderEditor('modern')
    fireEvent.click(screen.getByRole('button', { name: 'Open Page view' }))
    expect(screen.queryByTestId('modern-layout-note')).toBeNull()
    expect(screen.getByTestId('paginated-preview')).toBeTruthy()
    const calls = mockSetSlot.mock.calls
    expect((calls[calls.length - 1][0] as { viewMode: string }).viewMode).toBe('page')
  })

  it('renders frozen parties in width and page views, without applying them to another estimate version', async () => {
    const signedIdentity = buildSigningIdentity(
      { name: 'Signed Contractor' },
      { name: 'Signed Project', project_type: 'Renovation', client: { id: 'client-1', name: 'Signed Client', address: 'Signed Address' } },
      'Signed Preparer',
      'es',
    )
    renderEditor('classic', {
      ...buildEstimate(), hasSignature: true, signedIdentity,
      signedCompanyTerms: { enabled: true, text: 'Signed terms' }, valid_until: '2026-12-01',
    })

    const signedDocument = {
      company: { name: 'Signed Contractor' }, projectName: 'Signed Project', projectType: 'Renovation',
      client: { name: 'Signed Client', address: 'Signed Address' }, preparedBy: 'Signed Preparer', language: 'es',
      companyTerms: { enabled: true, text: 'Signed terms' }, data: { valid_until: '2026-12-01' },
    }
    expect(mockWidthDocument.mock.lastCall?.[0]).toMatchObject(signedDocument)
    expect(mockPresentationSettings).toHaveBeenLastCalledWith(expect.objectContaining({ readOnly: true }))
    const settings = mockPresentationSettings.mock.lastCall?.[0] as { onChange: (value: object) => void }
    act(() => settings.onChange({ blocks: {} }))
    expect(savePresentationSettings).not.toHaveBeenCalled()
    setViewMode('page')
    expect(mockPageDocument.mock.lastCall?.[0]).toMatchObject(signedDocument)

    vi.mocked(getEstimateByIdAction).mockResolvedValue({ data: { ...buildEstimate(), id: 'est-old', is_current: false } })
    const slot = mockSetSlot.mock.lastCall?.[0] as { onVersionChange: (id: string) => Promise<void> }
    await act(async () => slot.onVersionChange('est-old'))
    expect(mockPageDocument.mock.lastCall?.[0]).toMatchObject({
      projectName: 'Test Project', company: { name: 'Acme Co' }, client: null,
      preparedBy: null, companyTerms: { enabled: false, text: null }, language: 'en',
    })
  })
})
