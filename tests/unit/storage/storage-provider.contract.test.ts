/**
 * Phase 66 Plan 01 — Wave 0 contract tests for StorageProvider (STORAGE-01).
 *
 * These tests describe the SHAPE of the abstraction every storage call site
 * must funnel through. They lock the interface BEFORE Plan 02 migrates any
 * caller, so the future Hetzner Object Storage swap is a 1-line change in
 * the provider factory.
 *
 * Nyquist gate: this file MUST fail to compile/run until lib/storage/index.ts
 * exports the StorageProvider interface and the createStorage(client) factory.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// These imports do NOT exist yet — RED state is intentional.
import {
  createStorage,
  buildStorageKey,
  type StorageProvider,
  type StorageBody,
  type UploadOptions,
  type ListedObject,
} from '@/lib/storage'

// In-memory provider used ONLY inside this test file to verify the interface
// shape compiles. Do NOT export from lib/. Each method exists to prove that
// the StorageProvider type accepts the documented signatures.
const memoryProvider: StorageProvider = {
  async upload(_bucket: string, path: string, _body: StorageBody, _opts?: UploadOptions) {
    return { path }
  },
  async download(_bucket: string, _path: string): Promise<Blob> {
    return new Blob(['memory'])
  },
  async getSignedUrl(_bucket: string, _path: string, _expiresInSeconds: number): Promise<string> {
    return 'https://example.com/signed'
  },
  getPublicUrl(_bucket: string, path: string): string {
    return `https://example.com/public/${path}`
  },
  async delete(_bucket: string, _path: string): Promise<void> {
    /* noop */
  },
  async list(_bucket: string, _prefix?: string): Promise<ListedObject[]> {
    return []
  },
}

describe('StorageProvider interface contract (STORAGE-01)', () => {
  it('exposes upload(bucket, path, body, opts?) returning Promise<{ path }>', async () => {
    const result = await memoryProvider.upload('bucket', 'path/to/file', Buffer.from('x'), {
      contentType: 'text/plain',
      upsert: true,
    })
    expect(result).toEqual({ path: 'path/to/file' })
  })

  it('exposes download(bucket, path) returning Promise<Blob>', async () => {
    const blob = await memoryProvider.download('bucket', 'path/to/file')
    expect(blob).toBeInstanceOf(Blob)
  })

  it('exposes getSignedUrl(bucket, path, expiresInSeconds) where the third arg is REQUIRED', async () => {
    // The following line would be a TypeScript error because expiresInSeconds is required:
    // memoryProvider.getSignedUrl('bucket', 'path')   // <-- compile error, intentional
    const url = await memoryProvider.getSignedUrl('bucket', 'path/to/file', 3600)
    expect(typeof url).toBe('string')
    expect(url).toMatch(/^https?:\/\//)
  })

  it('exposes getPublicUrl(bucket, path) returning a string SYNCHRONOUSLY (Supabase semantics)', () => {
    const url = memoryProvider.getPublicUrl('bucket', 'logo.png')
    expect(typeof url).toBe('string')
    expect(url).toContain('logo.png')
  })

  it('exposes delete(bucket, path) accepting a single path and returning Promise<void>', async () => {
    const result = await memoryProvider.delete('bucket', 'path/to/file')
    expect(result).toBeUndefined()
  })

  it('exposes list(bucket, prefix?) returning Promise<ListedObject[]>', async () => {
    const items = await memoryProvider.list('bucket', 'companyA/photos/')
    expect(Array.isArray(items)).toBe(true)
  })

  it('is constructible via createStorage(supabaseClient) factory', () => {
    // Minimal SupabaseClient stub — createStorage must not invoke storage at construction time.
    const fakeClient = { storage: { from: vi.fn() } } as unknown as SupabaseClient
    const provider = createStorage(fakeClient)
    expect(typeof provider.upload).toBe('function')
    expect(typeof provider.download).toBe('function')
    expect(typeof provider.getSignedUrl).toBe('function')
    expect(typeof provider.getPublicUrl).toBe('function')
    expect(typeof provider.delete).toBe('function')
    expect(typeof provider.list).toBe('function')
  })

  it('re-exports buildStorageKey from @/lib/storage', () => {
    expect(typeof buildStorageKey).toBe('function')
  })
})
