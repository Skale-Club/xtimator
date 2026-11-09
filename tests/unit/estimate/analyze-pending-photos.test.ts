// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Safety net: generate-estimate analyzes photos that still have no
 * ai_description BEFORE the graph reads them (audio + photos, text + photos,
 * WhatsApp never dispatch the analyze-photos job).
 */

const mockAnalyzePhotoById = vi.fn()
const mockRecordUsage = vi.fn().mockResolvedValue(undefined)
const mockRecordCreditDebit = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/inngest/functions/analyze-photos', () => ({
  analyzePhotoById: (...args: unknown[]) => mockAnalyzePhotoById(...args),
  visionCostAttemptId: (a: string, r: string, p: string) => `${a}|${r}|${p}`,
  VISION_CHUNK_SIZE: 10,
}))
vi.mock('@/lib/quota', () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  recordCreditDebit: (...args: unknown[]) => mockRecordCreditDebit(...args),
}))

const state: {
  photos: Array<{ id: string; storage_path: string }>
  costRows: Array<{ real_cost_usd: number | null }>
  photoQueryFilters: Array<[string, unknown]>
  costQueryFilters: Array<[string, unknown]>
  throwOnPhotos: boolean
} = { photos: [], costRows: [], photoQueryFilters: [], costQueryFilters: [], throwOnPhotos: false }

function makeSvc() {
  return {
    from: (table: string) => {
      if (table === 'photos') {
        if (state.throwOnPhotos) throw new Error('db down')
        return {
          select: () => {
            const chain: Record<string, unknown> = {}
            chain.eq = (c: string, v: unknown) => (state.photoQueryFilters.push([c, v]), chain)
            chain.order = () => chain
            chain.is = (c: string, v: unknown) => (state.photoQueryFilters.push([`is:${c}`, v]), chain)
            chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve({ data: state.photos }).then(res, rej)
            return chain
          },
        }
      }
      if (table === 'ai_cost_events') {
        return {
          select: () => {
            const chain: Record<string, unknown> = {}
            chain.in = (c: string, v: unknown) => (state.costQueryFilters.push([`in:${c}`, v]), chain)
            chain.eq = (c: string, v: unknown) => (state.costQueryFilters.push([c, v]), chain)
            chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve({ data: state.costRows }).then(res, rej)
            return chain
          },
        }
      }
      return {}
    },
  }
}
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => makeSvc() }))

const ARGS = { companyId: 'co-1', projectId: 'pr-1', attemptId: 'att-1', requestId: 'req-1' }

async function run() {
  const { analyzePendingPhotos } = await import('@/lib/estimate/photos/analyze-pending-photos')
  return analyzePendingPhotos(ARGS)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.photos = []
  state.costRows = [{ real_cost_usd: 0.01 }, { real_cost_usd: 0.02 }]
  state.photoQueryFilters = []
  state.costQueryFilters = []
  state.throwOnPhotos = false
  mockAnalyzePhotoById.mockImplementation(async ({ photo }: { photo: { id: string } }) => ({
    photoId: photo.id,
    description: `desc ${photo.id}`,
  }))
})

describe('analyzePendingPhotos', () => {
  it('analyzes pending photos (null ai_description only, company-scoped) before generation', async () => {
    state.photos = [
      { id: 'p1', storage_path: 'a/1.jpg' },
      { id: 'p2', storage_path: 'a/2.jpg' },
    ]
    const r = await run()
    expect(r).toEqual({ pending: 2, analyzed: 2, failed: 0 })
    expect(mockAnalyzePhotoById).toHaveBeenCalledTimes(2)
    expect(state.photoQueryFilters).toContainEqual(['is:ai_description', null])
    expect(state.photoQueryFilters).toContainEqual(['company_id', 'co-1'])
    expect(state.photoQueryFilters).toContainEqual(['project_id', 'pr-1'])
  })

  it('is a no-op when nothing is pending (no vision call, no usage, no debit)', async () => {
    state.photos = []
    const r = await run()
    expect(r).toEqual({ pending: 0, analyzed: 0, failed: 0 })
    expect(mockAnalyzePhotoById).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('a vision failure never throws; the surviving photos are still counted and debited', async () => {
    state.photos = [
      { id: 'p1', storage_path: 'a/1.jpg' },
      { id: 'p2', storage_path: 'a/2.jpg' },
    ]
    mockAnalyzePhotoById.mockImplementation(async ({ photo }: { photo: { id: string } }) => {
      if (photo.id === 'p1') throw new Error('vision down')
      return { photoId: photo.id, description: 'ok' }
    })
    const r = await run()
    expect(r).toEqual({ pending: 2, analyzed: 1, failed: 1 })
    expect(mockRecordUsage).toHaveBeenCalledTimes(1)
    expect(mockRecordUsage.mock.calls[0][3]).toBe('req-1:gen-photos')
    expect(mockRecordUsage.mock.calls[0][2]).toBe('photo_analyzed')
    expect(mockRecordUsage.mock.calls[0][3]).not.toBe('req-1') // never collides with the estimate's key
  })

  it('all photos failing returns without usage or debit and without throwing', async () => {
    state.photos = [{ id: 'p1', storage_path: 'a/1.jpg' }]
    mockAnalyzePhotoById.mockRejectedValue(new Error('vision down'))
    const r = await run()
    expect(r).toEqual({ pending: 1, analyzed: 0, failed: 1 })
    expect(mockRecordUsage).not.toHaveBeenCalled()
    expect(mockRecordCreditDebit).not.toHaveBeenCalled()
  })

  it('debits ONCE as photo_batch from the vision-only cost rows of the succeeded photos', async () => {
    state.photos = [
      { id: 'p1', storage_path: 'a/1.jpg' },
      { id: 'p2', storage_path: 'a/2.jpg' },
    ]
    await run()
    expect(mockRecordCreditDebit).toHaveBeenCalledTimes(1)
    const arg = mockRecordCreditDebit.mock.calls[0][0]
    expect(arg.operationType).toBe('photo_batch')
    expect(arg.attemptId).toBe('att-1')
    expect(arg.realCostUsd).toBeCloseTo(0.03)
    expect(state.costQueryFilters).toContainEqual(['operation_type', 'vision'])
    expect(state.costQueryFilters).toContainEqual([
      'in:attempt_id',
      ['att-1|req-1|p1', 'att-1|req-1|p2'],
    ])
  })

  it('never throws when the photo query itself fails', async () => {
    state.throwOnPhotos = true
    await expect(run()).resolves.toEqual({ pending: 0, analyzed: 0, failed: 0 })
    expect(mockAnalyzePhotoById).not.toHaveBeenCalled()
  })
})

describe('generate-estimate wiring', () => {
  const src = readFileSync(resolve(process.cwd(), 'lib/inngest/functions/generate-estimate.ts'), 'utf8')

  it('runs the analyze-pending-photos step after generation-start and BEFORE the graph step', () => {
    const start = src.indexOf("step.run('generation-start'")
    const pending = src.indexOf("step.run('analyze-pending-photos'")
    const graph = src.indexOf("step.run('orchestrate-estimate'")
    expect(start).toBeGreaterThanOrEqual(0)
    expect(pending).toBeGreaterThan(start)
    expect(graph).toBeGreaterThan(pending)
  })

  it('wraps the step in try/catch so it can never fail generation', () => {
    const body = src.slice(src.indexOf("step.run('analyze-pending-photos'"), src.indexOf("step.run('orchestrate-estimate'"))
    expect(body).toMatch(/try\s*\{/)
    expect(body).toMatch(/catch\s*\(/)
  })

  it('the estimate debit read-back stays limited to estimate ops (vision excluded)', () => {
    expect(src).toMatch(/\.in\('operation_type',\s*\['estimate',\s*'estimate_retry'\]\)/)
  })
})

describe('capture-recorder text + photos routing', () => {
  const src = readFileSync(resolve(process.cwd(), 'components/capture/capture-recorder.tsx'), 'utf8')

  it('typed text without audio goes through createTextRecording even when photos are attached', () => {
    // The text branch no longer excludes photos...
    expect(src).toMatch(/if \(descriptionText\.trim\(\) && !audioBlob\) \{/)
    expect(src).not.toMatch(/descriptionText\.trim\(\) && !audioBlob && photos\.length === 0/)
    // ...and still dispatches the auto-generate chain.
    const branch = src.slice(src.indexOf('if (descriptionText.trim() && !audioBlob) {'))
    expect(branch.indexOf('autoGenerateEstimate: true')).toBeGreaterThan(-1)
    expect(branch.indexOf('autoGenerateEstimate: true')).toBeLessThan(branch.indexOf('/api/analyze-photos'))
  })

  it('keeps the photos-only branch (no text, no audio) on /api/analyze-photos', () => {
    expect(src).toMatch(/\} else if \(photos\.length > 0\) \{/)
    expect(src).toContain("fetch('/api/analyze-photos'")
  })
})
