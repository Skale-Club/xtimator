/**
 * Phase 66 — Storage abstraction layer.
 *
 * Every storage call site in the app must funnel through the StorageProvider
 * defined here — never `supabase.storage.from(...)` directly. This makes the
 * future Hetzner Object Storage / S3 swap a 1-line change in createStorage().
 *
 * STORAGE-01: this file defines the StorageProvider interface
 * STORAGE-02: createStorage(client) returns the Supabase implementation
 * STORAGE-04: see ./keys for the {companyId}/{type}/{timestamp}-{filename} convention
 *
 * Usage:
 *   // Server (route handler / server action):
 *   const supabase = requireServiceClient()
 *   const storage = createStorage(supabase)
 *   await storage.upload('pdfs', key, buffer, { contentType: 'application/pdf' })
 *
 *   // Browser (client component):
 *   const supabase = createBrowserClient()
 *   const storage = createStorage(supabase)
 *   await storage.upload('photos', key, file, { contentType: file.type })
 *
 * No singleton is exported — each call site owns the SupabaseClient that
 * matches its auth context (server / browser / service-role). Plan 02 will
 * migrate every existing direct call site to this factory.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Body types accepted by upload — superset of what Supabase accepts directly. */
export type StorageBody = Buffer | Blob | ArrayBuffer | Uint8Array | File

export interface UploadOptions {
  contentType?: string
  upsert?: boolean
}

export interface ListedObject {
  name: string
  size?: number
  updatedAt?: string
}

/**
 * STORAGE-01: the only storage interface the app speaks.
 *
 * Implementations:
 *   - SupabaseStorageProvider (createSupabaseStorageProvider) — current default
 *   - future: HetznerObjectStorageProvider, S3StorageProvider, etc.
 */
export interface StorageProvider {
  upload(bucket: string, path: string, body: StorageBody, opts?: UploadOptions): Promise<{ path: string }>
  download(bucket: string, path: string): Promise<Blob>
  /**
   * STORAGE-04: explicit `expiresInSeconds` is REQUIRED — there is no
   * implicit default that hides expiry behavior. Pass 86400 for 24h, etc.
   */
  getSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>
  /**
   * Synchronous (Supabase semantics) — only valid for public buckets
   * (e.g. logos, platform branding). Returns the canonical public URL.
   */
  getPublicUrl(bucket: string, path: string): string
  delete(bucket: string, path: string): Promise<void>
  list(bucket: string, prefix?: string): Promise<ListedObject[]>
}

// Re-exports for convenient single-import surface.
export { buildStorageKey } from './keys'
export type { BuildStorageKeyArgs } from './keys'

// Provider factory — wires the Supabase implementation lazily so this module
// stays import-safe from both server and browser code (no `import 'server-only'`).
import { createSupabaseStorageProvider } from './supabase-provider'

/**
 * STORAGE-02: wrap any SupabaseClient (server, browser, or service-role)
 * as a StorageProvider. Caller is responsible for passing the right client
 * for their auth context.
 *
 * Migration in Plan 02 will replace every `supabase.storage.from(...)`
 * call site with `createStorage(supabase).{method}(...)`.
 */
export function createStorage(client: SupabaseClient): StorageProvider {
  return createSupabaseStorageProvider(client)
}
