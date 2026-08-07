/**
 * Phase 191 Plan 01 — MIG-02: coverage for scripts/r2-migrate.ts's source
 * enumeration and comparison engine. Zero real credentials, zero network
 * calls — every StorageProvider is a hand-rolled fake local to this file.
 */
import { describe, it, expect } from 'vitest'
import type { ListedObject, ListOptions, StorageProvider } from '@/lib/storage'

/**
 * Hand-rolled fake StorageProvider. Every method throws by default so an
 * unexpected call (one the test didn't intend to exercise) fails loudly
 * instead of resolving to a misleading value; tests override only the
 * methods they need.
 */
function fakeStorage(overrides: Partial<StorageProvider>): StorageProvider {
  return {
    async upload() {
      throw new Error('fakeStorage: upload not implemented in this test')
    },
    async download() {
      throw new Error('fakeStorage: download not implemented in this test')
    },
    async getSignedUrl() {
      throw new Error('fakeStorage: getSignedUrl not implemented in this test')
    },
    getPublicUrl() {
      throw new Error('fakeStorage: getPublicUrl not implemented in this test')
    },
    async delete() {
      throw new Error('fakeStorage: delete not implemented in this test')
    },
    async list() {
      throw new Error('fakeStorage: list not implemented in this test')
    },
    ...overrides,
  }
}

function file(name: string): ListedObject {
  return { name, isFolder: false }
}

function folder(name: string): ListedObject {
  return { name, isFolder: true }
}

describe('r2-migrate: module import has no side effects', () => {
  it('importing the module performs no storage call', async () => {
    const mod = await import('../../../scripts/r2-migrate')
    expect(mod.MIGRATION_BUCKETS).toEqual(['audio', 'photos', 'pdfs', 'logos', 'platform-brand'])
  })
})

describe('MIGRATION_BUCKETS', () => {
  it('is exactly the five provisioned buckets', async () => {
    const { MIGRATION_BUCKETS } = await import('../../../scripts/r2-migrate')
    expect(MIGRATION_BUCKETS).toEqual(['audio', 'photos', 'pdfs', 'logos', 'platform-brand'])
  })
})

describe('walkSupabaseBucket', () => {
  it('flat bucket: two file entries -> yields exactly those two keys, unprefixed', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(bucket, prefix) {
        expect(bucket).toBe('logos')
        expect(prefix).toBeUndefined()
        return [file('a.png'), file('b.png')]
      },
    })

    const keys = await walkSupabaseBucket(storage, 'logos')

    expect(keys).toEqual(['a.png', 'b.png'])
  })

  it('nested bucket: recurses into a folder placeholder, joins keys with /, never duplicates the parent prefix', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(_bucket, prefix) {
        if (prefix === undefined) {
          return [file('root.jpg'), folder('company-uuid')]
        }
        if (prefix === 'company-uuid') {
          return [file('a.jpg'), file('b.jpg')]
        }
        throw new Error(`unexpected prefix: ${String(prefix)}`)
      },
    })

    const keys = await walkSupabaseBucket(storage, 'photos')

    expect(keys).toEqual(['root.jpg', 'company-uuid/a.jpg', 'company-uuid/b.jpg'])
  })

  it('folder placeholders are never emitted as objects, at any depth', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(_bucket, prefix) {
        if (prefix === undefined) return [folder('company-uuid')]
        if (prefix === 'company-uuid') return [folder('photos'), file('x.jpg')]
        if (prefix === 'company-uuid/photos') return [file('y.jpg')]
        throw new Error(`unexpected prefix: ${String(prefix)}`)
      },
    })

    const keys = await walkSupabaseBucket(storage, 'photos')

    expect(keys).not.toContain('company-uuid')
    expect(keys).not.toContain('company-uuid/photos')
  })

  it('two-level nesting is not hard-coded to one level', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(_bucket, prefix) {
        if (prefix === undefined) return [folder('company-uuid')]
        if (prefix === 'company-uuid') return [folder('photos')]
        if (prefix === 'company-uuid/photos') return [file('x.jpg')]
        throw new Error(`unexpected prefix: ${String(prefix)}`)
      },
    })

    const keys = await walkSupabaseBucket(storage, 'photos')

    expect(keys).toEqual(['company-uuid/photos/x.jpg'])
  })

  it('paging: two full pages then a short page concatenates all three pages', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => file(`obj-${start + i}.jpg`))

    const storage = fakeStorage({
      async list(_bucket, _prefix, opts?: ListOptions) {
        const offset = opts?.offset ?? 0
        if (offset === 0) return page(0, 100)
        if (offset === 100) return page(100, 100)
        if (offset === 200) return page(200, 5)
        throw new Error(`unexpected offset: ${offset}`)
      },
    })

    const keys = await walkSupabaseBucket(storage, 'photos')

    expect(keys).toHaveLength(205)
    expect(keys[0]).toBe('obj-0.jpg')
    expect(keys[204]).toBe('obj-204.jpg')
  })

  it('paging guard: full pages past MAX_PAGES throws naming the bucket and prefix', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list() {
        return Array.from({ length: 100 }, (_, i) => file(`o-${i}`))
      },
    })

    await expect(walkSupabaseBucket(storage, 'photos', 'deep/prefix')).rejects.toThrow(
      /photos/,
    )
    await expect(walkSupabaseBucket(storage, 'photos', 'deep/prefix')).rejects.toThrow(
      /deep\/prefix/,
    )
  })

  it('.emptyFolderPlaceholder entries are real objects (isFolder false) and are included, not filtered', async () => {
    const { walkSupabaseBucket } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(_bucket, prefix) {
        if (prefix === undefined) return [folder('company-uuid')]
        if (prefix === 'company-uuid') return [file('.emptyFolderPlaceholder')]
        throw new Error(`unexpected prefix: ${String(prefix)}`)
      },
    })

    const keys = await walkSupabaseBucket(storage, 'photos')

    expect(keys).toContain('company-uuid/.emptyFolderPlaceholder')
  })
})

describe('enumerateSource', () => {
  it('list() rejecting for one bucket propagates — does not swallow, does not return a partial-looking success', async () => {
    const { enumerateSource, MIGRATION_BUCKETS } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(bucket) {
        if (bucket === 'pdfs') throw new Error('list boom')
        return []
      },
    })

    await expect(enumerateSource(storage, MIGRATION_BUCKETS)).rejects.toThrow('list boom')
  })

  it('returns a flat array across all buckets in bucket order, plus a per-bucket count map', async () => {
    const { enumerateSource, MIGRATION_BUCKETS } = await import('../../../scripts/r2-migrate')
    const storage = fakeStorage({
      async list(bucket, prefix) {
        if (prefix !== undefined) return []
        if (bucket === 'audio') return [file('a.mp3')]
        if (bucket === 'photos') return [file('p1.jpg'), file('p2.jpg')]
        return []
      },
    })

    const { objects, countsByBucket } = await enumerateSource(storage, MIGRATION_BUCKETS)

    expect(objects).toEqual([
      { bucket: 'audio', key: 'a.mp3' },
      { bucket: 'photos', key: 'p1.jpg' },
      { bucket: 'photos', key: 'p2.jpg' },
    ])
    expect(countsByBucket).toEqual({
      audio: 1,
      photos: 2,
      pdfs: 0,
      logos: 0,
      'platform-brand': 0,
    })
  })
})

describe('readSourceObject', () => {
  it('size comes from the downloaded blob byte length, contentType from blob.type — not from a listing', async () => {
    const { readSourceObject } = await import('../../../scripts/r2-migrate')
    const bytes = new Uint8Array(12)
    const blob = {
      type: 'image/jpeg',
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Blob

    const storage = fakeStorage({
      async download(bucket, key) {
        expect(bucket).toBe('photos')
        expect(key).toBe('platform/1784854705622-kvwo24')
        return blob
      },
    })

    const result = await readSourceObject(storage, 'photos', 'platform/1784854705622-kvwo24')

    expect(result).toMatchObject({
      bucket: 'photos',
      key: 'platform/1784854705622-kvwo24',
      size: 12,
      contentType: 'image/jpeg',
    })
    expect(result.bytes).toHaveLength(12)
  })
})

describe('normalizeContentType', () => {
  it('lowercases', async () => {
    const { normalizeContentType } = await import('../../../scripts/r2-migrate')
    expect(normalizeContentType('Image/JPEG')).toBe('image/jpeg')
  })

  it('strips charset/parameters', async () => {
    const { normalizeContentType } = await import('../../../scripts/r2-migrate')
    expect(normalizeContentType('text/plain;charset=UTF-8')).toBe('text/plain')
  })

  it('undefined -> empty string', async () => {
    const { normalizeContentType } = await import('../../../scripts/r2-migrate')
    expect(normalizeContentType(undefined)).toBe('')
  })

  it('empty string -> empty string', async () => {
    const { normalizeContentType } = await import('../../../scripts/r2-migrate')
    expect(normalizeContentType('')).toBe('')
  })
})

describe('compareObject', () => {
  it('destination null -> missing', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.jpg', bytes: new Uint8Array(), size: 10, contentType: 'image/jpeg' }

    const result = compareObject(source, null)

    expect(result.status).toBe('missing')
    expect(result.destination).toBeNull()
  })

  it('size differs -> size-mismatch, even when content type matches', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.jpg', bytes: new Uint8Array(), size: 10, contentType: 'image/jpeg' }

    const result = compareObject(source, { size: 11, contentType: 'image/jpeg' })

    expect(result.status).toBe('size-mismatch')
  })

  it('size equal, normalized content type differs -> content-type-mismatch', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.jpg', bytes: new Uint8Array(), size: 10, contentType: 'image/jpeg' }

    const result = compareObject(source, { size: 10, contentType: 'image/png' })

    expect(result.status).toBe('content-type-mismatch')
  })

  it('both equal -> match', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.jpg', bytes: new Uint8Array(), size: 10, contentType: 'image/jpeg' }

    const result = compareObject(source, { size: 10, contentType: 'image/jpeg' })

    expect(result.status).toBe('match')
  })

  it('right bytes but destination application/octet-stream against source image/jpeg -> content-type-mismatch, NOT match (the extensionless-key failure mode)', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'platform-brand', key: 'platform/1784854705622-kvwo24', bytes: new Uint8Array(), size: 2048, contentType: 'image/jpeg' }

    const result = compareObject(source, { size: 2048, contentType: 'application/octet-stream' })

    expect(result.status).toBe('content-type-mismatch')
  })

  it('source content type unknown, destination application/octet-stream -> unknown-source-content-type (WARN, not a failure, not a match)', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.bin', bytes: new Uint8Array(), size: 5, contentType: '' }

    const result = compareObject(source, { size: 5, contentType: 'application/octet-stream' })

    expect(result.status).toBe('unknown-source-content-type')
  })

  it('source content type unknown, destination differs from application/octet-stream -> content-type-mismatch', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.bin', bytes: new Uint8Array(), size: 5, contentType: '' }

    const result = compareObject(source, { size: 5, contentType: 'text/plain' })

    expect(result.status).toBe('content-type-mismatch')
  })

  it('detail string always names both observed values', async () => {
    const { compareObject } = await import('../../../scripts/r2-migrate')
    const source = { bucket: 'photos', key: 'x.jpg', bytes: new Uint8Array(), size: 10, contentType: 'image/jpeg' }

    const result = compareObject(source, { size: 11, contentType: 'image/png' })

    expect(result.detail).toContain('10')
    expect(result.detail).toContain('11')
  })
})

describe('formatMigrationReport', () => {
  it('renders one line per object prefixed with the row label, bucket, key', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { text } = formatMigrationReport(
      [{ label: 'MATCH', bucket: 'logos', key: 'a.png', detail: 'size=10 contentType="image/png"' }],
      { logos: { source: 1, destination: 1 } },
    )

    expect(text).toContain('[MATCH] logos/a.png')
  })

  it('renders per-bucket count lines in the shape bucket: source=N destination=M', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { text } = formatMigrationReport([], { photos: { source: 3, destination: 2 } })

    expect(text).toContain('photos: source=3 destination=2')
  })

  it('a single FAIL row flips allPassed to false', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { allPassed } = formatMigrationReport(
      [
        { label: 'MATCH', bucket: 'logos', key: 'a.png', detail: 'ok' },
        { label: 'FAIL', bucket: 'photos', key: 'b.jpg', detail: 'boom' },
      ],
      {},
    )

    expect(allPassed).toBe(false)
  })

  it('COPIED, WARN, and EXTRA rows do not flip allPassed to false', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { allPassed } = formatMigrationReport(
      [
        { label: 'MATCH', bucket: 'logos', key: 'a.png', detail: 'ok' },
        { label: 'COPIED', bucket: 'logos', key: 'b.png', detail: 'ok' },
        { label: 'WARN', bucket: 'photos', key: 'c.bin', detail: 'unknown source content type' },
        { label: 'EXTRA', bucket: 'photos', key: 'd.jpg', detail: 'destination only' },
      ],
      {},
    )

    expect(allPassed).toBe(true)
  })

  it('a WARN row renders distinctly from a MATCH row — SKIPPED-is-not-a-PASS discipline', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { text } = formatMigrationReport(
      [{ label: 'WARN', bucket: 'photos', key: 'c.bin', detail: 'unknown source content type' }],
      {},
    )

    expect(text).toContain('[WARN] photos/c.bin')
    expect(text).not.toContain('[MATCH] photos/c.bin')
  })

  it('a report containing only matches plus one EXTRA still returns allPassed: true, and the extra appears in the text', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { text, allPassed } = formatMigrationReport(
      [
        { label: 'MATCH', bucket: 'logos', key: 'a.png', detail: 'ok' },
        { label: 'EXTRA', bucket: 'photos', key: 'orphan.jpg', detail: 'destination only' },
      ],
      {},
    )

    expect(allPassed).toBe(true)
    expect(text).toContain('[EXTRA] photos/orphan.jpg')
  })

  it('the summary line and verdict reflect the rows', async () => {
    const { formatMigrationReport } = await import('../../../scripts/r2-migrate')
    const { text } = formatMigrationReport(
      [
        { label: 'MATCH', bucket: 'logos', key: 'a.png', detail: 'ok' },
        { label: 'FAIL', bucket: 'photos', key: 'b.jpg', detail: 'boom' },
      ],
      {},
    )

    expect(text).toContain('objects=2 match=1 copied=0 warn=0 extra=0 FAIL=1')
    expect(text).toContain('ONE OR MORE OBJECTS FAILED VERIFICATION')
  })
})
