import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type {
  DocumentClient,
  DocumentCompany,
  CompanyDefaults,
} from '@/components/workspace/estimate/estimate-document'

// Phase 165 Plan 02 — closes the client half of audit § B2/B6 (session-
// poisoning conflict UX) and B3 (silent write to a superseded version):
//   - a genuine RPC conflict (P0002) latches `conflictPending`, PAUSES
//     autosave (no repeated saveEstimate calls while pending), and surfaces
//     exactly ONE non-stacking notice with two non-destructive resolutions
//     ("Reload latest" / "Keep my changes").
//   - `estimate_not_current` (P0003) is terminal — folds into
//     isContentReadOnly like a lock; banner, no autosave loop.
//   - a keystroke landing DURING an in-flight save (dirty-epoch, SAVE-04)
//     keeps the editor dirty and re-saves once the in-flight save resolves.
//
// REQUIRED READING for reviewers: .planning/audits/v4.19-ESTIMATE-DEEP-AUDIT.md
// § B and .planning/phases/165-atomic-save-version-authority/165-01-SUMMARY.md.

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

function renderEditor() {
  const estimate = buildEstimate()
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

function lastSlotCall(): { isDirty: boolean; isReadOnly: boolean } {
  const calls = mockSetSlot.mock.calls
  return calls[calls.length - 1][0]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EstimateEditor — conflict/not-current UX (SAVE-05) + dirty-epoch (SAVE-04)', () => {
  it('a conflict pauses autosave (no repeated saveEstimate calls while conflictPending) and shows ONE non-stacking notice with both resolutions', async () => {
    vi.useFakeTimers()
    mockSaveEstimate.mockResolvedValue({
      error: 'This estimate was changed elsewhere since you last loaded it.',
      conflict: true as const,
    })

    renderEditor()

    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    expect(mockToastError).toHaveBeenCalledTimes(1)
    const [, options] = mockToastError.mock.calls[0] as [string, Record<string, unknown>]
    expect(options.id).toBe('estimate-save-conflict')
    expect(typeof (options.action as { onClick: unknown }).onClick).toBe('function')
    expect(typeof (options.cancel as { onClick: unknown }).onClick).toBe('function')

    // A further edit while conflictPending must NOT re-fire autosave.
    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    // Still exactly one notice — no stacking.
    expect(mockToastError).toHaveBeenCalledTimes(1)
  })

  it('"Keep my changes" clears conflictPending and retries the save with force (last-writer-wins on content)', async () => {
    vi.useFakeTimers()
    mockSaveEstimate.mockResolvedValueOnce({
      error: 'This estimate was changed elsewhere since you last loaded it.',
      conflict: true as const,
    })
    mockSaveEstimate.mockResolvedValueOnce(successResult())

    renderEditor()

    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)

    const [, options] = mockToastError.mock.calls[0] as [string, { action: { onClick: () => void } }]
    await act(async () => {
      options.action.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockSaveEstimate).toHaveBeenCalledTimes(2)
    // force:true -> expectedUpdatedAt omitted (undefined), never the stale baseline.
    const secondCallPayload = mockSaveEstimate.mock.calls[1][0] as { expectedUpdatedAt?: string }
    expect(secondCallPayload.expectedUpdatedAt).toBeUndefined()

    // conflictPending cleared -> a subsequent edit resumes normal autosave.
    fireEvent.click(screen.getByTestId('edit-btn'))
    mockSaveEstimate.mockResolvedValueOnce(successResult())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(3)
  })

  it('"Reload latest" discards local edits via handleDiscard and clears conflictPending', async () => {
    vi.useFakeTimers()
    mockSaveEstimate.mockResolvedValue({
      error: 'This estimate was changed elsewhere since you last loaded it.',
      conflict: true as const,
    })
    mockGetEstimateByIdAction.mockResolvedValue({ data: buildEstimate({ updated_at: '2026-02-01T00:00:00.000Z' }) })

    renderEditor()

    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)

    const [, options] = mockToastError.mock.calls[0] as [string, { cancel: { onClick: () => void } }]
    await act(async () => {
      options.cancel.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockGetEstimateByIdAction).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith('Changes discarded')
  })

  it('estimate_not_current is terminal: shows a banner, folds into isContentReadOnly, and stops the autosave loop', async () => {
    vi.useFakeTimers()
    mockSaveEstimate.mockResolvedValue({ error: 'estimate_not_current' })

    renderEditor()

    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('This version was superseded')).toBeTruthy()
    expect(lastSlotCall().isReadOnly).toBe(true)

    // Further edits must not trigger more autosave calls (terminal, like a lock).
    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
  })

  it('an edit landing mid-save keeps the editor dirty (epoch mismatch) and re-saves once the in-flight save resolves', async () => {
    vi.useFakeTimers()
    let resolveFirst: ((value: unknown) => void) | null = null
    mockSaveEstimate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    mockSaveEstimate.mockImplementationOnce(() => Promise.resolve(successResult()))

    renderEditor()

    // Edit #1 -> editEpoch 0 -> 1. Autosave schedules the first save.
    fireEvent.click(screen.getByTestId('edit-btn'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(1)
    // The first save is still in flight (its promise is unresolved) -- isDirty
    // must still read true (it hasn't been cleared yet).
    expect(lastSlotCall().isDirty).toBe(true)

    // Edit #2 lands WHILE the first save is in flight -> editEpoch 1 -> 2.
    fireEvent.click(screen.getByTestId('edit-btn'))
    expect(lastSlotCall().isDirty).toBe(true)

    // Resolve the first (stale-epoch) save -> MARK_SAVED's savedEpoch (1) !==
    // the CURRENT editEpoch (2) -> isDirty must stay true (audit B4 guard).
    await act(async () => {
      resolveFirst?.(successResult())
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(lastSlotCall().isDirty).toBe(true)

    // Because isDirty is still true, the autosave effect (re-triggered by
    // edit #2's state change) scheduled a SECOND save -- advance to fire it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(2)
    // This second save's savedEpoch (2) now matches the current editEpoch (2,
    // no further edits landed) -> isDirty finally clears.
    expect(lastSlotCall().isDirty).toBe(false)

    // No more edits -> no further autosave firing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockSaveEstimate).toHaveBeenCalledTimes(2)
  })
})
