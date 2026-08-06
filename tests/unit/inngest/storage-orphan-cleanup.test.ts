import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 169-02 (CAPT-04) — storageOrphanCleanupJob tests.
 *
 * Mirrors the runCleanupAudio(svc)/notification-cleanup pure-function
 * pattern: the sweep logic (runStorageOrphanCleanup) takes an injected
 * service client + StorageProvider so it's testable without an Inngest
 * harness or real Supabase Storage. Both are faked here.
 *
 * Cases (a)-(h) are the plan's required regression set — (d) and (e) are the
 * Opus-blocker locks (WhatsApp audio / price-book images must NEVER be
 * enumerated or deleted, regardless of reference state).
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { runStorageOrphanCleanup, storageOrphanCleanupJob } from '@/lib/inngest/functions/storage-orphan-cleanup'
import type { StorageProvider } from '@/lib/storage'

const NOW = new Date('2026-07-17T12:00:00Z').getTime()
const OLD_ISO = new Date(NOW - 48 * 60 * 60 * 1000).toISOString() // 48h old
const FRESH_ISO = new Date(NOW - 60 * 60 * 1000).toISOString() // 1h old

// ── Fake StorageProvider ──────────────────────────────────────────────────

interface FakeEntry {
  name: string
  isFolder?: boolean
  updatedAt?: string
  createdAt?: string
}

/**
 * Bucket-scoped fake data — audio and photos sweeps run against
 * INDEPENDENT trees (this cron always sweeps both buckets every run, so a
 * test that only sets up 'audio' must see an empty walk for 'photos', not
 * the audio fixture reused across buckets).
 */
function makeStorage(
  data: Partial<Record<'audio' | 'photos', Record<string, FakeEntry[]>>>,
  opts?: { throwOnPrefix?: string[] },
) {
  const listCalls: Array<{ bucket: string; prefix: string; limit?: number; offset?: number }> = []
  const deleteCalls: Array<{ bucket: string; path: string }> = []

  const list = vi.fn(
    async (
      bucket: string,
      prefix?: string,
      listOpts?: { limit?: number; offset?: number },
    ) => {
      const key = prefix ?? ''
      listCalls.push({ bucket, prefix: key, limit: listOpts?.limit, offset: listOpts?.offset })
      if (opts?.throwOnPrefix?.includes(key)) {
        throw new Error(`simulated list failure for ${key}`)
      }
      const bucketData = data[bucket as 'audio' | 'photos'] ?? {}
      const all = bucketData[key] ?? []
      const limit = listOpts?.limit ?? 100
      const offset = listOpts?.offset ?? 0
      return all.slice(offset, offset + limit).map((e) => ({
        name: e.name,
        isFolder: e.isFolder ?? false,
        updatedAt: e.updatedAt,
        createdAt: e.createdAt,
      }))
    },
  )

  const del = vi.fn(async (bucket: string, path: string) => {
    deleteCalls.push({ bucket, path })
  })

  const provider = {
    upload: vi.fn(),
    download: vi.fn(),
    getSignedUrl: vi.fn(),
    getPublicUrl: vi.fn(),
    delete: del,
    list,
  } as unknown as StorageProvider

  return { provider, listCalls, deleteCalls }
}

// ── Fake service client (recordings/photos reference checks) ────────────

function makeSvc(resolver: (table: string, key: string, callIndex: number) => boolean) {
  const eqCalls: Array<{ table: string; key: string }> = []
  const callCounts = new Map<string, number>()

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn((_col: string, key: string) => {
        const countKey = `${table}:${key}`
        const idx = callCounts.get(countKey) ?? 0
        callCounts.set(countKey, idx + 1)
        eqCalls.push({ table, key })
        const matched = resolver(table, key, idx)
        return Promise.resolve({ count: matched ? 1 : 0, error: null })
      }),
    })),
  }))

  return { from, eqCalls }
}

const alwaysUnreferenced = () => false
const alwaysReferenced = () => true

describe('CAPT-04: runStorageOrphanCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('(a) 3-level orphan >24h with no row is deleted; full-key rejoin (never a bare leaf); folder placeholders are never treated as deletable', async () => {
    const { provider, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [
          { name: 'orphan.webm', isFolder: false, updatedAt: OLD_ISO },
          // A folder placeholder mixed in at the "files" level — must never
          // be treated as a deletable object even though it's old.
          { name: 'weird-subfolder', isFolder: true, updatedAt: OLD_ISO },
        ],
      },
    })
    const svc = makeSvc(alwaysUnreferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([{ bucket: 'audio', path: 'co1/proj1/orphan.webm' }])
    // The row-check received the FULL rejoined key, never the bare leaf name.
    expect(svc.eqCalls.some((c) => c.table === 'recordings' && c.key === 'co1/proj1/orphan.webm')).toBe(true)
    expect(svc.eqCalls.some((c) => c.key === 'orphan.webm')).toBe(false)
    expect(result.audio).toEqual({ bucket: 'audio', scanned: 1, skippedProtectedPrefix: 0, deleted: 1 })
  })

  it('(b) object with a matching recordings row is NOT deleted', async () => {
    const { provider, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [{ name: 'referenced.webm', isFolder: false, updatedAt: OLD_ISO }],
      },
    })
    const svc = makeSvc(alwaysReferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    expect(result.audio.deleted).toBe(0)
    expect(result.audio.scanned).toBe(1)
  })

  it('(c) fresh object <24h is NOT deleted', async () => {
    const { provider, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [{ name: 'fresh.webm', isFolder: false, updatedAt: FRESH_ISO }],
      },
    })
    const svc = makeSvc(alwaysUnreferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    expect(result.audio.deleted).toBe(0)
  })

  it('(d) {companyId}/whatsapp/x.ogg is NEVER enumerated for deletion, even with no recordings.storage_path match', async () => {
    const { provider, listCalls, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'whatsapp', isFolder: true }],
        // Deliberately present so that IF the walk ever listed into whatsapp/,
        // it would find a juicy, old, unreferenced-looking orphan. It must
        // never get here.
        'co1/whatsapp': [{ name: 'x.ogg', isFolder: false, updatedAt: OLD_ISO }],
      },
    })
    const svc = makeSvc(alwaysUnreferenced) // no recordings row anywhere — "no match" by design

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    // Never enumerated — no list() call was ever made with the protected prefix.
    expect(listCalls.some((c) => c.prefix === 'co1/whatsapp')).toBe(false)
    expect(result.audio).toEqual({ bucket: 'audio', scanned: 0, skippedProtectedPrefix: 1, deleted: 0 })
  })

  it('(e) {companyId}/price-book/y.jpg is NEVER deleted, even with no photos row', async () => {
    const { provider, listCalls, deleteCalls } = makeStorage({
      photos: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'price-book', isFolder: true }],
        'co1/price-book': [{ name: 'y.jpg', isFolder: false, updatedAt: OLD_ISO }],
      },
    })
    const svc = makeSvc(alwaysUnreferenced) // no photos row — price-book images never get one

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    expect(listCalls.some((c) => c.prefix === 'co1/price-book')).toBe(false)
    expect(result.photos).toEqual({ bucket: 'photos', scanned: 0, skippedProtectedPrefix: 1, deleted: 0 })
  })

  it('(f) >100 files under one folder: paging covers all (100 then remainder)', async () => {
    const files: FakeEntry[] = Array.from({ length: 105 }, (_, i) => ({
      name: `file-${i}.webm`,
      isFolder: false,
      updatedAt: OLD_ISO,
    }))
    const { provider, listCalls, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': files,
      },
    })
    const svc = makeSvc(alwaysUnreferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toHaveLength(105)
    expect(result.audio.scanned).toBe(105)
    expect(result.audio.deleted).toBe(105)
    // Paging: at least two pages were requested for the file-level prefix
    // (offset 0 returning a full 100-page, then offset 100 for the remainder).
    const filePageCalls = listCalls.filter((c) => c.prefix === 'co1/proj1')
    expect(filePageCalls.some((c) => c.offset === 0)).toBe(true)
    expect(filePageCalls.some((c) => c.offset === 100)).toBe(true)
  })

  it('(g) list error on one company prefix: sweep continues to the next company, summary emitted', async () => {
    const { provider, deleteCalls } = makeStorage(
      {
        audio: {
          '': [
            { name: 'co1', isFolder: true },
            { name: 'co2', isFolder: true },
          ],
          // co1's level-2 listing throws — co2 must still be processed.
          co2: [{ name: 'proj2', isFolder: true }],
          'co2/proj2': [{ name: 'orphan2.webm', isFolder: false, updatedAt: OLD_ISO }],
        },
      },
      { throwOnPrefix: ['co1'] },
    )
    const svc = makeSvc(alwaysUnreferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([{ bucket: 'audio', path: 'co2/proj2/orphan2.webm' }])
    expect(result.audio).toEqual({ bucket: 'audio', scanned: 1, skippedProtectedPrefix: 0, deleted: 1 })
  })

  it('(i) Phase 188 PROV-01: S3-shaped entry with neither updatedAt nor createdAt is treated as unknown age and NEVER deleted (fail-closed)', async () => {
    // The S3 StorageProvider (lib/storage/s3-provider.ts) never populates
    // createdAt, and this simulates the pathological case where updatedAt is
    // also absent — ageMsOf() must return null (not "very old"), so the
    // object is skipped rather than deleted. See the AGE-gate note in
    // lib/inngest/functions/storage-orphan-cleanup.ts's header.
    const { provider, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [{ name: 'unknown-age.webm' /* no updatedAt, no createdAt */ }],
      },
    })
    const svc = makeSvc(alwaysUnreferenced)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    expect(result.audio.deleted).toBe(0)
    // Still scanned (it reached the leaf/age check) — just never crossed the
    // age threshold because the threshold itself is unknowable.
    expect(result.audio.scanned).toBe(1)
  })

  it('(h) defensive re-check: a row appears between scan and delete — NOT deleted', async () => {
    const { provider, deleteCalls } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [{ name: 'racy.webm', isFolder: false, updatedAt: OLD_ISO }],
      },
    })
    // callIndex 0 = the initial reference check (no row yet) -> false
    // callIndex 1 = the defensive re-check immediately before delete
    //   (a row was inserted in between) -> true
    const svc = makeSvc((_table, _key, callIndex) => callIndex >= 1)

    const result = await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(deleteCalls).toEqual([])
    expect(result.audio.deleted).toBe(0)
    // Both the reference check AND the defensive re-check ran for this key.
    const callsForKey = svc.eqCalls.filter((c) => c.key === 'co1/proj1/racy.webm')
    expect(callsForKey.length).toBeGreaterThanOrEqual(2)
  })

  it('summary log is emitted with {bucket, scanned, skippedProtectedPrefix, deleted} shape', async () => {
    const { provider } = makeStorage({
      audio: {
        '': [{ name: 'co1', isFolder: true }],
        co1: [{ name: 'proj1', isFolder: true }],
        'co1/proj1': [{ name: 'orphan.webm', isFolder: false, updatedAt: OLD_ISO }],
      },
    })
    const svc = makeSvc(alwaysUnreferenced)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runStorageOrphanCleanup(svc as never, provider, { now: NOW })

    expect(log).toHaveBeenCalledWith(
      '[storage-orphan-cleanup] summary:',
      expect.objectContaining({ bucket: 'audio', scanned: expect.any(Number), skippedProtectedPrefix: expect.any(Number), deleted: expect.any(Number) }),
    )
    expect(log).toHaveBeenCalledWith(
      '[storage-orphan-cleanup] summary:',
      expect.objectContaining({ bucket: 'photos' }),
    )
    log.mockRestore()
  })
})

describe('CAPT-04: storageOrphanCleanupJob (Inngest function config)', () => {
  type FnInternals = {
    opts: {
      id: string
      triggers?: Array<{ cron?: string; event?: string }>
    }
  }

  it('is created with id "storage-orphan-cleanup" and a daily cron trigger', () => {
    const fn = storageOrphanCleanupJob as unknown as FnInternals
    expect(fn.opts.id).toBe('storage-orphan-cleanup')
    expect(fn.opts.triggers).toBeDefined()
    expect(fn.opts.triggers?.[0]?.cron).toMatch(/^\d+ \d+ \* \* \*$/)
  })

  it('function body wraps the sweep in step.run(...) and never calls supabase.storage directly', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/storage-orphan-cleanup.ts'),
      'utf8',
    )
    expect(src).toMatch(/step\.run\(['"]sweep-storage-orphans['"]/)
    expect(src).not.toMatch(/supabase\.storage/)
  })
})
