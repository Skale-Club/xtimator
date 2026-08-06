/**
 * Phase 66 — Storage abstraction layer. Phase 188 Plan 01 (PROV-01): stripped
 * to a pure, browser-safe Supabase factory.
 *
 * `createStorage(client)` is the EXPLICIT Supabase factory. Browser code
 * uses it directly (Phase 189 moves those call sites to presigned PUTs).
 * `lib/storage/asset-source.ts` also uses it deliberately, for the PROXY-02
 * Supabase read-through fallback that must never be provider-aware.
 *
 * SERVER CODE MUST USE `@/lib/storage/server` (its `serverStorage(client)`
 * and its default-provider factory), which honors the server-wide provider
 * selection (`serverStorageBackend()`). This file used to also export a
 * default-provider factory that read the legacy provider-select env flag
 * directly — that function only ever got honored by 4 of ~23 server call
 * sites, so flipping the flag silently split writes and reads across two
 * backends (the WhatsApp inbound-media 404 failure mode that motivated
 * Phase 188). That factory now lives in `./server.ts` instead, and this
 * file is intentionally kept free of S3, the service-role client, and any
 * environment-variable read so every `'use client'` component that imports
 * it stays out of the AWS SDK / service-role module graph.
 *
 * A new `createStorage` call site added to a SERVER module going forward is
 * a census failure (Plan 04's static import-graph gate), not a style
 * preference — use `serverStorage(client)` there instead.
 *
 * STORAGE-01: this file defines the StorageProvider interface
 * STORAGE-02: createStorage(client) returns the Supabase implementation
 * STORAGE-04: see ./keys for the {companyId}/{type}/{timestamp}-{filename} convention
 *
 * Usage:
 *   // Server (route handler / server action):
 *   import { serverStorage } from '@/lib/storage/server'
 *   const storage = serverStorage(requireServiceClient())
 *   await storage.upload('pdfs', key, buffer, { contentType: 'application/pdf' })
 *
 *   // Browser (client component):
 *   const supabase = createBrowserClient()
 *   const storage = createStorage(supabase)
 *   await storage.upload('photos', key, file, { contentType: file.type })
 *
 * No singleton is exported — each call site owns the SupabaseClient that
 * matches its auth context (server / browser / service-role).
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
  /**
   * Phase 169-02 (CAPT-04): Supabase's Storage `list()` V1 API DOES expose a
   * true `created_at` on the underlying Postgres-backed objects table — this
   * surfaces it. Optional because a future non-Supabase provider (e.g. S3)
   * may not have a native creation timestamp; callers that need an "age"
   * signal should prefer `updatedAt` and fall back to this field (documented
   * at the call site in lib/inngest/functions/storage-orphan-cleanup.ts).
   */
  createdAt?: string
  /**
   * Phase 169-02 (CAPT-04): Supabase's `list()` returns folder PLACEHOLDER
   * entries (no `id`, no `metadata`) for every intermediate path segment
   * alongside real file entries. `isFolder=true` marks these placeholders —
   * callers walking a bucket recursively MUST skip them rather than treating
   * them as deletable/downloadable objects.
   */
  isFolder?: boolean
}

/**
 * Phase 169-02 (CAPT-04): optional paging for list(). Omitting `opts`
 * preserves the existing single-call behavior (provider/bucket default page
 * size) — purely additive, no existing call site needs to change.
 */
export interface ListOptions {
  limit?: number
  offset?: number
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
  list(bucket: string, prefix?: string, opts?: ListOptions): Promise<ListedObject[]>
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
