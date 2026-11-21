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
const DB_VERSION = 2
const STORE_NAME = 'pending'
/** v2: take still being recorded (chunks appended while recording). */
const INFLIGHT_STORE = 'inflight'

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
      // Additive upgrade: each store is created only when missing, so a v1
      // database keeps its 'pending' store (and any unsent recording in it).
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(INFLIGHT_STORE)) {
        db.createObjectStore(INFLIGHT_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Let a newer version in another tab upgrade instead of being blocked by this connection.
      db.onversionchange = () => db.close()
      resolve(db)
    }
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

/**
 * A take that is still being recorded (webm only). The recorder appends one
 * chunk per timeslice, so a locked screen, a discarded tab or a crash loses at
 * most the last few seconds. Chunks are ArrayBuffers in recording order
 * (never raw Blobs — see the iOS note above).
 */
export interface InflightCapture {
  /** Same key as the pending capture of this flow. */
  key: string
  mimeType: string
  /** Date.now() when the take started. */
  startedAt: number
  /** Recorded (not wall-clock) length at the last appended chunk. */
  durationMs: number
  /** Date.now() of the last append — callers decide staleness. */
  updatedAt: number
  chunks: ArrayBuffer[]
}

/**
 * Append one chunk to the in-flight take for `key` (read-modify-write in one
 * transaction). `reset` starts a fresh record, dropping anything left by an
 * earlier interrupted take. Never throws; resolves false on any failure.
 * Callers must serialize calls so chunks keep their order.
 */
export async function appendInflightChunk(
  key: string,
  meta: { mimeType: string; startedAt: number; durationMs: number },
  chunk: ArrayBuffer,
  reset = false
): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false
    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(INFLIGHT_STORE, 'readwrite')
        const store = tx.objectStore(INFLIGHT_STORE)
        const write = (existing: InflightCapture | undefined) => {
          const base: InflightCapture =
            existing && !reset
              ? existing
              : { key, mimeType: meta.mimeType, startedAt: meta.startedAt, durationMs: 0, updatedAt: 0, chunks: [] }
          base.chunks.push(chunk)
          base.durationMs = meta.durationMs
          base.updatedAt = Date.now()
          store.put(base)
        }
        if (reset) {
          write(undefined)
        } else {
          const req = store.get(key)
          req.onsuccess = () => write(req.result as InflightCapture | undefined)
        }
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

export async function getInflightCapture(key: string): Promise<InflightCapture | null> {
  try {
    const db = await openDb()
    if (!db) return null
    return await new Promise<InflightCapture | null>((resolve) => {
      try {
        const tx = db.transaction(INFLIGHT_STORE, 'readonly')
        const req = tx.objectStore(INFLIGHT_STORE).get(key)
        req.onsuccess = () => {
          db.close()
          resolve((req.result as InflightCapture | undefined) ?? null)
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

export async function deleteInflightCapture(key: string): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(INFLIGHT_STORE, 'readwrite')
        tx.objectStore(INFLIGHT_STORE).delete(key)
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
