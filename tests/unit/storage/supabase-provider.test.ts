/**
 * Phase 66 Plan 01 — STORAGE-02: Unit tests for createSupabaseStorageProvider.
 *
 * Verifies the adapter delegates correctly to client.storage.from(bucket).{op}
 * for every method in the StorageProvider interface, and surfaces Supabase
 * errors as thrown Errors so callers can use try/catch.
 *
 * Mocking pattern follows tests/unit/whatsapp/pdf-delivery.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseStorageProvider } from '@/lib/storage/supabase-provider'

type StorageOps = {
  upload: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  createSignedUrl: ReturnType<typeof vi.fn>
  getPublicUrl: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
}

function makeClient(opsOverrides: Partial<StorageOps> = {}): {
  client: SupabaseClient
  ops: StorageOps
  fromMock: ReturnType<typeof vi.fn>
} {
  const ops: StorageOps = {
    upload: vi.fn().mockResolvedValue({ data: { path: 'returned/path' }, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(['x']), error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://supabase.co/sign/abc' },
      error: null,
    }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://supabase.co/public/x' } }),
    remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    list: vi.fn().mockResolvedValue({
      data: [
        { name: 'a.jpg', metadata: { size: 100 }, updated_at: '2026-01-01T00:00:00Z' },
        { name: 'b.jpg' },
      ],
      error: null,
    }),
    ...opsOverrides,
  }
  const fromMock = vi.fn().mockReturnValue(ops)
  const client = { storage: { from: fromMock } } as unknown as SupabaseClient
  return { client, ops, fromMock }
}

describe('createSupabaseStorageProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('upload', () => {
    it('delegates to client.storage.from(bucket).upload(path, body, { contentType, upsert })', async () => {
      const { client, ops, fromMock } = makeClient()
      const provider = createSupabaseStorageProvider(client)
      const body = Buffer.from('hello')

      const result = await provider.upload('photos', 'co/photos/1-a.jpg', body, {
        contentType: 'image/jpeg',
        upsert: true,
      })

      expect(fromMock).toHaveBeenCalledWith('photos')
      expect(ops.upload).toHaveBeenCalledWith('co/photos/1-a.jpg', body, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      expect(result).toEqual({ path: 'returned/path' })
    })

    it('defaults upsert to false when not provided', async () => {
      const { client, ops } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      await provider.upload('photos', 'p', Buffer.from('x'))

      expect(ops.upload).toHaveBeenCalledWith('p', expect.anything(), {
        contentType: undefined,
        upsert: false,
      })
    })

    it('falls back to the requested path when Supabase returns no data.path', async () => {
      const { client } = makeClient({
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      const provider = createSupabaseStorageProvider(client)

      const result = await provider.upload('photos', 'requested/path.jpg', Buffer.from('x'))

      expect(result).toEqual({ path: 'requested/path.jpg' })
    })

    it('throws Error including the Supabase error message on failure', async () => {
      const { client } = makeClient({
        upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'Bucket full' } }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(
        provider.upload('photos', 'p', Buffer.from('x')),
      ).rejects.toThrow(/Bucket full/)
    })
  })

  describe('download', () => {
    it('returns the Blob from client.storage.from(bucket).download(path)', async () => {
      const blob = new Blob(['hello'])
      const { client, ops, fromMock } = makeClient({
        download: vi.fn().mockResolvedValue({ data: blob, error: null }),
      })
      const provider = createSupabaseStorageProvider(client)

      const result = await provider.download('audio', 'co/audio/1-r.webm')

      expect(fromMock).toHaveBeenCalledWith('audio')
      expect(ops.download).toHaveBeenCalledWith('co/audio/1-r.webm')
      expect(result).toBe(blob)
    })

    it('throws when Supabase returns an error', async () => {
      const { client } = makeClient({
        download: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.download('audio', 'missing')).rejects.toThrow(/Not found/)
    })
  })

  describe('getSignedUrl', () => {
    it('returns the signedUrl from client.storage.from(bucket).createSignedUrl(path, expiresInSeconds)', async () => {
      const { client, ops, fromMock } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      const url = await provider.getSignedUrl('pdfs', 'co/whatsapp-pdf/1.pdf', 86400)

      expect(fromMock).toHaveBeenCalledWith('pdfs')
      expect(ops.createSignedUrl).toHaveBeenCalledWith('co/whatsapp-pdf/1.pdf', 86400)
      expect(url).toBe('https://supabase.co/sign/abc')
    })

    it('throws when Supabase returns no signedUrl', async () => {
      const { client } = makeClient({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.getSignedUrl('pdfs', 'p', 60)).rejects.toThrow(/no signedUrl/)
    })

    it('throws when Supabase returns an error', async () => {
      const { client } = makeClient({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'oops' } }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.getSignedUrl('pdfs', 'p', 60)).rejects.toThrow(/oops/)
    })
  })

  describe('getPublicUrl', () => {
    it('returns the publicUrl synchronously from client.storage.from(bucket).getPublicUrl(path)', () => {
      const { client, ops, fromMock } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      const url = provider.getPublicUrl('logos', 'co/logo/1-logo.png')

      expect(fromMock).toHaveBeenCalledWith('logos')
      expect(ops.getPublicUrl).toHaveBeenCalledWith('co/logo/1-logo.png')
      expect(url).toBe('https://supabase.co/public/x')
    })
  })

  describe('delete', () => {
    it('wraps the single path in an array and calls client.storage.from(bucket).remove([path])', async () => {
      const { client, ops, fromMock } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      await provider.delete('photos', 'co/photos/1-a.jpg')

      expect(fromMock).toHaveBeenCalledWith('photos')
      expect(ops.remove).toHaveBeenCalledWith(['co/photos/1-a.jpg'])
    })

    it('throws when Supabase returns an error', async () => {
      const { client } = makeClient({
        remove: vi.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.delete('photos', 'p')).rejects.toThrow(/forbidden/)
    })
  })

  describe('list', () => {
    it('calls client.storage.from(bucket).list(prefix) and maps results to ListedObject[]', async () => {
      const { client, ops, fromMock } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      const items = await provider.list('photos', 'co/photos/')

      expect(fromMock).toHaveBeenCalledWith('photos')
      expect(ops.list).toHaveBeenCalledWith('co/photos/')
      expect(items).toEqual([
        { name: 'a.jpg', size: 100, updatedAt: '2026-01-01T00:00:00Z' },
        { name: 'b.jpg', size: undefined, updatedAt: undefined },
      ])
    })

    it('passes undefined prefix through when omitted', async () => {
      const { client, ops } = makeClient()
      const provider = createSupabaseStorageProvider(client)

      await provider.list('photos')

      expect(ops.list).toHaveBeenCalledWith(undefined)
    })

    it('returns empty array when Supabase returns null data', async () => {
      const { client } = makeClient({
        list: vi.fn().mockResolvedValue({ data: null, error: null }),
      })
      const provider = createSupabaseStorageProvider(client)

      const items = await provider.list('photos')

      expect(items).toEqual([])
    })

    it('throws when Supabase returns an error', async () => {
      const { client } = makeClient({
        list: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
      })
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.list('photos')).rejects.toThrow(/denied/)
    })
  })
})
