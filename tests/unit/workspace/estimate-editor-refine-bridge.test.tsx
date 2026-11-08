import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { getRefineEditor, storePendingRefinement } from '@/lib/estimate/refine-bridge'
import type { RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type {
  DocumentClient,
  DocumentCompany,
  CompanyDefaults,
} from '@/components/workspace/estimate/estimate-document'

// "Edit with AI" bridge: the editor registers a handle (lib/estimate/refine-bridge.ts)
// so the popup can flush unsaved edits, read live content and apply the
// reviewed refinement (APPLY_REFINEMENT + save). A payload handed over through
// sessionStorage is applied once on mount.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterRefresh = vi.fn()
const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: mockRouterPush }),
}))

const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const mockSetSlot = vi.fn()
vi.mock('@/components/workspace/estimate-version-context', () => ({
  useEstimateVersionSlot: () => ({ setSlot: mockSetSlot }),
}))

const mockSaveEstimate = vi.fn()
const mockSavePresentationSettings = vi.fn()
const mockCreateBlankEstimate = vi.fn()
const mockGetEstimateByIdAction = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  saveEstimate: (...args: unknown[]) => mockSaveEstimate(...args),
  savePresentationSettings: (...args: unknown[]) => mockSavePresentationSettings(...args),
  createBlankEstimate: (...args: unknown[]) => mockCreateBlankEstimate(...args),
  getEstimateByIdAction: (...args: unknown[]) => mockGetEstimateByIdAction(...args),
}))

vi.mock('@/lib/actions/estimate-photo', () => ({
  removePhotoFromEstimate: vi.fn(),
}))

vi.mock('@/lib/actions/project', () => ({
  renameProjectAction: vi.fn(),
}))

// The document surface is 2000+ lines and irrelevant to save/conflict wiring
// -- replace with a minimal stub exposing `dispatch` via a single button so
// tests can drive reducer actions (mirrors real edits: every dispatch bumps
// editEpoch + isDirty via the reducer's own `dirty()` helper). estimate-editor
// only imports TYPES from this module besides the component itself (erased at
// compile time), so no other runtime export needs to be preserved here.
vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: (props: { dispatch: (action: unknown) => void }) => (
    <button
      data-testid="edit-btn"
      onClick={() =>
        props.dispatch({ type: 'UPDATE_FIELD', field: 'summary', value: `edit-${Math.random()}` })
      }
    >
      Edit
    </button>
  ),
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
  mockRouterRefresh.mockReset()
  mockRouterPush.mockReset()
  mockToastError.mockReset()
  mockToastSuccess.mockReset()
  mockSetSlot.mockReset()
  mockSaveEstimate.mockReset()
  mockSavePresentationSettings.mockReset()
  mockCreateBlankEstimate.mockReset()
  mockGetEstimateByIdAction.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Fixture + render helper
// ---------------------------------------------------------------------------

function buildEstimate(overrides: Record<string, unknown> = {}): EstimateWithSections {
  const base = {
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
    language: 'en' as const,
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
    deposit_type: 'none' as const,
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
  }
  return { ...base, ...overrides } as unknown as EstimateWithSections
}

function renderEditor(estimateOverrides: Record<string, unknown> = {}) {
  const estimate = buildEstimate(estimateOverrides)
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
  const client: DocumentClient | null = null

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
      client={client}
      priceBookItems={[]}
    />
  )
}

function successResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      total: 1500,
      updated_at: '2026-01-02T00:00:00.000Z',
      id_map: {},
      subtotal: 1500,
      tax_amount: 0,
      discount_amount: 0,
      balance_due: 1500,
      ...overrides,
    },
  }
}


const refined: RefinementPayload = {
  summary: 'Refined summary',
  sections: [
    {
      title: 'Work',
      items: [{ description: 'New line', quantity: 2, unit_price: 50, price_source: 'ai_estimate' }],
    },
  ],
}

// apply() resolves only after the editor re-renders and its save effect runs, so
// the call must start inside act() but be awaited outside the same act scope.
async function applyRefinement(payload: RefinementPayload) {
  let pending!: ReturnType<NonNullable<ReturnType<typeof getRefineEditor>>['apply']>
  act(() => {
    pending = getRefineEditor('est-1')!.apply(payload)
  })
  let outcome: Awaited<typeof pending> | undefined
  await act(async () => {
    outcome = await pending
  })
  return outcome
}

describe('EstimateEditor refine bridge', () => {
  beforeEach(() => sessionStorage.clear())

  it('registers a handle for its estimate and unregisters on unmount', () => {
    const { unmount } = renderEditor()
    expect(getRefineEditor('est-1')).not.toBeNull()
    expect(getRefineEditor('other')).toBeNull()
    unmount()
    expect(getRefineEditor('est-1')).toBeNull()
  })

  it('flush saves unsaved edits first, and is a no-op when clean', async () => {
    mockSaveEstimate.mockResolvedValue(successResult())
    renderEditor()
    const handle = getRefineEditor('est-1')!

    await expect(handle.flush()).resolves.toEqual({ ok: true })
    expect(mockSaveEstimate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('edit-btn'))
    await expect(handle.flush()).resolves.toEqual({ ok: true })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
  })

  it('flush reports failure when the save fails or conflicts', async () => {
    mockSaveEstimate.mockResolvedValue({ error: 'changed elsewhere', conflict: true as const })
    renderEditor()
    fireEvent.click(screen.getByTestId('edit-btn'))
    const result = await getRefineEditor('est-1')!.flush()
    expect(result.ok).toBe(false)
  })

  it('apply dispatches the refinement and saves it', async () => {
    mockSaveEstimate.mockResolvedValue(successResult())
    renderEditor()
    const outcome = await applyRefinement(refined)
    expect(outcome).toBe('saved')
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    const payload = mockSaveEstimate.mock.calls[0][0] as {
      summary: string
      sections: Array<{ items: Array<{ description: string }> }>
    }
    expect(payload.summary).toBe('Refined summary')
    expect(payload.sections[0].items[0].description).toBe('New line')
    expect(getRefineEditor('est-1')!.getContent().summary).toBe('Refined summary')
  })

  it('apply reports unsaved when the save fails, blocked when the estimate is locked', async () => {
    mockSaveEstimate.mockResolvedValue({ error: 'boom' })
    const first = renderEditor()
    expect(await applyRefinement(refined)).toBe('unsaved')
    first.unmount()

    mockSaveEstimate.mockReset()
    renderEditor({ sent_at: '2026-01-02T00:00:00.000Z' })
    expect(await applyRefinement(refined)).toBe('blocked')
    expect(mockSaveEstimate).not.toHaveBeenCalled()
  })

  it('applies and saves a handed-off refinement once on mount', async () => {
    mockSaveEstimate.mockResolvedValue(successResult())
    storePendingRefinement('est-1', refined)
    await act(async () => {
      renderEditor()
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    expect((mockSaveEstimate.mock.calls[0][0] as { summary: string }).summary).toBe('Refined summary')
    expect(sessionStorage.getItem('xtimator:pending-refinement')).toBeNull()
  })

  it('ignores a handoff meant for another estimate', async () => {
    storePendingRefinement('someone-else', refined)
    await act(async () => {
      renderEditor()
    })
    expect(mockSaveEstimate).not.toHaveBeenCalled()
  })
})
