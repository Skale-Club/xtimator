// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPANY_ID, PHOTO_ID, PROJECT_ID, makeStorage, makeSupabase, type Call } from './cover-test-kit'

const h = vi.hoisted(() => ({
  supabase: null as unknown as ReturnType<typeof import('./cover-test-kit').makeSupabase>,
  storage: null as unknown as ReturnType<typeof import('./cover-test-kit').makeStorage>,
  demo: false,
  serviceThrows: false,
  afterCallbacks: [] as Array<() => unknown>,
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => {
    if (h.serviceThrows) throw new Error('no service key')
    return h.supabase.client
  },
}))
vi.mock('@/lib/storage/server', () => ({ serverStorage: () => h.storage.provider }))
vi.mock('@/lib/demo/guard', () => ({ isDemoSession: async () => h.demo }))
vi.mock('next/server', () => ({ after: (cb: () => unknown) => h.afterCallbacks.push(cb) }))
vi.mock('sharp', () => ({
  default: () => {
    const chain = {
      rotate: () => chain,
      resize: () => chain,
      webp: () => chain,
      toBuffer: async () => Buffer.from('thumb-bytes'),
    }
    return chain
  },
}))

import { fillMissingCovers, scheduleCoverBackfill } from '@/lib/projects/cover'

const PATH = `${COMPANY_ID}/${PROJECT_ID}/${PHOTO_ID}.webp`

function setup(opts: { photos?: Record<string, string | null>; updateRows?: unknown[] } = {}) {
  const photos = opts.photos ?? { [PROJECT_ID]: PATH }
  h.supabase = makeSupabase((call: Call) => {
    if (call.table === 'photos') {
      const path = photos[call.filters.project_id as string]
      return { data: path ? [{ storage_path: path }] : [] }
    }
    if (call.table === 'projects' && call.op === 'update') return { data: opts.updateRows ?? [{ id: PROJECT_ID }] }
    return { data: null }
  })
  h.storage = makeStorage({ [PATH]: new Uint8Array([1, 2, 3]) })
}

beforeEach(() => {
  h.demo = false
  h.serviceThrows = false
  h.afterCallbacks = []
})

describe('fillMissingCovers', () => {
  it('writes the thumb with a conditional update (still auto, still empty, same company)', async () => {
    setup()
    await fillMissingCovers(COMPANY_ID, [PROJECT_ID])

    const update = h.supabase.calls.find((c) => c.op === 'update')!
    expect(update.filters).toEqual({
      id: PROJECT_ID,
      company_id: COMPANY_ID,
      cover_mode: 'auto',
      'cover_thumb_path:is': null,
    })
    expect(update.patch?.cover_thumb_path).toMatch(new RegExp(`^${COMPANY_ID}/${PROJECT_ID}/cover-.+\\.webp$`))
    // Photos are read scoped by company.
    expect(h.supabase.calls.find((c) => c.table === 'photos')!.filters).toMatchObject({ company_id: COMPANY_ID })
    expect(h.storage.provider.delete).not.toHaveBeenCalled()
  })

  it('removes the uploaded object when the owner changed the cover meanwhile (no row updated)', async () => {
    setup({ updateRows: [] })
    await fillMissingCovers(COMPANY_ID, [PROJECT_ID])
    const key = h.supabase.calls.find((c) => c.op === 'update')!.patch?.cover_thumb_path as string
    expect(h.storage.provider.delete).toHaveBeenCalledWith('photos', key)
    expect(h.storage.objects.has(key)).toBe(false)
  })

  it('skips a project that has no photo', async () => {
    setup({ photos: {} })
    await fillMissingCovers(COMPANY_ID, [PROJECT_ID])
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
    expect(h.supabase.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('generates at most 10 thumbs per run, skipping photo-less projects without counting them', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`)
    const photos: Record<string, string | null> = {}
    ids.forEach((id, i) => {
      photos[id] = i < 5 ? null : PATH // the first five have no photo
    })
    setup({ photos })
    await fillMissingCovers(COMPANY_ID, ids)
    expect(h.storage.provider.upload).toHaveBeenCalledTimes(10)
  })

  it('never throws: not even when the service client is unavailable', async () => {
    setup()
    h.serviceThrows = true
    await expect(fillMissingCovers(COMPANY_ID, [PROJECT_ID])).resolves.toBeUndefined()
  })

  it('keeps going when one project fails', async () => {
    setup({ photos: { bad: 'missing/object.webp', [PROJECT_ID]: PATH } })
    await expect(fillMissingCovers(COMPANY_ID, ['bad', PROJECT_ID])).resolves.toBeUndefined()
    expect(h.supabase.calls.filter((c) => c.op === 'update')).toHaveLength(1)
  })
})

describe('scheduleCoverBackfill', () => {
  const rows = [
    { id: 'a', cover_mode: 'auto', cover_thumb_path: null },
    { id: 'b', cover_mode: 'auto', cover_thumb_path: 'k/b.webp' },
    { id: 'c', cover_mode: 'none', cover_thumb_path: null },
    { id: 'd', cover_mode: 'upload', cover_thumb_path: null },
    { id: 'e', cover_mode: 'auto', cover_thumb_path: null },
  ]

  it('schedules only automatic projects that have no thumb yet', async () => {
    setup()
    await scheduleCoverBackfill(COMPANY_ID, rows)
    expect(h.afterCallbacks).toHaveLength(1)
    h.supabase = makeSupabase(() => ({ data: [] }))
    await h.afterCallbacks[0]()
    // Only a and e were looked at.
    const looked = h.supabase.calls.filter((c) => c.table === 'photos').map((c) => c.filters.project_id)
    expect(looked).toEqual(['a', 'e'])
  })

  it('does nothing in a demo session', async () => {
    h.demo = true
    await scheduleCoverBackfill(COMPANY_ID, rows)
    expect(h.afterCallbacks).toHaveLength(0)
  })

  it('does nothing when every project already has its thumb or opted out', async () => {
    await scheduleCoverBackfill(COMPANY_ID, [rows[1], rows[2], rows[3]])
    expect(h.afterCallbacks).toHaveLength(0)
  })
})
