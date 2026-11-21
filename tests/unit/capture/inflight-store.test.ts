/**
 * In-progress take store (blob-store 'inflight'): append / read / clear, reset,
 * the v1 -> v2 upgrade keeping the 'pending' store, and the fail-soft rule.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  appendInflightChunk,
  getInflightCapture,
  deleteInflightCapture,
  getPendingCapture,
} from '@/lib/capture/blob-store'

const bytes = (...n: number[]) => new Uint8Array(n).buffer
const meta = (durationMs: number) => ({ mimeType: 'audio/webm;codecs=opus', startedAt: 1000, durationMs })

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('xtimator-capture')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await deleteDb()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('inflight store', () => {
  it('appends chunks in order and keeps the latest metadata', async () => {
    expect(await appendInflightChunk('k', meta(10_000), bytes(1, 2), true)).toBe(true)
    expect(await appendInflightChunk('k', meta(20_000), bytes(3))).toBe(true)
    expect(await appendInflightChunk('k', meta(30_000), bytes(4, 5))).toBe(true)

    const rec = await getInflightCapture('k')
    expect(rec).not.toBeNull()
    expect(rec!.mimeType).toBe('audio/webm;codecs=opus')
    expect(rec!.startedAt).toBe(1000)
    expect(rec!.durationMs).toBe(30_000)
    expect(rec!.chunks.map((c) => Array.from(new Uint8Array(c)))).toEqual([[1, 2], [3], [4, 5]])
    expect(rec!.updatedAt).toBeGreaterThan(0)
  })

  it('reset starts a fresh record instead of extending an older interrupted take', async () => {
    await appendInflightChunk('k', meta(10_000), bytes(9), true)
    await appendInflightChunk('k', meta(5_000), bytes(1), true)
    const rec = await getInflightCapture('k')
    expect(rec!.chunks).toHaveLength(1)
    expect(rec!.durationMs).toBe(5_000)
  })

  it('keeps one record per key and clears only the requested one', async () => {
    await appendInflightChunk('a', meta(1), bytes(1), true)
    await appendInflightChunk('b', meta(2), bytes(2), true)
    await deleteInflightCapture('a')
    expect(await getInflightCapture('a')).toBeNull()
    expect(await getInflightCapture('b')).not.toBeNull()
  })

  it('upgrading a v1 database keeps the pending store and its data', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('xtimator-capture', 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('pending', { keyPath: 'key' })
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('pending', 'readwrite')
        tx.objectStore('pending').put({
          key: 'k',
          buffer: bytes(7, 7),
          mimeType: 'audio/mp4',
          durationSeconds: 12,
          createdAt: Date.now(),
        })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })

    // First call through the app code upgrades the database to v2.
    expect(await getInflightCapture('k')).toBeNull()
    const pending = await getPendingCapture('k')
    expect(pending?.durationSeconds).toBe(12)
    expect(new Uint8Array(pending!.buffer)).toEqual(new Uint8Array([7, 7]))
    expect(await appendInflightChunk('k', meta(1), bytes(1), true)).toBe(true)
  })

  it('never throws when IndexedDB is unavailable or throws', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await appendInflightChunk('k', meta(1), bytes(1), true)).toBe(false)
    expect(await getInflightCapture('k')).toBeNull()
    await expect(deleteInflightCapture('k')).resolves.toBeUndefined()

    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('blocked')
      },
    })
    expect(await appendInflightChunk('k', meta(1), bytes(1))).toBe(false)
    expect(await getInflightCapture('k')).toBeNull()
    await expect(deleteInflightCapture('k')).resolves.toBeUndefined()
  })
})
