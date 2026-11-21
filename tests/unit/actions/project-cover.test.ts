// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPANY_ID,
  PHOTO_ID,
  PROJECT_ID,
  makeStorage,
  makeSupabase,
  type Call,
} from '../projects/cover-test-kit'

const h = vi.hoisted(() => ({
  supabase: null as unknown as ReturnType<typeof import('../projects/cover-test-kit').makeSupabase>,
  storage: null as unknown as ReturnType<typeof import('../projects/cover-test-kit').makeStorage>,
  demoDenied: null as null | { error: string },
  billingDenied: null as null | { error: string },
  revalidated: [] as string[],
  sharp: { resize: [] as unknown[][], input: [] as unknown[] },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.supabase.client }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => COMPANY_ID }))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: async () => h.billingDenied }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: async () => h.demoDenied, isDemoSession: async () => false }))
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => h.revalidated.push(path) }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/storage/server', () => ({ serverStorage: () => h.storage.provider }))
vi.mock('sharp', () => ({
  default: (input: unknown) => {
    h.sharp.input.push(input)
    const chain = {
      rotate: () => chain,
      resize: (...args: unknown[]) => {
        h.sharp.resize.push(args)
        return chain
      },
      webp: () => chain,
      toBuffer: async () => Buffer.from('thumb-bytes'),
    }
    return chain
  },
}))

import {
  listProjectCoverPhotos,
  removeProjectCover,
  resetProjectCover,
  setProjectCoverFromPhoto,
  uploadProjectCover,
} from '@/lib/actions/project-cover'

const OLD_KEY = `${COMPANY_ID}/${PROJECT_ID}/cover-old.webp`
const PHOTO_PATH = `${COMPANY_ID}/${PROJECT_ID}/${PHOTO_ID}.webp`
const COVER_KEY_RE = new RegExp(`^${COMPANY_ID}/${PROJECT_ID}/cover-[0-9a-f-]{36}\\.webp$`)

interface World {
  project: Record<string, unknown> | null
  photo: Record<string, unknown> | null
  photoList: Record<string, unknown>[]
  updateRows: unknown[]
}

function setup(overrides: Partial<World> = {}) {
  const world: World = {
    project: {
      id: PROJECT_ID,
      cover_mode: 'auto',
      cover_thumb_path: OLD_KEY,
      cover_photo_id: null,
    },
    photo: { id: PHOTO_ID, storage_path: PHOTO_PATH },
    photoList: [{ id: PHOTO_ID, storage_path: PHOTO_PATH }],
    updateRows: [{ id: PROJECT_ID }],
    ...overrides,
  }
  h.supabase = makeSupabase((call: Call) => {
    if (call.table === 'projects' && call.op === 'select') {
      // Ownership: only the signed-in company's project resolves.
      const owned = call.filters.company_id === COMPANY_ID && call.filters.id === PROJECT_ID
      return { data: owned ? world.project : null }
    }
    if (call.table === 'projects' && call.op === 'update') return { data: world.updateRows }
    if (call.table === 'photos' && call.filters.id) {
      const ok =
        call.filters.company_id === COMPANY_ID && call.filters.project_id === PROJECT_ID
      return { data: ok ? world.photo : null }
    }
    if (call.table === 'photos') return { data: world.photoList }
    return { data: null }
  })
  h.storage = makeStorage({
    [OLD_KEY]: new Uint8Array([1]),
    [PHOTO_PATH]: new Uint8Array([9, 9, 9]),
  })
  return world
}

function formWith(file: File | null) {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return fd
}

function updateCalls() {
  return h.supabase.calls.filter((c) => c.table === 'projects' && c.op === 'update')
}

beforeEach(() => {
  h.demoDenied = null
  h.billingDenied = null
  h.revalidated = []
  h.sharp.resize = []
  h.sharp.input = []
})

describe('setProjectCoverFromPhoto', () => {
  it('stores a 160px thumb, switches to photo mode and removes the old thumb after the update', async () => {
    setup()
    const result = await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)

    expect(result).toEqual({ data: { cover_mode: 'photo' } })
    expect(h.sharp.resize[0]).toEqual([160, 160, { fit: 'cover', position: 'centre' }])
    const [update] = updateCalls()
    expect(update.patch).toMatchObject({ cover_mode: 'photo', cover_photo_id: PHOTO_ID })
    expect(update.patch?.cover_thumb_path).toMatch(COVER_KEY_RE)
    expect(update.filters).toMatchObject({ id: PROJECT_ID, company_id: COMPANY_ID })
    // New object written first, previous one removed only afterwards.
    expect(h.storage.log).toEqual([`upload:${update.patch?.cover_thumb_path}`, `delete:${OLD_KEY}`])
    expect(h.revalidated).toEqual(['/projects', '/dashboard'])
  })

  it('refuses a project of another company without touching storage', async () => {
    setup({ project: null })
    const result = await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)
    expect(result).toEqual({ error: 'Project not found.' })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
    expect(updateCalls()).toHaveLength(0)
  })

  it('refuses a photo that is not in the project', async () => {
    setup({ photo: null })
    const result = await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)
    expect(result).toEqual({ error: 'Photo not found.' })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
    expect(updateCalls()).toHaveLength(0)
  })

  it('removes the new object and keeps the old one when the row was not updated', async () => {
    setup({ updateRows: [] })
    const result = await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)
    expect(result).toEqual({ error: 'Failed to update the thumbnail.' })
    const newKey = updateCalls()[0].patch?.cover_thumb_path as string
    expect(h.storage.objects.has(newKey)).toBe(false)
    expect(h.storage.objects.has(OLD_KEY)).toBe(true)
  })

  it('is denied in the demo and while paywalled, before any write', async () => {
    setup()
    h.demoDenied = { error: 'demo' }
    expect(await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)).toEqual({ error: 'demo' })
    h.demoDenied = null
    h.billingDenied = { error: 'paywalled' }
    expect(await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)).toEqual({ error: 'paywalled' })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
    expect(h.supabase.calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('never deletes a previous key that is not one of its own thumbs', async () => {
    // A corrupted/legacy value pointing at a real job photo must survive.
    setup({
      project: { id: PROJECT_ID, cover_mode: 'photo', cover_thumb_path: PHOTO_PATH, cover_photo_id: null },
    })
    await setProjectCoverFromPhoto(PROJECT_ID, PHOTO_ID)
    expect(h.storage.provider.delete).not.toHaveBeenCalled()
    expect(h.storage.objects.has(PHOTO_PATH)).toBe(true)
  })
})

describe('uploadProjectCover', () => {
  const png = () => new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })

  it('stores only the thumb in upload mode and never creates a photos row', async () => {
    setup()
    const result = await uploadProjectCover(PROJECT_ID, formWith(png()))

    expect(result).toEqual({ data: { cover_mode: 'upload' } })
    expect(updateCalls()[0].patch).toMatchObject({ cover_mode: 'upload', cover_photo_id: null })
    // The AI reads project photos: the uploaded image must not be one of them.
    expect(h.supabase.calls.filter((c) => c.table === 'photos')).toHaveLength(0)
    expect(h.storage.provider.upload).toHaveBeenCalledTimes(1)
    const [bucket, key] = h.storage.provider.upload.mock.calls[0]
    expect(bucket).toBe('photos')
    expect(key).toMatch(COVER_KEY_RE)
    expect(h.storage.objects.has(OLD_KEY)).toBe(false)
    expect(h.revalidated).toEqual(['/projects', '/dashboard'])
  })

  it('rejects other types, empty and oversized files', async () => {
    setup()
    expect(await uploadProjectCover(PROJECT_ID, formWith(null))).toEqual({ error: 'No file provided.' })
    const gif = new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' })
    expect(await uploadProjectCover(PROJECT_ID, formWith(gif))).toEqual({
      error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.',
    })
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(await uploadProjectCover(PROJECT_ID, formWith(big))).toEqual({
      error: 'This image is too large. Choose a smaller one.',
    })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
  })

  it('refuses a project of another company', async () => {
    setup({ project: null })
    expect(await uploadProjectCover(PROJECT_ID, formWith(png()))).toEqual({ error: 'Project not found.' })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
  })

  it('is denied in the demo before reading the file', async () => {
    setup()
    h.demoDenied = { error: 'demo' }
    expect(await uploadProjectCover(PROJECT_ID, formWith(png()))).toEqual({ error: 'demo' })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
  })
})

describe('removeProjectCover', () => {
  it('goes to none, clears the thumb and removes the object', async () => {
    setup()
    expect(await removeProjectCover(PROJECT_ID)).toEqual({ data: { cover_mode: 'none' } })
    expect(updateCalls()[0].patch).toEqual({
      cover_mode: 'none',
      cover_photo_id: null,
      cover_thumb_path: null,
    })
    expect(h.storage.log).toEqual([`delete:${OLD_KEY}`])
    expect(h.revalidated).toEqual(['/projects', '/dashboard'])
  })
})

describe('resetProjectCover', () => {
  it('goes back to auto with a thumb of the first photo', async () => {
    setup({ project: { id: PROJECT_ID, cover_mode: 'upload', cover_thumb_path: OLD_KEY, cover_photo_id: null } })
    expect(await resetProjectCover(PROJECT_ID)).toEqual({ data: { cover_mode: 'auto' } })
    const patch = updateCalls()[0].patch
    expect(patch).toMatchObject({ cover_mode: 'auto', cover_photo_id: PHOTO_ID })
    expect(patch?.cover_thumb_path).toMatch(COVER_KEY_RE)
    expect(h.storage.provider.download).toHaveBeenCalledWith('photos', PHOTO_PATH)
    expect(h.storage.objects.has(OLD_KEY)).toBe(false)
  })

  it('goes to auto with no thumb when the project has no photo', async () => {
    setup({ photoList: [] })
    await resetProjectCover(PROJECT_ID)
    expect(updateCalls()[0].patch).toEqual({
      cover_mode: 'auto',
      cover_photo_id: null,
      cover_thumb_path: null,
    })
    expect(h.storage.provider.upload).not.toHaveBeenCalled()
  })
})

describe('listProjectCoverPhotos', () => {
  it('returns proxy URLs and the current choice, and writes nothing', async () => {
    setup({ project: { id: PROJECT_ID, cover_mode: 'photo', cover_thumb_path: OLD_KEY, cover_photo_id: PHOTO_ID } })
    const result = await listProjectCoverPhotos(PROJECT_ID)
    expect(result).toEqual({
      data: {
        mode: 'photo',
        coverPhotoId: PHOTO_ID,
        photos: [{ id: PHOTO_ID, url: `/storage/photos/${PHOTO_PATH}` }],
      },
    })
    expect(h.supabase.calls.every((c) => c.op === 'select')).toBe(true)
  })

  it('refuses a project of another company', async () => {
    setup({ project: null })
    expect(await listProjectCoverPhotos(PROJECT_ID)).toEqual({ error: 'Project not found.' })
  })
})
