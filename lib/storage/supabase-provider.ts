/**
 * Phase 66 Plan 01 — STORAGE-02: Supabase Storage implementation of
 * StorageProvider.
 *
 * Thin adapter — every method delegates to `client.storage.from(bucket)`.
 * Behavior is byte-identical to the previous direct supabase.storage calls
 * scattered across:
 *   - lib/whatsapp/pdf-delivery.ts
 *   - lib/actions/settings.ts
 *   - lib/whatsapp/handler.ts
 *   - app/admin/branding/actions.ts
 *   - app/api/estimates/[id]/refine/voice/route.ts
 *   - components/capture/capture-recorder.tsx
 *   - components/clients/client-sheet.tsx
 *   - app/admin/branding/page.tsx
 *
 * Plan 02 migrates each of those call sites to createStorage(...).
 *
 * Pass any SupabaseClient (server, browser, or service-role). The caller is
 * responsible for matching the client to the auth context — this adapter
 * does not opinionate.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from './index'

export function createSupabaseStorageProvider(client: SupabaseClient): StorageProvider {
  return {
    async upload(bucket, path, body, opts) {
      const { data, error } = await client.storage
        .from(bucket)
        // Supabase's upload type is broader than ours; cast through unknown to
        // accept all StorageBody members (Buffer, Blob, ArrayBuffer, Uint8Array, File).
        .upload(path, body as unknown as Blob, {
          contentType: opts?.contentType,
          upsert: opts?.upsert ?? false,
        })
      if (error) {
        // Phase 169-01 (CAPT-01 prerequisite): preserve the storage error's
        // .status/.statusCode (StorageError from @supabase/storage-js) on the
        // thrown Error — the old plain `new Error(msg)` discarded them,
        // leaving upload-with-retry.ts unable to classify retryable
        // (network/5xx) vs terminal (4xx) failures. Message/throw contract
        // is unchanged — this only adds properties to the same Error shape.
        throw Object.assign(new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`), {
          status: (error as { status?: number }).status,
          statusCode: (error as { statusCode?: string }).statusCode,
          cause: error,
        })
      }
      return { path: data?.path ?? path }
    },

    async download(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path)
      if (error || !data) {
        throw new Error(
          `Storage download failed (${bucket}/${path}): ${error?.message ?? 'no data'}`,
        )
      }
      return data
    },

    async getSignedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds)
      if (error || !data?.signedUrl) {
        throw new Error(
          `Storage getSignedUrl failed (${bucket}/${path}): ${error?.message ?? 'no signedUrl'}`,
        )
      }
      return data.signedUrl
    },

    getPublicUrl(bucket, path) {
      const { data } = client.storage.from(bucket).getPublicUrl(path)
      return data.publicUrl
    },

    async delete(bucket, path) {
      const { error } = await client.storage.from(bucket).remove([path])
      if (error) {
        throw new Error(`Storage delete failed (${bucket}/${path}): ${error.message}`)
      }
    },

    async list(bucket, prefix) {
      const { data, error } = await client.storage.from(bucket).list(prefix)
      if (error) {
        throw new Error(`Storage list failed (${bucket}/${prefix ?? ''}): ${error.message}`)
      }
      return (data ?? []).map((entry) => ({
        name: entry.name,
        size: (entry as { metadata?: { size?: number } }).metadata?.size,
        updatedAt: (entry as { updated_at?: string }).updated_at,
      }))
    },
  }
}
