/**
 * lib/estimate/background-generations.ts
 *
 * The client's list of estimate generations the operator walked away from.
 *
 * Once a capture is dispatched, the server owns the pipeline end to end (the
 * dispatch-and-watch model, lib/estimate/poll-outcome.ts), so closing the popup
 * or leaving the page never stops the estimate. What it used to stop was the
 * operator finding out: the watcher lived inside the popup, and closing the
 * popup unmounted it. Nothing told them the estimate was ready.
 *
 * This store remembers each attempt the operator left, so a watcher mounted in
 * the app shell (components/capture/background-generation-watcher.tsx) can keep
 * polling the journal and announce the result, and so the project list and
 * the project's estimate tab can show that a generation is still running.
 *
 * Persistence is localStorage, per browser, on purpose: this is a per-viewer
 * convenience (it survives a reload and syncs across tabs through the
 * `storage` event), never the source of truth. The journal is the truth, and
 * every read of it goes through getAttemptOutcome. Every storage access is
 * wrapped: private mode or blocked site data degrade to an in-memory list.
 */

export interface BackgroundGeneration {
  attemptId: string
  projectId: string
  /** Shown in the "estimate ready" notice. Absent for placeholder names. */
  projectName?: string
  /** ISO time the operator left it. Entries expire after MAX_AGE_MS. */
  since: string
}

const STORAGE_KEY = 'xtimator:background-generations'
const CHANGE_EVENT = 'xtimator:background-generations-change'

/**
 * Past this, an entry is dropped unannounced. Generation has a server-side
 * watchdog well inside this window, so an entry this old can only be one whose
 * outcome the watcher never managed to read (offline, signed out).
 */
export const MAX_AGE_MS = 45 * 60_000

let memory: BackgroundGeneration[] = []
let cachedRaw: string | null | undefined = undefined
let cachedList: BackgroundGeneration[] = []

function isEntry(v: unknown): v is BackgroundGeneration {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return typeof e.attemptId === 'string' && typeof e.projectId === 'string' && typeof e.since === 'string'
}

/** The stored value, or `undefined` when storage itself is unavailable. */
function readRaw(): string | null | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return undefined
  }
}

function fresh(list: BackgroundGeneration[], nowMs: number): BackgroundGeneration[] {
  return list.filter((e) => {
    const t = Date.parse(e.since)
    return Number.isFinite(t) && nowMs - t < MAX_AGE_MS
  })
}

/**
 * The current list, stale entries dropped. Returns the SAME array instance
 * until the stored value changes, as useSyncExternalStore requires.
 */
export function listBackgroundGenerations(nowMs: number = Date.now()): BackgroundGeneration[] {
  if (typeof window === 'undefined') return cachedList
  const raw = readRaw()
  if (raw === undefined) {
    // Storage unavailable (private mode, blocked site data): this tab's own
    // in-memory list is all there is.
    const list = fresh(memory, nowMs)
    if (list.length !== cachedList.length || list.some((e, i) => e !== cachedList[i])) cachedList = list
    return cachedList
  }
  if (raw === cachedRaw) {
    // Same stored value: only expiry can change the answer.
    const list = fresh(cachedList, nowMs)
    if (list.length !== cachedList.length) cachedList = list
    return cachedList
  }
  cachedRaw = raw
  if (raw === null) {
    cachedList = []
    return cachedList
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    cachedList = Array.isArray(parsed) ? fresh(parsed.filter(isEntry), nowMs) : []
  } catch {
    cachedList = []
  }
  return cachedList
}

function write(list: BackgroundGeneration[]): void {
  memory = list
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable: the in-memory list still serves this tab.
    cachedRaw = undefined
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // No window (SSR/tests torn down): nothing to notify.
  }
}

export function addBackgroundGeneration(entry: BackgroundGeneration): void {
  if (typeof window === 'undefined') return
  const rest = listBackgroundGenerations().filter((e) => e.attemptId !== entry.attemptId)
  write([...rest, entry])
}

export function removeBackgroundGeneration(attemptId: string): void {
  if (typeof window === 'undefined') return
  const list = listBackgroundGenerations()
  if (!list.some((e) => e.attemptId === attemptId)) return
  write(list.filter((e) => e.attemptId !== attemptId))
}

/** Subscribes to changes from this tab and from other tabs. */
export function subscribeBackgroundGenerations(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

const EMPTY: BackgroundGeneration[] = []

/** Server snapshot for useSyncExternalStore: nothing runs in the background on the server. */
export function serverBackgroundGenerations(): BackgroundGeneration[] {
  return EMPTY
}
