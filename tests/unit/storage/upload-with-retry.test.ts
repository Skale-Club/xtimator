/**
 * Phase 169 Plan 01 — CAPT-01: uploadWithRetry unit tests.
 *
 * Covers the 6 required cases: 2-failure recovery, exhaustion, 4xx terminal,
 * 409-success, abort honor, backoff timing — plus a prerequisite assertion
 * that supabase-provider.ts preserves the thrown error's .status/.statusCode
 * (without which the classification below couldn't work at all).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from '@/lib/storage'
import { uploadWithRetry } from '@/lib/storage/upload-with-retry'
import { createSupabaseStorageProvider } from '@/lib/storage/supabase-provider'

function makeStorage(upload: StorageProvider['upload']): StorageProvider {
  return {
    upload,
    download: vi.fn(),
    getSignedUrl: vi.fn(),
    getPublicUrl: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  }
}

function httpError(status: number, message = 'boom'): Error {
  return Object.assign(new Error(message), { status })
}

function networkError(message = 'Failed to fetch'): TypeError {
  return new TypeError(message)
}

describe('uploadWithRetry (CAPT-01)', () => {
  const blob = new Blob(['x'])

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds after 2 network failures (no status → retryable)', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ path: 'audio/x.webm' })
    const storage = makeStorage(upload)

    const promise = uploadWithRetry(storage, 'audio', 'audio/x.webm', blob)
    // Flush both backoff delays (1000ms, then 2000ms) between the 3 tries.
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    const result = await promise
    expect(result).toEqual({ path: 'audio/x.webm' })
    expect(upload).toHaveBeenCalledTimes(3)
  })

  it('gives up after 3 attempts and throws the last error', async () => {
    const err = networkError('still down')
    const upload = vi.fn().mockRejectedValue(err)
    const storage = makeStorage(upload)

    const promise = uploadWithRetry(storage, 'audio', 'audio/x.webm', blob)
    // Suppress unhandled rejection warnings while advancing timers.
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(promise).rejects.toThrow('still down')
    expect(upload).toHaveBeenCalledTimes(3)
  })

  it('does NOT retry a 4xx (terminal — auth/policy/size)', async () => {
    const err = httpError(400, 'Payload too large')
    const upload = vi.fn().mockRejectedValue(err)
    const storage = makeStorage(upload)

    await expect(uploadWithRetry(storage, 'photos', 'photos/x.jpg', blob)).rejects.toThrow(
      'Payload too large',
    )
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('resolves as SUCCESS on a 409 for the same path (idempotent re-upload), without retrying', async () => {
    const err = httpError(409, 'Duplicate')
    const upload = vi.fn().mockRejectedValue(err)
    const storage = makeStorage(upload)

    const result = await uploadWithRetry(storage, 'audio', 'audio/x.webm', blob)
    expect(result).toEqual({ path: 'audio/x.webm' })
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('honors AbortSignal between attempts — aborting during backoff stops further retries', async () => {
    const upload = vi.fn().mockRejectedValue(networkError())
    const storage = makeStorage(upload)
    const controller = new AbortController()

    const promise = uploadWithRetry(storage, 'audio', 'audio/x.webm', blob, { signal: controller.signal })
    promise.catch(() => {})

    // Let the first attempt fail and enter the 1s backoff sleep, then abort mid-wait.
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await vi.advanceTimersByTimeAsync(1000)

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('backoff delays are 1s / 2s / 4s (exponential, base 1000ms)', async () => {
    const upload = vi.fn().mockRejectedValue(networkError())
    const storage = makeStorage(upload)

    // attempts:4 to exercise all three configured delays in one run.
    const promise = uploadWithRetry(storage, 'audio', 'audio/x.webm', blob, { attempts: 4 })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(upload).toHaveBeenCalledTimes(1) // try 1 failed, now sleeping 1000ms

    await vi.advanceTimersByTimeAsync(999)
    expect(upload).toHaveBeenCalledTimes(1) // not yet — still short of the 1000ms delay
    await vi.advanceTimersByTimeAsync(1)
    expect(upload).toHaveBeenCalledTimes(2) // try 2 fired, failed, now sleeping 2000ms

    await vi.advanceTimersByTimeAsync(1999)
    expect(upload).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(upload).toHaveBeenCalledTimes(3) // try 3 fired, failed, now sleeping 4000ms

    await vi.advanceTimersByTimeAsync(3999)
    expect(upload).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(upload).toHaveBeenCalledTimes(4) // try 4 fired — attempts exhausted

    await expect(promise).rejects.toThrow()
  })

  describe('prerequisite: supabase-provider.ts preserves .status/.statusCode', () => {
    it('the thrown Error carries the StorageError status/statusCode (not discarded)', async () => {
      const fromMock = vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Duplicate', status: 409, statusCode: '409' },
        }),
      })
      const client = { storage: { from: fromMock } } as unknown as SupabaseClient
      const provider = createSupabaseStorageProvider(client)

      await expect(provider.upload('audio', 'audio/x.webm', blob)).rejects.toMatchObject({
        status: 409,
        statusCode: '409',
      })
    })
  })
})
