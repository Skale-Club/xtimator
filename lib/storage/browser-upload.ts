/**
 * Phase 189 Plan 03 — UPLOAD-01/UPLOAD-04: the browser's ticket-driven
 * upload module.
 *
 * BROWSER-SAFE, ENFORCED STATICALLY: this file must never import
 * `@/lib/storage/server`, `@/lib/storage/s3-config`, `@/lib/storage/upload-ticket`
 * (the server-only ticket minter — import types from `./upload-ticket-types`
 * instead), `@/lib/supabase/service`, or the AWS SDK. No storage credential
 * (service-role key, S3 access key) may ever reach this module's import
 * graph. Plan 04's static import-graph gate scans for exactly this and
 * fails the build if it finds one — see that plan for the check itself.
 *
 * WHAT THIS REPLACES: today's three browser upload call sites
 * (capture-recorder.tsx, inline-audio-recorder.tsx, use-ai-input-submit.ts)
 * each compute their own `storagePath` client-side and write straight to
 * Supabase Storage with `createStorage(createClient())`. That only works
 * because Supabase Storage RLS is the backstop — the moment R2 is the
 * active backend that backstop doesn't exist (see upload-ticket.ts's header).
 * This module replaces "browser writes with its own credential" with
 * "browser asks the server for a single-key, single-use ticket, then moves
 * bytes against that ticket" — no storage credential of any kind (Supabase
 * anon key aside — it is not a storage credential) ever needs to reach the
 * browser for this to work.
 *
 * COMPOSES `uploadWithRetry` VERBATIM (UPLOAD-04): the byte move reuses
 * `lib/storage/upload-with-retry.ts` completely unmodified — same 3-attempt
 * ladder, same exponential backoff, same 409-as-success / terminal-4xx
 * classification. This module only supplies that wrapper with a
 * `StorageProvider`-shaped adapter that knows how to PUT/uploadToSignedUrl
 * against a ticket; it does not fork or reimplement any of the wrapper's
 * retry policy.
 */
import type { StorageProvider } from './index'
import type { UploadTicket } from './upload-ticket-types'
import { uploadWithRetry } from './upload-with-retry'
import { createClient } from '@/lib/supabase/client'

export interface UploadViaTicketArgs {
  bucket: 'audio'
  projectId: string
  blob: Blob
  /** e.g. getSupportedAudioMimeType() output, possibly carrying ";codecs=opus". */
  contentType: string
}

export interface UploadViaTicketOptions {
  /** Defaults match uploadWithRetry's: 3 and 1000. */
  attempts?: number
  baseDelayMs?: number
  signal?: AbortSignal
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000

const TICKET_ROUTE = '/api/storage/upload-ticket'

const READ_NOT_SUPPORTED =
  'ticket provider is upload-only; read through the same-origin asset proxy'

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

/**
 * Duplicated from `upload-with-retry.ts`'s own `sleep()` — a JSON POST isn't
 * a `StorageProvider`, so it can't reuse that wrapper's loop directly. Keep
 * this function and `upload-with-retry.ts`'s `sleep()` behaviorally
 * identical; a change to one should prompt a look at the other.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Duplicated from `upload-with-retry.ts`'s own `getStatus()` — same
 * reasoning as `sleep()` above. Extracts a numeric HTTP status from a thrown
 * error, if one was attached.
 */
function getStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const status = (err as { status?: unknown }).status
  if (typeof status === 'number') return status
  const statusCode = (err as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number') return statusCode
  if (typeof statusCode === 'string' && /^\d+$/.test(statusCode)) return Number(statusCode)
  return undefined
}

async function postTicketOnce(
  args: Omit<UploadViaTicketArgs, 'blob'> & { key?: string },
  signal: AbortSignal | undefined,
): Promise<UploadTicket> {
  const res = await fetch(TICKET_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket: args.bucket,
      projectId: args.projectId,
      contentType: args.contentType,
      ...(args.key !== undefined ? { key: args.key } : {}),
    }),
    signal,
  })
  if (res.ok) {
    return (await res.json()) as UploadTicket
  }
  const body = await res.json().catch(() => null)
  // .status attached exactly like supabase-provider.ts's upload() shapes its
  // thrown errors — this is what lets the ladder below (and, for the byte
  // move, uploadWithRetry) tell retryable (>=500 / network) from terminal
  // (other 4xx) apart.
  throw Object.assign(
    new Error(
      `requestUploadTicket: ticket request failed (${res.status}): ${
        (body as { error?: string } | null)?.error ?? res.statusText
      }`,
    ),
    { status: res.status },
  )
}

/**
 * Requests a single-key, single-use upload ticket from the server.
 *
 * Retry ladder is DELIBERATELY a ~20-line duplicate of `uploadWithRetry`'s
 * *policy* (same attempt count, same `baseDelayMs * 2 ** (attempt - 1)`
 * backoff, same >=500-is-retryable / other-4xx-is-terminal split) — not its
 * *code*, because that wrapper takes a `StorageProvider`, which a JSON POST
 * is not. Keep this ladder numerically identical to
 * `upload-with-retry.ts`'s; a change to one should prompt a look at the
 * other.
 *
 * Exported for tests and for a caller that needs the key before moving bytes.
 */
export async function requestUploadTicket(
  args: Omit<UploadViaTicketArgs, 'blob'> & { key?: string },
  opts?: UploadViaTicketOptions,
): Promise<UploadTicket> {
  const { attempts = DEFAULT_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS, signal } = opts ?? {}

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw abortError()
    try {
      return await postTicketOnce(args, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const status = getStatus(err)
      if (status !== undefined && status < 500) {
        // Terminal 4xx (bad shape / auth / demo / not-found) — retrying can
        // never help.
        throw err
      }
      lastError = err
      if (attempt === attempts) break
      await sleep(baseDelayMs * 2 ** (attempt - 1), signal)
    }
  }
  throw lastError
}

async function putS3(
  ticket: Extract<UploadTicket, { strategy: 's3-presigned-put' }>,
  body: Blob,
): Promise<{ path: string }> {
  // Headers sent VERBATIM — no merging, no extra Content-Type, no x-upsert.
  // Any unsigned header or altered value breaks the presigned signature.
  // No `credentials: 'include'`: the default `same-origin` is correct here —
  // sending cookies cross-origin to R2 would both fail CORS and leak a
  // session cookie to a third-party host.
  const res = await fetch(ticket.url, {
    method: 'PUT',
    headers: ticket.headers,
    body,
  })
  if (!res.ok) {
    // .status attached so uploadWithRetry's classifier (409-as-success,
    // >=500-retryable, other-4xx-terminal) can see it — mirrors
    // supabase-provider.ts's upload() error shaping exactly.
    throw Object.assign(
      new Error(`Ticketed upload failed (${ticket.bucket}/${ticket.key}): ${res.status} ${res.statusText}`),
      { status: res.status },
    )
  }
  return { path: ticket.key }
}

async function putSupabase(
  ticket: Extract<UploadTicket, { strategy: 'supabase-signed-upload' }>,
  body: Blob,
): Promise<{ path: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.key, ticket.token, body, { upsert: false })
  if (error || !data) {
    throw Object.assign(
      new Error(`Ticketed upload failed (${ticket.bucket}/${ticket.key}): ${error?.message ?? 'no data'}`),
      {
        status: (error as { status?: number } | null)?.status,
        statusCode: (error as { statusCode?: string } | null)?.statusCode,
        cause: error,
      },
    )
  }
  return { path: ticket.key }
}

/**
 * Adapts a single minted `UploadTicket` into a `StorageProvider`-shaped
 * object so the unmodified `uploadWithRetry` wrapper can drive the byte
 * move. Only `upload()` does anything real — every read/delete/list method
 * throws, because a write ticket authorizes exactly one write and nothing
 * else. `bucket`/`path` args on `upload()` are ignored in favor of the
 * ticket's own `bucket`/`key` — the ticket is the single source of truth for
 * where these bytes land.
 */
function ticketProvider(ticket: UploadTicket): StorageProvider {
  return {
    async upload(_bucket, _path, body) {
      const blob = body as Blob
      return ticket.strategy === 's3-presigned-put'
        ? putS3(ticket, blob)
        : putSupabase(ticket, blob)
    },
    async download() {
      throw new Error(READ_NOT_SUPPORTED)
    },
    async getSignedUrl() {
      throw new Error(READ_NOT_SUPPORTED)
    },
    getPublicUrl() {
      throw new Error(READ_NOT_SUPPORTED)
    },
    async delete() {
      throw new Error(READ_NOT_SUPPORTED)
    },
    async list() {
      throw new Error(READ_NOT_SUPPORTED)
    },
  }
}

/**
 * Mints ONE ticket, then moves bytes via the unmodified `uploadWithRetry`
 * wrapper. Mirrors `StorageProvider.upload`'s return shape so call sites
 * change minimally.
 *
 * WHY THE TICKET IS MINTED ONCE, OUTSIDE THE RETRY LOOP: minting a fresh
 * ticket per attempt would mint a fresh key per attempt too, which (a)
 * breaks `uploadWithRetry`'s 409-means-already-landed rule (a lost-response
 * success on attempt N would look like a stale, unrelated key by the time
 * attempt N+1 re-mints) and (b) strands an orphan object on every transient
 * failure. One ticket, one key, N byte-move attempts.
 */
export async function uploadViaTicket(
  args: UploadViaTicketArgs,
  opts?: UploadViaTicketOptions,
): Promise<{ path: string }> {
  const ticket = await requestUploadTicket(
    { bucket: args.bucket, projectId: args.projectId, contentType: args.contentType },
    opts,
  )

  // Blob stamping (both strategies): when the recorded Blob's own `.type`
  // doesn't match the ticket's (normalized) content type, re-wrap it.
  // `@supabase/storage-js`'s `uploadToSignedUrl` sends a Blob as multipart
  // FormData and ignores its `contentType` fileOption in that branch, so the
  // Blob's own `.type` is the only thing that reaches storage — this is what
  // makes UPLOAD-03 true on the Supabase side. Pass through untouched
  // (identity, no new Blob) when it already matches.
  const stampedBlob =
    args.blob.type === ticket.contentType ? args.blob : new Blob([args.blob], { type: ticket.contentType })

  await uploadWithRetry(ticketProvider(ticket), ticket.bucket, ticket.key, stampedBlob, {
    contentType: ticket.contentType,
    attempts: opts?.attempts,
    baseDelayMs: opts?.baseDelayMs,
    signal: opts?.signal,
  })

  return { path: ticket.key }
}
