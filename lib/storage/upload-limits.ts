/**
 * lib/storage/upload-limits.ts
 *
 * Per-bucket size limits for browser uploads, enforced by POST /api/storage/upload-ticket
 * against the byte size the client DECLARES. Zero imports (safe in the route and in tests).
 *
 * Advisory, not a hard guarantee: a presigned PUT does not bind the body length unless
 * ContentLength is part of the signature, so a client that lies about `size` is not stopped
 * here. It rejects honest oversize uploads early and bounds the cost of Whisper on bad input.
 */
export const MAX_UPLOAD_BYTES = {
  // A multi-hour walkthrough in webm/opus is well under this; 100 MB is a sanity bound.
  audio: 100 * 1024 * 1024,
} as const

export type SizeLimitedBucket = keyof typeof MAX_UPLOAD_BYTES

export function maxUploadBytes(bucket: string): number | null {
  return bucket in MAX_UPLOAD_BYTES ? MAX_UPLOAD_BYTES[bucket as SizeLimitedBucket] : null
}
