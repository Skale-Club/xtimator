const RECOVERY_SESSION_KEY = 'xtimator_chunk_recovery_at'
const RECOVERY_QUERY_PARAM = 'xtimator_chunk_recovery'
const RECOVERY_COOLDOWN_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w.-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /\/_next\/static\/chunks\//i,
  /strict MIME type checking is enabled/i,
  /MIME type \(['"]text\/plain['"]\) is not executable/i,
]

export function isRecoverableChunkError(error: unknown): boolean {
  const values = collectErrorText(error)
  return values.some((value) => CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(value)))
}

export function buildChunkRecoveryUrl(location: Pick<Location, 'pathname' | 'search' | 'hash'>, now = Date.now()) {
  const params = new URLSearchParams(location.search)
  params.set(RECOVERY_QUERY_PARAM, String(now))
  const query = params.toString()
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
}

export async function recoverFromStaleChunkError(error: unknown): Promise<boolean> {
  if (!isRecoverableChunkError(error) || typeof window === 'undefined') return false

  const now = Date.now()
  const lastRecovery = Number(window.sessionStorage.getItem(RECOVERY_SESSION_KEY) ?? 0)
  if (Number.isFinite(lastRecovery) && now - lastRecovery < RECOVERY_COOLDOWN_MS) {
    return false
  }

  window.sessionStorage.setItem(RECOVERY_SESSION_KEY, String(now))

  await Promise.allSettled([
    unregisterServiceWorkers(),
    deletePwaCaches(),
  ])

  window.location.replace(buildChunkRecoveryUrl(window.location, now))
  return true
}

async function unregisterServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

async function deletePwaCaches() {
  if (typeof caches === 'undefined') return
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith('shell-') || key.startsWith('pages-'))
      .map((key) => caches.delete(key))
  )
}

function collectErrorText(error: unknown): string[] {
  if (!error) return []
  if (typeof error === 'string') return [error]

  if (error instanceof Error) {
    return [
      error.name,
      error.message,
      error.stack ?? '',
      ...collectErrorText((error as Error & { cause?: unknown }).cause),
    ]
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [
      String(record.name ?? ''),
      String(record.message ?? ''),
      String(record.stack ?? ''),
      String(record.digest ?? ''),
      ...collectErrorText(record.cause),
    ]
  }

  return [String(error)]
}
