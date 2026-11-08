import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))
const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}))
const showBillingBlockToast = vi.fn(() => true)
vi.mock('@/lib/billing/block-toast', () => ({
  showBillingBlockToast: (...a: unknown[]) => (showBillingBlockToast as (...x: unknown[]) => boolean)(...a),
}))
const getEstimateByIdAction = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  getEstimateByIdAction: (...a: unknown[]) => getEstimateByIdAction(...a),
}))

import { useRefineFlow } from '@/components/capture/use-refine-flow'
import { registerRefineEditor, consumePendingRefinement, type RefineEditorHandle } from '@/lib/estimate/refine-bridge'
import type { EditorSection, RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

const fetchMock = vi.fn()

const sections: EditorSection[] = [
  {
    id: 's1',
    title: 'Work',
    sort_order: 0,
    subtotal: 0,
    items: [
      { id: 'i1', description: 'Paint walls', quantity: 1, unit: null, unit_price: 100, total: 100, sort_order: 0, price_source: 'ai_estimate' },
      { id: 'i2', description: 'Haul debris', quantity: 1, unit: null, unit_price: 50, total: 50, sort_order: 1, price_source: 'ai_estimate' },
    ],
  },
]

const refined: RefinementPayload = {
  summary: 'New summary',
  sections: [
    {
      title: 'Work',
      items: [
        { description: 'Paint walls', quantity: 1, unit_price: 140, price_source: 'ai_estimate' },
        { description: 'Install crown molding', quantity: 3, unit_price: 25, price_source: 'ai_estimate' },
      ],
    },
  ],
}

function okResponse(payload: RefinementPayload = refined) {
  return { ok: true, status: 200, json: async () => ({ success: true, refined: payload, instruction: 'ins' }) }
}

function makeEditor(over: Partial<RefineEditorHandle> = {}): RefineEditorHandle {
  return {
    estimateId: () => 'est-1',
    currencyCode: () => 'USD',
    getContent: () => ({ sections, summary: 'Old summary' }),
    flush: vi.fn(async () => ({ ok: true as const })),
    apply: vi.fn(async () => 'saved' as const),
    ...over,
  }
}

function setup() {
  const onDone = vi.fn()
  const onApplied = vi.fn()
  const hook = renderHook(() => useRefineFlow({ estimateId: 'est-1', projectId: 'proj-1', onDone, onApplied }))
  return { ...hook, onDone, onApplied }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

describe('useRefineFlow', () => {
  it('flushes the dirty editor, then posts to /refine, then reviews against the live editor content', async () => {
    const order: string[] = []
    const editor = makeEditor({
      flush: vi.fn(async () => {
        order.push('flush')
        return { ok: true as const }
      }),
    })
    const off = registerRefineEditor(editor)
    fetchMock.mockImplementation(async () => {
      order.push('fetch')
      return okResponse()
    })
    const { result } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'raise paint, add molding' })
    })
    expect(order).toEqual(['flush', 'fetch'])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/estimates/est-1/refine')
    expect(result.current.phase).toBe('review')
    const { diff } = result.current.review!
    expect(diff.changed).toEqual([
      { description: 'Paint walls', oldPrice: 100, newPrice: 140, oldQty: 1, newQty: 1 },
    ])
    expect(diff.added).toEqual([{ description: 'Install crown molding', unit_price: 25 }])
    expect(diff.removed).toEqual([{ description: 'Haul debris' }])
    expect(diff.fields.summary).toEqual({ old: 'Old summary', new: 'New summary' })
    off()
  })

  it('aborts BEFORE the fetch when the flush fails, and shows the error', async () => {
    const off = registerRefineEditor(makeEditor({ flush: vi.fn(async () => ({ ok: false as const, error: 'Save conflict' })) }))
    const { result } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Save conflict')
    expect(result.current.phase).toBe('idle')
    expect(result.current.review).toBeNull()
    off()
  })

  it('shows the route message for a locked estimate and does not proceed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Estimate has been delivered and is locked', code: 'estimate_locked' }),
    })
    const { result } = setup()
    getEstimateByIdAction.mockResolvedValue({ error: 'unused' })
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    expect(toastError).toHaveBeenCalledWith('Estimate has been delivered and is locked')
    expect(result.current.phase).toBe('idle')
    expect(result.current.review).toBeNull()
  })

  it('routes a 402 to the billing toast', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: 'plan_limit_reached', reason: 'credits', state: 'out_of_credits' }),
    })
    const { result } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    expect(showBillingBlockToast).toHaveBeenCalledWith('out_of_credits', expect.anything(), expect.anything())
    expect(result.current.phase).toBe('idle')
  })

  it('without a mounted editor, proceeds and diffs against the persisted estimate', async () => {
    getEstimateByIdAction.mockResolvedValue({
      data: { currency_code: 'USD', summary: 'Old summary', notes: null, timeline: null, payment_terms: null, warranty_terms: null, sections },
    })
    fetchMock.mockResolvedValue(okResponse())
    const { result } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    expect(getEstimateByIdAction).toHaveBeenCalledWith('est-1')
    expect(result.current.review?.diff.removed).toEqual([{ description: 'Haul debris' }])
  })

  it('Apply delivers exactly the reviewed payload to the editor, then closes', async () => {
    const editor = makeEditor()
    const off = registerRefineEditor(editor)
    fetchMock.mockResolvedValue(okResponse())
    const { result, onDone, onApplied } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    const reviewed = result.current.review!.refined
    await act(async () => {
      await result.current.apply()
    })
    expect(editor.apply).toHaveBeenCalledTimes(1)
    expect((editor.apply as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(reviewed)
    expect(onApplied).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
    off()
  })

  it('Apply keeps the review open when the editor is locked', async () => {
    const editor = makeEditor({ apply: vi.fn(async () => 'blocked' as const) })
    const off = registerRefineEditor(editor)
    fetchMock.mockResolvedValue(okResponse())
    const { result, onDone } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    await act(async () => {
      await result.current.apply()
    })
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('review')
    off()
  })

  it('Apply with no editor hands the payload off and navigates to the estimate tab', async () => {
    getEstimateByIdAction.mockResolvedValue({
      data: { currency_code: 'USD', summary: 'Old', notes: null, timeline: null, payment_terms: null, warranty_terms: null, sections },
    })
    fetchMock.mockResolvedValue(okResponse())
    const { result, onDone } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    const reviewed = result.current.review!.refined
    await act(async () => {
      await result.current.apply()
    })
    expect(push).toHaveBeenCalledWith('/projects/proj-1?tab=estimate')
    expect(consumePendingRefinement('est-1')).toEqual(reviewed)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('Discard changes nothing and closes', async () => {
    const editor = makeEditor()
    const off = registerRefineEditor(editor)
    fetchMock.mockResolvedValue(okResponse())
    const { result, onDone } = setup()
    await act(async () => {
      await result.current.submit({ instruction: 'x' })
    })
    act(() => result.current.discard())
    await waitFor(() => expect(result.current.review).toBeNull())
    expect(editor.apply).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(onDone).toHaveBeenCalledTimes(1)
    off()
  })
})
