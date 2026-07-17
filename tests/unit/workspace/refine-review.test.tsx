import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { RefineEstimateDialog } from '@/components/workspace/estimate/refine-estimate-dialog'
import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { MergeCurrentContent } from '@/lib/estimate/refine-merge'
import type { RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

// Phase 170 Plan 01 (REFINE-01/02) — closes audit § G1/G3.
//
// REQUIRED READING for reviewers: .planning/audits/v4.19-ESTIMATE-DEEP-AUDIT.md
// § G and lib/estimate/refine-merge.ts (the shared pure util this dialog and
// the reducer's APPLY_REFINEMENT both call).
//
// Covers:
//   - REFINE-01: a dirty editor flushes (onBeforeRefine) BEFORE the refine
//     POST fires; a flush failure aborts before ever reaching the route.
//   - REFINE-02: the POST response is reviewed (diff rendered, changed/
//     added/removed) before anything is applied; Discard is a true no-op;
//     Apply dispatches the SAME payload the review diffed, and re-running it
//     through the real reducer preserves untouched/reworded row ids.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_CONTENT: MergeCurrentContent = {
  sections: [
    {
      id: 'sec-1',
      title: 'General',
      sort_order: 0,
      subtotal: 800,
      items: [
        {
          id: 'item-1',
          description: 'Paint bedroom walls',
          quantity: 1,
          unit: null,
          unit_price: 200,
          total: 200,
          sort_order: 0,
          price_source: 'ai_estimate',
          isManuallyEdited: false,
          taxable: true,
        },
        {
          id: 'item-2',
          description: 'Install 30 sq ft of quartz countertop',
          quantity: 1,
          unit: null,
          unit_price: 300,
          total: 300,
          sort_order: 1,
          price_source: 'ai_estimate',
          isManuallyEdited: false,
          taxable: true,
        },
        {
          id: 'item-3',
          description: 'Carpet shampoo',
          quantity: 1,
          unit: null,
          unit_price: 300,
          total: 300,
          sort_order: 2,
          price_source: 'ai_estimate',
          isManuallyEdited: false,
          taxable: true,
        },
      ],
    },
  ],
  summary: 'Original summary text.',
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
}

// The POST response: item-1 unchanged, item-2 REWORDED (must keep its id via
// pass-2 positional pairing), item-3 dropped (removed), one brand-new line
// (added). Exercises all three diff buckets in one refine.
const REFINED_PAYLOAD: RefinementPayload = {
  summary: 'New, more professional summary text.',
  sections: [
    {
      title: 'General',
      items: [
        { description: 'Paint bedroom walls', quantity: 1, unit_price: 200, price_source: 'ai_estimate' },
        {
          description: 'Install 32 sq ft of quartz countertop with polished edge',
          quantity: 1,
          unit_price: 300,
          price_source: 'ai_estimate',
        },
        { description: 'Install ceiling fan', quantity: 1, unit_price: 150, price_source: 'ai_estimate' },
      ],
    },
  ],
}

function mockRefineFetch(overrides: Partial<{ ok: boolean; status: number; body: unknown }> = {}) {
  const ok = overrides.ok ?? true
  const body = overrides.body ?? { success: true, refined: REFINED_PAYLOAD, instruction: 'do the thing' }
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: overrides.status ?? (ok ? 200 : 500),
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

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
    summary: CURRENT_CONTENT.summary,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 800,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 800,
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
    sections: CURRENT_CONTENT.sections.map((s) => ({
      ...s,
      estimate_id: 'est-1',
      company_id: 'company-1',
      items: s.items.map((i) => ({ ...i, section_id: s.id, company_id: 'company-1' })),
    })),
  }
  return { ...base, ...overrides } as unknown as EstimateWithSections
}

async function fillInstructionAndOpen(onBeforeRefine: () => Promise<boolean>, isDirty = false) {
  const onApply = vi.fn()
  render(
    <RefineEstimateDialog
      estimateId="est-1"
      version={1}
      isDirty={isDirty}
      onBeforeRefine={onBeforeRefine}
      currentContent={CURRENT_CONTENT}
      currencyCode="USD"
      onApply={onApply}
    />
  )

  fireEvent.click(screen.getByText('Refine with AI'))
  const textarea = await screen.findByPlaceholderText(/Add gutter cleaning/)
  fireEvent.change(textarea, { target: { value: 'Rework the countertop line and add a ceiling fan' } })

  return { onApply }
}

// ---------------------------------------------------------------------------
// REFINE-01: flush-before-refine
// ---------------------------------------------------------------------------

describe('RefineEstimateDialog — REFINE-01 flush-before-refine', () => {
  it('a dirty editor flushes (onBeforeRefine) BEFORE the refine POST fires', async () => {
    const callOrder: string[] = []
    const onBeforeRefine = vi.fn().mockImplementation(async () => {
      callOrder.push('flush')
      return true
    })
    const fetchMock = mockRefineFetch()
    // Wrap fetch so we can record call order relative to the flush.
    const orderedFetch = vi.fn().mockImplementation((...args: Parameters<typeof fetch>) => {
      callOrder.push('post')
      return fetchMock(...args)
    })
    vi.stubGlobal('fetch', orderedFetch)

    await fillInstructionAndOpen(onBeforeRefine, /* isDirty */ true)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))

    await waitFor(() => expect(orderedFetch).toHaveBeenCalledTimes(1))
    expect(onBeforeRefine).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['flush', 'post'])
  })

  it('a clean editor (isDirty=false) never calls onBeforeRefine', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(true)
    mockRefineFetch()

    await fillInstructionAndOpen(onBeforeRefine, /* isDirty */ false)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))

    await waitFor(() => expect(screen.getByTestId('refine-review')).toBeTruthy())
    expect(onBeforeRefine).not.toHaveBeenCalled()
  })

  it('a FAILED flush aborts before the POST -- no fetch call, no review shown', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(false)
    const fetchMock = mockRefineFetch()

    await fillInstructionAndOpen(onBeforeRefine, /* isDirty */ true)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))

    await waitFor(() => expect(onBeforeRefine).toHaveBeenCalledTimes(1))
    // Give any (incorrect) async POST a tick to fire, then assert it never did.
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('refine-review')).toBeNull()
    // Dialog remains open with the input form (not stuck in a spinner).
    expect(screen.getByTestId('refine-submit-btn')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// REFINE-02: review diff renders changed/added/removed; Discard/Apply
// ---------------------------------------------------------------------------

describe('RefineEstimateDialog — REFINE-02 review-before-apply', () => {
  it('renders the diff summary with changed, added, and removed lines (+ field-level summary change)', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(true)
    mockRefineFetch()

    await fillInstructionAndOpen(onBeforeRefine)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))

    await waitFor(() => expect(screen.getByTestId('refine-review')).toBeTruthy())

    // Changed: item-2's reworded description, NOT classified as remove+add.
    expect(screen.getByTestId('refine-diff-changed').textContent).toContain(
      'Install 32 sq ft of quartz countertop with polished edge'
    )
    // Added: the brand-new ceiling fan line.
    expect(screen.getByTestId('refine-diff-added').textContent).toContain('Install ceiling fan')
    // Removed: the dropped carpet-shampoo line.
    expect(screen.getByTestId('refine-diff-removed').textContent).toContain('Carpet shampoo')
    // Field-level: the summary changed too.
    expect(screen.getByTestId('refine-diff-summary').textContent).toContain('New, more professional summary text.')

    // The review screen replaces the input form -- no more textarea/submit btn.
    expect(screen.queryByTestId('refine-submit-btn')).toBeNull()
  })

  it('Discard closes with NO onApply call (the document is left untouched)', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(true)
    mockRefineFetch()

    const { onApply } = await fillInstructionAndOpen(onBeforeRefine)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))
    await waitFor(() => expect(screen.getByTestId('refine-review')).toBeTruthy())

    fireEvent.click(screen.getByTestId('refine-discard-btn'))

    expect(onApply).not.toHaveBeenCalled()
  })

  it('Apply calls onApply with exactly the refined payload that was reviewed', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(true)
    mockRefineFetch()

    const { onApply } = await fillInstructionAndOpen(onBeforeRefine)
    fireEvent.click(screen.getByTestId('refine-submit-btn'))
    await waitFor(() => expect(screen.getByTestId('refine-review')).toBeTruthy())

    fireEvent.click(screen.getByTestId('refine-apply-btn'))

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(REFINED_PAYLOAD)
  })
})

// ---------------------------------------------------------------------------
// REFINE-02: Apply -> the SAME payload run through the REAL reducer
// preserves untouched + reworded row ids (only the genuinely new row gets a
// temp- id; the dropped row disappears).
// ---------------------------------------------------------------------------

describe('RefineEstimateDialog + reducer — Apply preserves row identity', () => {
  it('dispatching APPLY_REFINEMENT with the reviewed payload keeps item-1 and item-2 ids, drops item-3, mints a temp- id for the new line', async () => {
    const onBeforeRefine = vi.fn().mockResolvedValue(true)
    mockRefineFetch()

    let capturedRefined: RefinementPayload | null = null
    const onApply = vi.fn((refined: RefinementPayload) => {
      capturedRefined = refined
    })

    render(
      <RefineEstimateDialog
        estimateId="est-1"
        version={1}
        isDirty={false}
        onBeforeRefine={onBeforeRefine}
        currentContent={CURRENT_CONTENT}
        currencyCode="USD"
        onApply={onApply}
      />
    )
    fireEvent.click(screen.getByText('Refine with AI'))
    const textarea = await screen.findByPlaceholderText(/Add gutter cleaning/)
    fireEvent.change(textarea, { target: { value: 'Rework the countertop line and add a ceiling fan' } })
    fireEvent.click(screen.getByTestId('refine-submit-btn'))
    await waitFor(() => expect(screen.getByTestId('refine-review')).toBeTruthy())
    fireEvent.click(screen.getByTestId('refine-apply-btn'))

    expect(capturedRefined).not.toBeNull()

    // Feed the EXACT captured payload through the real reducer (same code
    // path estimate-editor.tsx wires: dispatch({ type: 'APPLY_REFINEMENT', refined })).
    const { result } = renderHook(() => useEstimateReducer(buildEstimate()))
    act(() => {
      result.current[1]({ type: 'APPLY_REFINEMENT', refined: capturedRefined as RefinementPayload })
    })

    const [state] = result.current
    const items = state.sections[0].items
    const byId = Object.fromEntries(items.map((i) => [i.id, i.description]))

    expect(byId['item-1']).toBe('Paint bedroom walls')
    expect(byId['item-2']).toBe('Install 32 sq ft of quartz countertop with polished edge')
    expect(items.some((i) => i.id === 'item-3')).toBe(false)
    expect(items.some((i) => i.id.startsWith('temp-') && i.description === 'Install ceiling fan')).toBe(true)
    expect(items).toHaveLength(3)
  })
})
