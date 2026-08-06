import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * QUICK-KF2-BE-01..03 — cleanupAudioJob daily cron tests.
 *
 * Mirrors the notification-cleanup.test.ts pattern (Phase 67/77).
 *
 * Contract under test (matches runCleanupAudio in lib/inngest/functions/cleanup-audio.ts):
 *   - SELECT recordings WHERE storage_path IS NOT NULL AND created_at < (now - 7 days)
 *   - For each row, call serverStorage(svc).delete('audio', storage_path) (Phase 188 PROV-01 seam)
 *   - On success: UPDATE recordings SET storage_path = NULL WHERE id = row.id
 *   - On per-file failure: continue loop, increment errors counter
 *   - Returns { deleted: number; errors: number }
 *   - cleanupAudioJob: id 'cleanup-audio', cron '0 4 * * *', body wrapped in step.run('delete-stale-audio-files', ...)
 *   - app/api/inngest/route.ts registers cleanupAudioJob in the serve() functions array
 */

// Mock serverStorage so we can assert delete() calls without touching real storage.
const mockStorageDelete = vi.fn()
vi.mock('@/lib/storage/server', () => ({
  serverStorage: vi.fn(() => ({
    delete: mockStorageDelete,
  })),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { runCleanupAudio, cleanupAudioJob } from '@/lib/inngest/functions/cleanup-audio'

type SelectChain = {
  select: ReturnType<typeof vi.fn>
  lt: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
}

type UpdateChain = {
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
}

function makeSvc(opts: {
  rows: Array<{ id: string; storage_path: string }> | null
  selectError?: { message: string } | null
}) {
  const updateCalls: Array<{ patch: Record<string, unknown>; id: string }> = []

  const selectChain: Record<string, unknown> = {}
  selectChain.lt = vi.fn().mockReturnValue(selectChain)
  selectChain.not = vi.fn().mockResolvedValue({
    data: opts.rows,
    error: opts.selectError ?? null,
  })

  function fromImpl(_table: string) {
    return {
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn((patch: Record<string, unknown>) => ({
        eq: vi.fn((_col: string, val: string) => {
          updateCalls.push({ patch, id: val })
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    }
  }

  return {
    from: vi.fn().mockImplementation(fromImpl),
    __updateCalls: updateCalls,
    __selectChain: selectChain as SelectChain,
  }
}

describe('QUICK-KF2-BE-01..03: runCleanupAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStorageDelete.mockReset()
  })

  it('happy path: deletes 3 stale audio files, nulls storage_path on each row, returns { deleted: 3, errors: 0 }', async () => {
    const rows = [
      { id: 'rec-1', storage_path: 'co/proj/rec-1.webm' },
      { id: 'rec-2', storage_path: 'co/proj/rec-2.webm' },
      { id: 'rec-3', storage_path: 'co/proj/rec-3.webm' },
    ]
    const svc = makeSvc({ rows })
    mockStorageDelete.mockResolvedValue(undefined)

    const result = await runCleanupAudio(svc as never)

    expect(result).toEqual({ deleted: 3, errors: 0 })

    // Storage delete called per row in the 'audio' bucket
    expect(mockStorageDelete).toHaveBeenCalledTimes(3)
    expect(mockStorageDelete).toHaveBeenNthCalledWith(1, 'audio', 'co/proj/rec-1.webm')
    expect(mockStorageDelete).toHaveBeenNthCalledWith(2, 'audio', 'co/proj/rec-2.webm')
    expect(mockStorageDelete).toHaveBeenNthCalledWith(3, 'audio', 'co/proj/rec-3.webm')

    // recordings table queried for stale rows
    expect(svc.from).toHaveBeenCalledWith('recordings')

    // 7-day cutoff applied via .lt('created_at', isoString)
    expect(svc.__selectChain.lt).toHaveBeenCalledWith('created_at', expect.any(String))
    const cutoffArg = (svc.__selectChain.lt as ReturnType<typeof vi.fn>).mock.calls[0]![1]
    const cutoff = new Date(cutoffArg as string).getTime()
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000)

    // .not('storage_path', 'is', null) filter applied so rows with NULL storage_path are skipped at the query level
    expect(svc.__selectChain.not).toHaveBeenCalledWith('storage_path', 'is', null)

    // Each row's storage_path is nulled (recording row + transcript persist)
    expect(svc.__updateCalls).toHaveLength(3)
    for (const call of svc.__updateCalls) {
      expect(call.patch).toEqual({ storage_path: null })
    }
    expect(svc.__updateCalls.map((c) => c.id).sort()).toEqual(['rec-1', 'rec-2', 'rec-3'])
  })

  it('skip-null filter: query uses .not("storage_path", "is", null) so rows with NULL storage_path are excluded', async () => {
    const svc = makeSvc({ rows: [] })

    const result = await runCleanupAudio(svc as never)

    expect(result).toEqual({ deleted: 0, errors: 0 })
    expect(svc.__selectChain.not).toHaveBeenCalledWith('storage_path', 'is', null)
    expect(mockStorageDelete).not.toHaveBeenCalled()
  })

  it('per-file failure tolerated: 2nd row delete throws, loop continues; returns { deleted: 2, errors: 1 }', async () => {
    const rows = [
      { id: 'rec-a', storage_path: 'co/proj/a.webm' },
      { id: 'rec-b', storage_path: 'co/proj/b.webm' },
      { id: 'rec-c', storage_path: 'co/proj/c.webm' },
    ]
    const svc = makeSvc({ rows })

    mockStorageDelete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage 500'))
      .mockResolvedValueOnce(undefined)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runCleanupAudio(svc as never)

    expect(result).toEqual({ deleted: 2, errors: 1 })
    expect(mockStorageDelete).toHaveBeenCalledTimes(3)

    // Only successful rows had storage_path nulled (the failing row stays as-is so we retry next day)
    expect(svc.__updateCalls.map((c) => c.id).sort()).toEqual(['rec-a', 'rec-c'])
    for (const call of svc.__updateCalls) {
      expect(call.patch).toEqual({ storage_path: null })
    }

    warn.mockRestore()
  })

  it('returns { deleted: 0, errors: 0 } when SELECT returns an error (best-effort, no throw)', async () => {
    const svc = makeSvc({ rows: null, selectError: { message: 'rls denied' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runCleanupAudio(svc as never)

    expect(result).toEqual({ deleted: 0, errors: 0 })
    expect(mockStorageDelete).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('QUICK-KF2-BE-01: cleanupAudioJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "cleanup-audio" and cron "0 4 * * *"', () => {
    const fn = cleanupAudioJob as unknown as FnInternals
    expect(fn.opts.id).toBe('cleanup-audio')
    expect(fn.opts.triggers).toBeDefined()
    expect(fn.opts.triggers).toContainEqual({ cron: '0 4 * * *' })
  })

  it('function body wraps the cleanup in step.run("delete-stale-audio-files", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/cleanup-audio.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]delete-stale-audio-files['"]/)
    // No direct supabase.storage references — must use the storage abstraction
    expect(src).not.toMatch(/supabase\.storage/)
  })
})

describe('QUICK-KF2-BE-01: cleanupAudioJob is registered in serve()', () => {
  it('app/api/inngest/route.ts imports cleanupAudioJob and includes it in the functions array', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'app/api/inngest/route.ts'),
      'utf8',
    )
    expect(src).toMatch(/cleanupAudioJob/)
  })
})
