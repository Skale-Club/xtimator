/**
 * Phase 169 Plan 01 — CAPT-01: retry wrapper for StorageProvider.upload.
 *
 * Sits ON TOP of the StorageProvider abstraction (lib/storage/index.ts) —
 * composes it, never modifies its interface. Wraps a single upload(bucket,
 * path, blob) call with up to `attempts` tries and exponential backoff
 * between them, so a transient network flap or a Supabase 5xx blip
 * self-heals instead of stranding a finished recording in memory (audit F1:
 * capture-recorder.tsx had zero retry anywhere on a 40s-2min upload window).
 *
 * Classification is driven by the `.status` this wrapper's PREREQUISITE fix
 * preserves on the Error thrown by supabase-provider.ts (see that file):
 *   - no status at all (TypeError / network failure / timeout DOMException)
 *     → retryable
 *   - status >= 500                                     → retryable
 *   - status === 409 on this SAME path                   → treat as SUCCESS
 *     (every call site here uploads to one fixed storagePath with
 *     upsert:false — a 409 can only mean "I already wrote this object on a
 *     prior attempt whose response was lost in transit")
 *   - any other 4xx (401/403/413/422/...)                 → terminal, throw
 *     immediately (auth/policy/size — retrying can never help)
 */
import type { StorageProvider, UploadOptions } from './index'

export interface UploadWithRetryOptions extends UploadOptions {
  /** Max number of upload tries. Default 3. */
  attempts?: number
  /** Base delay (ms) for exponential backoff — the wait before try N (N>=2) is baseDelayMs * 2^(N-2). Default 1000. */
  baseDelayMs?: number
  signal?: AbortSignal
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

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

/** Extracts a numeric HTTP status from a thrown error, if the provider attached one. */
function getStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const status = (err as { status?: unknown }).status
  if (typeof status === 'number') return status
  const statusCode = (err as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number') return statusCode
  if (typeof statusCode === 'string' && /^\d+$/.test(statusCode)) return Number(statusCode)
  return undefined
}

export async function uploadWithRetry(
  storage: StorageProvider,
  bucket: string,
  path: string,
  blob: Blob,
  opts?: UploadWithRetryOptions,
): Promise<{ path: string }> {
  const { attempts = DEFAULT_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS, signal, ...uploadOpts } = opts ?? {}

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw abortError()
    try {
      return await storage.upload(bucket, path, blob, uploadOpts)
    } catch (err) {
      const status = getStatus(err)
      if (status === 409) {
        // Idempotent re-upload: the object already landed on a prior attempt
        // whose response was lost — not an error from the caller's POV.
        return { path }
      }
      if (status !== undefined && status < 500) {
        // Terminal 4xx (auth/policy/size) — retrying can never help.
        throw err
      }
      lastError = err
      if (attempt === attempts) break
      await sleep(baseDelayMs * 2 ** (attempt - 1), signal)
    }
  }
  throw lastError
}
