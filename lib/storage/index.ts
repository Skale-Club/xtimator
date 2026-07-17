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

/**
 * STORAGE-05/07: server-side default storage provider.
 *
 * Reads `process.env.STORAGE_PROVIDER`:
 *   - 'supabase' (default, omitted, or any other value): wraps the
 *     service-role Supabase client.
 *   - 's3': uses createS3StorageProvider() with S3_* env vars
 *     (see .env.local.example for the full set; see
 *     docs/STORAGE-MIGRATION.md for the runbook).
 *
 * Use this in server-only contexts where the Supabase client isn't
 * already in hand — e.g. health check, smoke script, future Inngest
 * workers (Phase 67), `/api/health` storage probe (Phase 68).
 *
 * Browser code MUST continue using `createStorage(supabaseBrowserClient)` —
 * the env-var path is server-only because S3 credentials must never reach
 * the browser.
 */
export function getServerStorage(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'supabase'
  if (provider === 's3') {
    // Lazy require so the AWS SDK isn't loaded unless actually needed.
    // Keeps the cold-start cost off the Supabase default path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createS3StorageProvider } =
      require('./s3-provider') as typeof import('./s3-provider')
    return createS3StorageProvider({
      endpoint: requireEnv('S3_ENDPOINT'),
      region: requireEnv('S3_REGION'),
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      publicUrlBase: process.env.S3_PUBLIC_URL_BASE,
    })
  }
  // Default: Supabase via service-role client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireServiceClient } =
    require('@/lib/supabase/service') as typeof import('@/lib/supabase/service')
  return createStorage(requireServiceClient())
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(
      `getServerStorage: missing required env var ${name} (STORAGE_PROVIDER=s3)`,
    )
  }
  return v
}
