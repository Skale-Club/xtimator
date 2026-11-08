import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  registerRefineEditor,
  getRefineEditor,
  storePendingRefinement,
  consumePendingRefinement,
  type RefineEditorHandle,
} from '@/lib/estimate/refine-bridge'
import { requestRefine } from '@/lib/capture/refine-client'
import type { RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

const refined: RefinementPayload = {
  summary: 's',
  sections: [{ title: 'Work', items: [{ description: 'a', quantity: 1, unit_price: 10, price_source: 'ai_estimate' }] }],
}

function handle(id: string): RefineEditorHandle {
  return {
    estimateId: () => id,
    currencyCode: () => 'USD',
    getContent: () => ({ sections: [], summary: null }),
    flush: async () => ({ ok: true }),
    apply: async () => 'saved',
  }
}

describe('refine bridge registry', () => {
  it('returns the editor only for the estimate it shows, and unregisters', () => {
    const off = registerRefineEditor(handle('e1'))
    expect(getRefineEditor('e1')).not.toBeNull()
    expect(getRefineEditor('e2')).toBeNull()
    off()
    expect(getRefineEditor('e1')).toBeNull()
  })

  it('a stale unregister does not drop a newer editor', () => {
    const offOld = registerRefineEditor(handle('e1'))
    const offNew = registerRefineEditor(handle('e1'))
    offOld()
    expect(getRefineEditor('e1')).not.toBeNull()
    offNew()
  })
})

describe('refine bridge sessionStorage handoff', () => {
  beforeEach(() => sessionStorage.clear())

  it('is consumed exactly once', () => {
    expect(storePendingRefinement('e1', refined)).toBe(true)
    expect(consumePendingRefinement('e1')).toEqual(refined)
    expect(consumePendingRefinement('e1')).toBeNull()
  })

  it('leaves a handoff for another estimate untouched', () => {
    storePendingRefinement('e1', refined)
    expect(consumePendingRefinement('e2')).toBeNull()
    expect(consumePendingRefinement('e1')).toEqual(refined)
  })

  it('drops a stale handoff', () => {
    storePendingRefinement('e1', refined)
    expect(consumePendingRefinement('e1', Date.now() + 11 * 60 * 1000)).toBeNull()
  })
})

describe('requestRefine', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('posts FormData with instruction, audio and photos[] to the refine route', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, refined, instruction: 'do it' }),
    })
    const audio = new Blob(['a'], { type: 'audio/webm' })
    const photo = new Blob(['p'], { type: 'image/jpeg' })
    const res = await requestRefine('est-9', { instruction: '  do it ', audio, photos: [photo, photo] })
    expect(res).toEqual({ ok: true, refined, instruction: 'do it' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/estimates/est-9/refine')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('instruction')).toBe('do it')
    expect(form.get('audio')).toBeInstanceOf(Blob)
    expect(form.getAll('photos')).toHaveLength(2)
  })

  it('surfaces the lock message and the billing state', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Estimate has been delivered and is locked', code: 'estimate_locked' }),
    })
    expect(await requestRefine('e', { instruction: 'x' })).toEqual({
      ok: false,
      error: 'Estimate has been delivered and is locked',
      code: 'estimate_locked',
    })
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: 'plan_limit_reached', reason: 'credits', state: 'out_of_credits' }),
    })
    const res = await requestRefine('e', { instruction: 'x' })
    expect(res).toMatchObject({ ok: false, billing: 'out_of_credits' })
  })

  it('tolerates extra fields on refined items', async () => {
    const extra = {
      ...refined,
      sections: [{ title: 'Work', items: [{ ...refined.sections[0].items[0], confidence: 'high', basis: 'x' }] }],
    }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, refined: extra, instruction: 'i' }) })
    const res = await requestRefine('e', { instruction: 'x' })
    expect(res.ok && res.refined).toEqual(extra)
  })
})
