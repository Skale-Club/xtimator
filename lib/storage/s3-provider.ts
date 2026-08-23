/**
 * Phase 66 Plan 03 — STORAGE-05: S3-compatible StorageProvider implementation.
 *
 * Works against any S3-compatible backend: AWS S3, MinIO (local dev),
 * Hetzner Object Storage (target — see docs/STORAGE-MIGRATION.md), Cloudflare R2.
 *
 * Activated via env var `STORAGE_PROVIDER=s3` (see lib/storage/index.ts —
 * `getServerStorage()`). Default remains Supabase — this provider ships as a
 * working skeleton, not the runtime default, until the migration trigger
 * fires (800 MB Supabase Storage usage — see docs/STORAGE-MIGRATION.md).
 *
 * Notable behavior diffs vs Supabase provider:
 *   - PutObject is unconditional overwrite — `opts.upsert: false` is
 *     best-effort and not strictly enforced (S3 has no "create-only" flag
 *     without an extra HeadObject round-trip). All current Xtimator
 *     callers either rely on default `upsert: false` semantics for
 *     guaranteed-new keys (timestamped) OR explicitly want overwrite
 *     (logos, branding) — so this is acceptable.
 *
 *   - getSignedUrl REQUIRES a positive `expiresInSeconds` — STORAGE-04
 *     forbids implicit defaults that hide expiry behavior.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner'
import type { StorageProvider, StorageBody } from './index'

export interface S3ProviderConfig {
  /** e.g. https://fsn1.your-objectstorage.com (Hetzner) or http://localhost:9000 (MinIO) */
  endpoint: string
  /** e.g. fsn1 (Hetzner). MinIO accepts any value. */
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** True for MinIO and most non-AWS S3 implementations. Default: true. */
  forcePathStyle?: boolean
  /**
   * Optional override for getPublicUrl base. Falls back to `endpoint`.
   * Useful when serving public assets through a CDN host that differs
   * from the API endpoint.
   */
  publicUrlBase?: string
}

export function createS3StorageProvider(config: S3ProviderConfig): StorageProvider {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
    // A stuck request must fail, never hang. The SDK ships with no request
    // timeout and a 50-socket pool, so one socket that is never released stays
    // checked out for the life of the process; enough of them and every later
    // call queues behind them with nothing to break the wait.
    requestHandler: {
      connectionTimeout: 5_000,
      requestTimeout: 30_000,
      httpsAgent: { maxSockets: 200 },
    },
  })
  const publicBase = (config.publicUrlBase ?? config.endpoint).replace(/\/$/, '')

  return {
    async upload(bucket, path, body, opts) {
      const Body = await normalizeBody(body)
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body,
          ContentType: opts?.contentType,
          // Note: S3 PutObject is upsert-by-default. We do NOT enforce
          // opts.upsert === false at the wire level — see file header
          // for rationale. Documented behavioral diff vs Supabase provider.
        }),
      )
      return { path }
    },

    async download(bucket, path) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: path }),
      )
      if (!res.Body) {
        throw new Error(`S3 download empty (${bucket}/${path})`)
      }
      // S3 SDK Body in Node is a stream with a transformToByteArray helper;
      // in the browser the same shape is exposed via the SDK runtime.
      const bytes = await (
        res.Body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray()
      return new Blob([bytes as BlobPart])
    },

    async getSignedUrl(bucket, path, expiresInSeconds) {
      // STORAGE-04: explicit expiry — no implicit default that could hide
      // a long-lived URL leak via a forgotten third arg.
      if (
        typeof expiresInSeconds !== 'number' ||
        !Number.isFinite(expiresInSeconds) ||
        expiresInSeconds <= 0
      ) {
        throw new Error(
          'getSignedUrl: expiresInSeconds must be a positive integer (STORAGE-04)',
        )
      }
      return presign(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: path }),
        { expiresIn: expiresInSeconds },
      )
    },

    getPublicUrl(bucket, path) {
      // Path-style URL: works for MinIO + Hetzner. AWS S3 also accepts
      // path-style (deprecated for new buckets but still supported).
      return `${publicBase}/${bucket}/${path}`
    },

    async delete(bucket, path) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: path }),
      )
    },

    async list(bucket, prefix) {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
      )
      return (res.Contents ?? []).map((obj) => ({
        name: obj.Key ?? '',
        size: obj.Size,
        updatedAt: obj.LastModified?.toISOString(),
      }))
    },
  }
}

async function normalizeBody(body: StorageBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body
  if (typeof Buffer !== 'undefined' && body instanceof Buffer) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  }
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  // Blob or File — both expose arrayBuffer().
  const ab = await (body as Blob).arrayBuffer()
  return new Uint8Array(ab)
}
