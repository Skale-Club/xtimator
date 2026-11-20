import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import { EditorFrameProvider } from '@/components/workspace/editor-frame/context'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

/**
 * Notices review stage 1, part 2 (2026-11-20), editor frame v2: nothing is
 * stacked above the document any more. A superseded version shows "Old
 * version" (slot) and "Create new version" (dock primary); a declined estimate
 * offers "Revise and reopen" as the dock primary; the Modern template note is a
 * hint on the dock's "Page" toggle. The v1 frame keeps its alert and note
 * (estimate-editor-conflict / estimate-editor-template-note tests).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
const toastFn = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: (...args: unknown[]) => toastFn(...args) },
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const mockSetSlot = vi.fn()
vi.mock('@/components/workspace/estimate-version-context', () => ({
  useEstimateVersionSlot: () => ({ setSlot: mockSetSlot }),
}))

const mockSaveEstimate = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  saveEstimate: (...args: unknown[]) => mockSaveEstimate(...args),
  savePresentationSettings: vi.fn(),
  createBlankEstimate: vi.fn(),
  getEstimateByIdAction: vi.fn(),
}))
vi.mock('@/lib/actions/estimate-photo', () => ({ removePhotoFromEstimate: vi.fn() }))
vi.mock('@/lib/actions/project', () => ({ renameProjectAction: vi.fn() }))
vi.mock('@/lib/actions/estimate-response', () => ({ recordClientResponse: vi.fn() }))

vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: (props: { dispatch: (action: unknown) => void }) => (
    <button
      data-testid="edit-btn"
      onClick={() => props.dispatch({ type: 'UPDATE_FIELD', field: 'summary', value: `edit-${Math.random()}` })}
    >
      Edit
    </button>
  ),
}))
vi.mock('@/components/workspace/estimate/paginated-preview', () => ({ PaginatedPreview: () => null }))
vi.mock('@/components/workspace/estimate/use-paginated-preview', () => ({ usePaginatedPreview: () => ({ pages: null }) }))
vi.mock('@/components/workspace/estimate/estimate-floating-actions', () => ({ EstimateFloatingActions: () => null }))
vi.mock('@/components/workspace/estimate/presentation-settings-panel', () => ({ PresentationSettingsPanel: () => null }))
vi.mock('@/components/workspace/estimate/issued-invoices-panel', () => ({ IssuedInvoicesPanel: () => null }))
vi.mock('@/components/workspace/estimate/generate-invoice-dialog', () => ({ GenerateInvoiceDialog: () => null }))
vi.mock('@/components/workspace/editor-frame/estimate-status-sheet', () => ({ EstimateStatusSheet: () => null }))
vi.mock('@/components/workspace/estimate/analytics/estimate-analytics-drawer', () => ({ EstimateAnalyticsDrawer: () => null }))

type DockProps = {
  primary?: { label: string; onClick: () => void; testId?: string }
  pageHint?: string
}
const dockProps: DockProps[] = []
vi.mock('@/components/workspace/editor-frame/editor-dock', () => ({
  EditorDock: (props: DockProps) => {
    dockProps.push(props)
    return props.primary ? (
      <button data-testid={props.primary.testId} onClick={props.primary.onClick}>
        {props.primary.label}
      </button>
    ) : null
  },
}))

beforeEach(() => {
  mockSetSlot.mockReset()
  mockSaveEstimate.mockReset()
  toastFn.mockReset()
  dockProps.length = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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

const COMPANY: DocumentCompany = {
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
const DEFAULTS: CompanyDefaults = { payment_terms: null, warranty_terms: null, tax_rate: 0 }

function renderV2(estimate: EstimateWithSections, templateId: EstimateTemplateId = 'classic', clientName?: string) {
  return render(
    <EditorFrameProvider frame="v2" dockEl={document.body}>
      <EstimateEditor
        estimate={estimate}
        versions={[]}
        issuedInvoices={[]}
        paymentsEnabled={false}
        projectId="proj-1"
        companyId="company-1"
        companyBrandColor={null}
        company={COMPANY}
        companyDefaults={DEFAULTS}
        estimateTemplateId={templateId}
        preparedBy={null}
        recordings={[]}
        photos={[]}
        projectName="Test Project"
        projectType={null}
        client={clientName ? ({ id: 'c1', name: clientName } as never) : null}
        priceBookItems={[]}
      />
    </EditorFrameProvider>,
  )
}

const lastDock = () => dockProps[dockProps.length - 1]
const lastSlot = () => mockSetSlot.mock.calls[mockSetSlot.mock.calls.length - 1][0] as Record<string, unknown>

describe('EstimateEditor v2 — notices out of the document column', () => {
  it('Modern template: no note above the document, a hint on the dock Page toggle', () => {
    renderV2(buildEstimate(), 'modern')
    expect(screen.queryByTestId('modern-layout-note')).toBeNull()
    expect(lastDock().pageHint).toBe('Clients see the Modern template. Page view shows it that way.')
    cleanup()
    dockProps.length = 0
    renderV2(buildEstimate(), 'classic')
    expect(lastDock().pageHint).toBeUndefined()
  })

  it('superseded: no alert; the slot says superseded and the dock offers Create new version', async () => {
    vi.useFakeTimers()
    mockSaveEstimate.mockResolvedValue({ error: 'estimate_not_current' })
    renderV2(buildEstimate())
    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.queryByText('This version was superseded')).toBeNull()
    expect(lastSlot().superseded).toBe(true)
    expect(lastDock().primary?.label).toBe('Create new version')
    expect(screen.getByTestId('create-new-version-btn')).toBeTruthy()
  })

  it('declined: the dock primary is Revise and reopen', () => {
    renderV2(buildEstimate({ client_response: 'declined', responded_at: '2026-01-02T00:00:00.000Z' }))
    expect(lastDock().primary?.label).toBe('Revise and reopen')
    expect(lastSlot().onReopen).toBeTypeOf('function')
  })

  it('a draft has no primary override', () => {
    renderV2(buildEstimate())
    expect(lastDock().primary).toBeUndefined()
  })

  it('a shared estimate: one toast on the first edit naming the client', () => {
    window.localStorage.clear()
    renderV2(buildEstimate({ sent_at: '2026-01-02T00:00:00.000Z' }), 'classic', 'Maria')
    expect(toastFn).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('edit-btn'))
    expect(toastFn).toHaveBeenCalledTimes(1)
    expect(toastFn.mock.calls[0][0]).toBe('Maria already has this link. What you change shows up there right away.')
    fireEvent.click(screen.getByTestId('edit-btn'))
    expect(toastFn).toHaveBeenCalledTimes(1)
  })
})
