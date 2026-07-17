/**
 * Phase 169 Plan 01 — CAPT-03: hand-rolled IndexedDB wrapper for pending
 * capture blobs. No dependency — the native `indexedDB` API only.
 *
 * Fail-soft by design: every exported function NEVER throws. Any IDB error
 * (API unavailable, private-mode quota rejection, blocked upgrade, storage
 * eviction) resolves to the soft value (false / null / void), so capture
 * always degrades to today's memory-only behavior — storage being
 * unavailable must never break the pipeline (audit F3).
 *
 * iOS Safari note (Opus check #4): we store an ArrayBuffer, never a raw
 * Blob — Safari has a documented history of Blobs round-tripping through
 * IDB unreadable or zero-length. Callers reconstruct
 * `new Blob([buffer], { type: mimeType })` on read.
 */

const DB_NAME = 'xtimator-capture'
const DB_VERSION = 1
const STORE_NAME = 'pending'

export interface PendingCapture {
  /** `${projectKey}` — one pending capture per project/flow. */
  key: string
  buffer: ArrayBuffer
  mimeType: string
  durationSeconds: number
  /** Date.now() at save — callers decide staleness (e.g. discard if > 24h). */
  createdAt: number
}

let cachedAvailable: boolean | null = null

/** Memoized feature check — cheap synchronous guard callers can use before touching IDB. */
export function isAvailable(): boolean {
  if (cachedAvailable === null) {
    cachedAvailable = typeof indexedDB !== 'undefined'
  }
  return cachedAvailable
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function savePendingCapture(p: PendingCapture): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false
    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(p)
        tx.oncomplete = () => {
          db.close()
          resolve(true)
        }
        tx.onerror = () => {
          db.close()
          resolve(false)
        }
        tx.onabort = () => {
          db.close()
          resolve(false)
        }
      } catch {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

export async function getPendingCapture(key: string): Promise<PendingCapture | null> {
  try {
    const db = await openDb()
    if (!db) return null
    return await new Promise<PendingCapture | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => {
          db.close()
          resolve((req.result as PendingCapture | undefined) ?? null)
        }
        req.onerror = () => {
          db.close()
          resolve(null)
        }
      } catch {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

export async function deletePendingCapture(key: string): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
        tx.onabort = () => {
          db.close()
          resolve()
        }
      } catch {
        db.close()
        resolve()
      }
    })
  } catch {
    /* fail-soft — best-effort delete only */
  }
}
