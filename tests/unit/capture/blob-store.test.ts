/**
 * Phase 169 Plan 01 — CAPT-03: blob-store (hand-rolled IDB wrapper) tests.
 *
 * fake-indexeddb backs the happy-path roundtrip; the fail-soft cases stub
 * `globalThis.indexedDB` directly (undefined, or a throwing `.open`) to prove
 * every exported function resolves to its soft value instead of throwing —
 * the whole point of this module (audit F3: storage unavailability must
 * never break capture).
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { savePendingCapture, getPendingCapture, deletePendingCapture, isAvailable, type PendingCapture } from '@/lib/capture/blob-store'

describe('blob-store (CAPT-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isAvailable() reports true when indexedDB exists on the global', () => {
    expect(isAvailable()).toBe(true)
  })

  it('save/get/delete roundtrip preserves the ArrayBuffer bytes + metadata', async () => {
    const buffer = new TextEncoder().encode('hello world').buffer
    const capture: PendingCapture = {
      key: 'popup:project-1',
      buffer,
      mimeType: 'audio/webm',
      durationSeconds: 42,
      createdAt: Date.now(),
    }

    const saved = await savePendingCapture(capture)
    expect(saved).toBe(true)

    const fetched = await getPendingCapture('popup:project-1')
    expect(fetched).not.toBeNull()
    expect(fetched?.mimeType).toBe('audio/webm')
    expect(fetched?.durationSeconds).toBe(42)
    expect(new Uint8Array(fetched!.buffer)).toEqual(new Uint8Array(buffer))

    await deletePendingCapture('popup:project-1')
    const afterDelete = await getPendingCapture('popup:project-1')
    expect(afterDelete).toBeNull()
  })

  it('getPendingCapture returns null for a missing key', async () => {
    const result = await getPendingCapture('does-not-exist')
    expect(result).toBeNull()
  })

  it('fails soft: savePendingCapture resolves false (never throws) when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const saved = await savePendingCapture({
      key: 'x',
      buffer: new ArrayBuffer(0),
      mimeType: 'audio/webm',
      durationSeconds: 1,
      createdAt: Date.now(),
    })
    expect(saved).toBe(false)
  })

  it('fails soft: getPendingCapture resolves null (never throws) when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const result = await getPendingCapture('any-key')
    expect(result).toBeNull()
  })

  it('fails soft: deletePendingCapture resolves (never throws) when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(deletePendingCapture('x')).resolves.toBeUndefined()
  })

  it('fails soft: getPendingCapture resolves null when indexedDB.open throws synchronously (e.g. private-mode)', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('private mode — IDB disabled')
      },
    })
    const result = await getPendingCapture('any-key')
    expect(result).toBeNull()
  })
})
