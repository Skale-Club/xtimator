import 'server-only'

/**
 * Phase 189 Plan 01 — UPLOAD-02/UPLOAD-03: server-derived, tenant-confined
 * upload tickets for the browser's direct-to-storage audio uploads.
 *
 * WHY THIS MODULE EXISTS:
 * Today three client components (capture-recorder.tsx,
 * inline-audio-recorder.tsx, use-ai-input-submit.ts) each compute their own
 * `storagePath` string client-side and hand it straight to Supabase Storage.
 * Whatever the browser types is what gets written; the only thing standing
 * between one tenant and another's prefix is a Supabase `storage.objects`
 * RLS policy. As `lib/storage/server.ts`'s header states verbatim:
 * "`serverStorage(client)` DROPS Supabase `storage.objects` RLS in R2 mode,
 * because an S3-compatible backend has no per-user policy layer of its own."
 * That means the moment R2 is active, the RLS backstop simply stops
 * existing — a client-chosen key becomes the ONLY thing standing between
 * tenants. This module replaces "browser picks the key" with "server derives
 * and validates the key", so tenant confinement survives the backend swap.
 *
 * KEY SHAPE IS FROZEN: `{companyId}/{projectId}/{uuid}.{ext}` — verified
 * byte-identical against all three call sites (see this file's test for the
 * literal assertion). This is NOT `lib/storage/keys.ts`'s `buildStorageKey`
 * shape (`{companyId}/{type}/{timestamp}-{filename}`). Re-keying is
 * explicitly out of scope for this milestone: every existing
 * `recordings.storage_path` row already has the frozen shape, and switching
 * shapes would strand them.
 *
 * OUT OF SCOPE, DELIBERATELY: this module only mints WRITE tickets. It does
 * not touch the browser READ path (`getSignedUrl` calls in
 * capture-recorder.tsx, photo-card.tsx, photo-lightbox.tsx,
 * estimate-document.tsx) — those belong to Phase 190. Do not "finish the
 * job" here.
 *
 * NO ROUTE HERE: Plan 02 wires this module into a route handler that proves
 * `projectId` belongs to the authenticated `companyId` BEFORE calling
 * `mintUploadTicket`. This module trusts its caller on that point — it only
 * derives/validates the KEY, it does not authorize the project.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as presignS3 } from '@aws-sdk/s3-request-presigner'
import { serverStorageBackend } from './server'
import { s3ConfigFromEnv } from './s3-config'
import { getFileExtension } from '@/lib/utils/media-format'

/** Buckets a browser may be ticketed to write. Deliberately just `audio` —
 * the verified census (see 189-01-PLAN.md <verified_facts>) is exactly
 * three browser upload call sites, all targeting `audio`. An allowlist
 * entry with no caller is an attack surface with no benefit. */
export const UPLOAD_TICKET_BUCKETS = ['audio'] as const
export type UploadTicketBucket = (typeof UPLOAD_TICKET_BUCKETS)[number]

export interface MintUploadTicketArgs {
  bucket: UploadTicketBucket
  /** Caller-supplied. Plan 02's route proves it belongs to `companyId` BEFORE calling in. */
  projectId: string
  /** Caller-supplied, allowlisted+normalized here. */
  contentType: string
  /** Auth-derived by the route. NEVER read from the request body. */
  companyId: string
  /** Supabase-mode only: the RLS-bound request client used to mint the signed upload URL. */
  supabase: SupabaseClient
  /**
   * Optional re-ticket of an already-minted key (retry path). VALIDATED
   * against companyId/projectId — never trusted, never repaired.
   */
  key?: string
}

export type UploadTicket =
  | {
      strategy: 's3-presigned-put'
      bucket: string
      key: string
      url: string
      /**
       * Sent VERBATIM by the browser. Includes the exact Content-Type the
       * URL was signed for — verbatim-or-broken: a presigned PUT signed for
       * `audio/webm` fails with `SignatureDoesNotMatch` if the browser sends
       * a different Content-Type header (e.g. `audio/webm;codecs=opus`,
       * which is exactly what `getSupportedAudioMimeType()` returns on
       * Chrome).
       */
      headers: Record<string, string>
      expiresInSeconds: number
      /** Echo of the normalized type — the browser stamps its Blob with this. */
      contentType: string
    }
  | {
      strategy: 'supabase-signed-upload'
      bucket: string
      key: string
      token: string
      expiresInSeconds: number
      /**
       * Echo of the normalized type. NOT decoration: `@supabase/storage-js`'s
       * `uploadToSignedUrl` sends the Blob as multipart FormData and IGNORES
       * this ticket's content type entirely in that branch — the stored
       * type comes from the Blob's own `.type`. Plan 03's browser code MUST
       * re-stamp the Blob with this value before calling
       * `uploadToSignedUrl`, or the object lands with whatever MIME the
       * MediaRecorder happened to produce (which may include a
       * `;codecs=...` suffix Supabase doesn't want). Do not "clean up" this
       * field as redundant — it is the only thing that fixes that mismatch.
       */
      contentType: string
    }

/**
 * Content types a browser upload ticket may be minted for. Exactly the set
 * `getSupportedAudioMimeType()` can return, normalized (stripped of
 * `;codecs=...` params), plus a couple of additional container types the
 * three call sites' fallback (`mimeTypeRef.current || 'audio/webm'`) may
 * imply. Kept small and explicit — this list reaches an HTTP
 * `Content-Type` header and an S3 request signature.
 */
const ALLOWED_CONTENT_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
])

/**
 * `audio/webm;codecs=opus` -> `audio/webm`; case-insensitive; trims
 * whitespace. Returns null for anything not in the allowlist, INCLUDING any
 * value containing a CR or LF (a value that reaches an HTTP header must
 * never carry header-injection characters).
 */
export function normalizeUploadContentType(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (/[\r\n]/.test(raw)) return null

  const trimmed = raw.trim().toLowerCase()
  // Strip any `;param=value` suffix (e.g. `;codecs=opus`).
  const base = trimmed.split(';')[0]?.trim() ?? ''

  return ALLOWED_CONTENT_TYPES.has(base) ? base : null
}

/**
 * Tenant prefix must be a real UUID. Mirrors `lib/storage/keys.ts`'s
 * `COMPANY_ID_RE` and `lib/storage/proxy-auth.ts`'s `COMPANY_ID_RE`.
 * Duplicated (not imported) deliberately: both of those files are out of
 * scope for this plan. Keep all three patterns identical if any ever
 * changes.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Matches the final key segment: `<uuid>.<ext>` where ext is one of the
 * extensions `getFileExtension()` can produce. */
const KEY_LAST_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|mp4|ogg)$/i

/**
 * Pure. `{companyId}/{projectId}/{uuid}.{ext}` — the EXISTING production
 * shape, verified byte-identical against capture-recorder.tsx,
 * inline-audio-recorder.tsx, and use-ai-input-submit.ts (see this module's
 * test file for the literal assertion). Reuses `getFileExtension` from
 * `@/lib/utils/media-format` so the extension logic cannot drift from the
 * three call sites this replaces.
 */
export function deriveUploadKey(args: {
  companyId: string
  projectId: string
  contentType: string
  /** Deterministic id for tests; defaults to crypto.randomUUID(). */
  id?: string
}): string {
  if (!UUID_RE.test(args.companyId)) {
    throw new Error('deriveUploadKey: companyId must be a UUID')
  }
  if (!UUID_RE.test(args.projectId)) {
    throw new Error('deriveUploadKey: projectId must be a UUID')
  }
  const normalized = normalizeUploadContentType(args.contentType)
  if (!normalized) {
    throw new Error(`deriveUploadKey: contentType not allowlisted: ${args.contentType}`)
  }
  const id = args.id ?? crypto.randomUUID()
  const ext = getFileExtension(normalized)
  return `${args.companyId}/${args.projectId}/${id}.${ext}`
}

/**
 * True ONLY when `key` is a well-formed key this exact tenant+project owns.
 * Reject-never-repair, exactly like `normalizeProxyKey` in Phase 187: no
 * `.replace()` is ever applied to a bad key to "fix" it — a failing check
 * returns false, full stop. Checks the RAW string; any `%` in the last
 * segment is rejected outright rather than attempting to decide which
 * encodings are "safe" to decode (decode-then-check is the trap here).
 */
export function assertKeyInTenant(key: string, companyId: string, projectId: string): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return false
  if (key.includes('\0')) return false
  if (key.includes('\\')) return false
  if (key.startsWith('/') || key.endsWith('/')) return false
  if (key.includes('..')) return false

  const segments = key.split('/')
  if (segments.length !== 3) return false
  const [seg0, seg1, seg2] = segments
  if (!seg0 || !seg1 || !seg2) return false

  if (seg0 !== companyId) return false
  if (seg1 !== projectId) return false
  if (seg2.includes('%')) return false
  if (!KEY_LAST_SEGMENT_RE.test(seg2)) return false

  return true
}

/** Presigned PUT URLs are valid for 15 minutes. The browser retry ladder is
 * 3 attempts with 1s + 2s backoff on top of a mobile-network upload of a
 * multi-minute recording — 900s covers the worst realistic case with room.
 * It is a *write* URL for one exact key with a pinned content type, so its
 * blast radius is one object the caller was already authorized to create. */
const TICKET_EXPIRES_IN_SECONDS = 900

class MissingR2ConfigError extends Error {
  constructor() {
    super(
      '[lib/storage/upload-ticket] mintUploadTicket: serverStorageBackend() ' +
        "returned 'r2' but s3ConfigFromEnv() is null — this should be " +
        'unreachable (serverStorageBackend already validates S3_* ' +
        'completeness before returning r2); never silently degrade to a ' +
        'different backend here.',
    )
    this.name = 'MissingR2ConfigError'
  }
}

/**
 * Resolves the key this ticket is for: a fresh `deriveUploadKey()` output
 * when `args.key` is absent, or the SAME re-validated key on a retry.
 * Never mints a fresh key as a fallback when a supplied key fails
 * validation — a silently-different key is how a probe would learn
 * something happened.
 */
function resolveTicketKey(args: MintUploadTicketArgs, normalizedContentType: string): string {
  if (args.key === undefined) {
    return deriveUploadKey({
      companyId: args.companyId,
      projectId: args.projectId,
      contentType: normalizedContentType,
    })
  }
  if (!assertKeyInTenant(args.key, args.companyId, args.projectId)) {
    throw new Error(
      'mintUploadTicket: supplied key failed tenant-confinement validation — refusing to mint',
    )
  }
  return args.key
}

async function mintR2Ticket(
  bucket: string,
  key: string,
  contentType: string,
): Promise<UploadTicket> {
  const cfg = s3ConfigFromEnv()
  if (!cfg) {
    throw new MissingR2ConfigError()
  }
  // Constructed fresh per call, no module-level singleton — same rationale
  // as lib/storage/server.ts's header ("a cached S3 client would survive
  // env changes between tests").
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle ?? true,
  })

  const url = await presignS3(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    {
      expiresIn: TICKET_EXPIRES_IN_SECONDS,
      // @aws-sdk/s3-request-presigner treats `content-type` as unsignable by
      // default (S3RequestPresigner.prepareRequest always calls
      // `unsignableHeaders.add('content-type')`) — presigned PUT URLs
      // normally don't pin it. UPLOAD-03 requires exactly the opposite: the
      // signature must be defeated by a browser sending a different
      // Content-Type. `signableHeaders` overrides the unsignable exclusion
      // for this one header, which is what puts `content-type` into
      // `X-Amz-SignedHeaders` and ties it into the signature.
      signableHeaders: new Set(['content-type']),
    },
  )

  return {
    strategy: 's3-presigned-put',
    bucket,
    key,
    url,
    // verbatim-or-broken — see the UploadTicket type's docblock.
    headers: { 'Content-Type': contentType },
    expiresInSeconds: TICKET_EXPIRES_IN_SECONDS,
    contentType,
  }
}

async function mintSupabaseTicket(
  supabase: SupabaseClient,
  bucket: string,
  key: string,
  contentType: string,
): Promise<UploadTicket> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(key)
  if (error || !data?.token) {
    // Mirrors lib/storage/supabase-provider.ts's upload: preserve
    // .status/.statusCode on the thrown Error so the browser's retry
    // classifier (upload-with-retry.ts's getStatus()) can tell
    // retryable/terminal apart.
    throw Object.assign(
      new Error(`mintUploadTicket: createSignedUploadUrl failed (${bucket}/${key}): ${error?.message ?? 'no token'}`),
      {
        status: (error as { status?: number } | null)?.status,
        statusCode: (error as { statusCode?: string } | null)?.statusCode,
        cause: error,
      },
    )
  }

  return {
    strategy: 'supabase-signed-upload',
    bucket,
    key,
    token: data.token,
    // Note: data.signedUrl is intentionally NOT forwarded — the browser
    // rebuilds it from NEXT_PUBLIC_SUPABASE_URL, which it already has.
    expiresInSeconds: TICKET_EXPIRES_IN_SECONDS,
    contentType,
  }
}

/**
 * Issues a short-lived, single-key upload ticket for the browser to PUT (R2
 * mode) or `uploadToSignedUrl` (Supabase mode) its audio recording to.
 *
 * Dispatches on `serverStorageBackend()` — Phase 188's ONE provider
 * decision. This module never reads `STORAGE_PROVIDER` or `S3_*` presence
 * itself; that would be a second, competing provider decision.
 *
 * Must be called ONCE per logical upload, OUTSIDE `uploadWithRetry`. Minting
 * a new ticket (and therefore a new key) per retry attempt would break that
 * wrapper's 409-as-success rule and orphan objects — Plan 03's browser code
 * mints one ticket, then retries the PUT/uploadToSignedUrl call against it.
 */
export async function mintUploadTicket(args: MintUploadTicketArgs): Promise<UploadTicket> {
  if (!UPLOAD_TICKET_BUCKETS.includes(args.bucket)) {
    throw new Error(`mintUploadTicket: bucket not allowlisted: ${args.bucket}`)
  }
  const normalizedContentType = normalizeUploadContentType(args.contentType)
  if (!normalizedContentType) {
    throw new Error(`mintUploadTicket: contentType not allowlisted: ${args.contentType}`)
  }

  const key = resolveTicketKey(args, normalizedContentType)
  const backend = serverStorageBackend()

  if (backend === 'r2') {
    return mintR2Ticket(args.bucket, key, normalizedContentType)
  }
  return mintSupabaseTicket(args.supabase, args.bucket, key, normalizedContentType)
}
