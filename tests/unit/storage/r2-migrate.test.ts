/**
 * Phase 191 — MIG-01/MIG-02: coverage for scripts/r2-migrate.ts. Plan 01's
 * tests (source enumeration + comparison engine) use hand-rolled fake
 * StorageProviders. Plan 02's tests (destination layer, idempotency,
 * corruption drill, CLI) add `aws-sdk-client-mock` for the R2/S3 side. Zero
 * real credentials, zero network calls anywhere in this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import type { ListedObject, ListOptions, StorageProvider } from '@/lib/storage'
import { createS3StorageProvider } from '@/lib/storage/s3-provider'

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

// ---------------------------------------------------------------------------
// Plan 02 fixtures — R2/S3 side, via aws-sdk-client-mock.
// ---------------------------------------------------------------------------

const FAKE_ENV = {
  S3_ENDPOINT: 'https://fake-account.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'fake-access-key-id',
  S3_SECRET_ACCESS_KEY: 'fake-secret-access-key',
}

const config = {
  endpoint: FAKE_ENV.S3_ENDPOINT,
  region: FAKE_ENV.S3_REGION,
  accessKeyId: FAKE_ENV.S3_ACCESS_KEY_ID,
  secretAccessKey: FAKE_ENV.S3_SECRET_ACCESS_KEY,
  forcePathStyle: true,
}

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  s3Mock.reset()
})

interface FakeSourceObject {
  key: string
  bytes: Uint8Array
  contentType: string
}

/** A fake Supabase StorageProvider serving a flat set of objects in one bucket. */
function sourceStorageWithObjects(bucket: string, objects: FakeSourceObject[]): StorageProvider {
  return fakeStorage({
    async list(b, prefix) {
      if (b !== bucket || prefix !== undefined) return []
      return objects.map((o) => file(o.key))
    },
    async download(b, key) {
      const obj = objects.find((o) => o.key === key)
      if (b !== bucket || !obj) {
        throw new Error(`sourceStorageWithObjects: unexpected download ${b}/${key}`)
      }
      return {
        type: obj.contentType,
        arrayBuffer: async () => obj.bytes.buffer,
      } as unknown as Blob
    },
  })
}

function notFoundError(): Error {
  return Object.assign(new Error('not found'), { name: 'NotFound' })
}

/**
 * `destStorage` and `s3Client` are two separate S3Client instances built
 * from the same fake config — mockClient(S3Client) intercepts by class
 * prototype, so both are captured by the same s3Mock regardless of which
 * one constructed them internally (same pattern as r2-verify.test.ts's
 * verifyRoundTrip tests).
 */
function buildDeps(sourceStorage: StorageProvider) {
  return {
    sourceStorage,
    destStorage: createS3StorageProvider(config),
    s3Client: new S3Client(config),
  }
}

describe('r2-migrate: module import has no side effects', () => {
  it('importing the module performs no storage call', async () => {
    const mod = await import('../../../scripts/r2-migrate')
    expect(mod.MIGRATION_BUCKETS).toEqual(['audio', 'photos', 'pdfs', 'logos', 'platform-brand'])
  })

  it('importing the module performs no S3 call and does not touch process.exit', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.resetModules()
    s3Mock.reset()

    await import('../../../scripts/r2-migrate')

    expect(s3Mock.calls()).toHaveLength(0)
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
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

// ---------------------------------------------------------------------------
// Plan 02 — destination layer, idempotency, corruption drill, CLI.
// ---------------------------------------------------------------------------

describe('headDestinationObject', () => {
  it('HeadObject resolving ContentLength + ContentType -> { size, contentType }', async () => {
    const { headDestinationObject } = await import('../../../scripts/r2-migrate')
    s3Mock
      .on(HeadObjectCommand, { Bucket: 'photos', Key: 'a.jpg' })
      .resolves({ ContentLength: 12, ContentType: 'image/jpeg' })
    const client = new S3Client(config)

    const result = await headDestinationObject(client, 'photos', 'a.jpg')

    expect(result).toEqual({ size: 12, contentType: 'image/jpeg' })
  })

  it('HeadObject rejecting NotFound -> null (absent), not a throw', async () => {
    const { headDestinationObject } = await import('../../../scripts/r2-migrate')
    s3Mock.on(HeadObjectCommand, { Bucket: 'photos', Key: 'missing.jpg' }).rejects(notFoundError())
    const client = new S3Client(config)

    const result = await headDestinationObject(client, 'photos', 'missing.jpg')

    expect(result).toBeNull()
  })

  it('HeadObject rejecting any OTHER error (AccessDenied) -> throws, never read as "absent"', async () => {
    const { headDestinationObject } = await import('../../../scripts/r2-migrate')
    s3Mock
      .on(HeadObjectCommand, { Bucket: 'photos', Key: 'locked.jpg' })
      .rejects(Object.assign(new Error('denied'), { name: 'AccessDenied' }))
    const client = new S3Client(config)

    await expect(headDestinationObject(client, 'photos', 'locked.jpg')).rejects.toThrow(/denied/)
  })
})

describe('copyObject', () => {
  it('uploads the RAW source contentType (never normalized) and the exact body bytes', async () => {
    const { copyObject } = await import('../../../scripts/r2-migrate')
    let putInput: { Bucket?: string; Key?: string; ContentType?: string; Body?: unknown } | undefined
    s3Mock.on(PutObjectCommand).callsFake((input) => {
      putInput = input
      return {}
    })
    const destStorage = createS3StorageProvider(config)
    const bytes = new Uint8Array([1, 2, 3, 4])
    const source = { bucket: 'photos', key: 'a.jpg', bytes, size: 4, contentType: 'image/jpeg' }

    await copyObject(destStorage, source)

    expect(putInput?.Bucket).toBe('photos')
    expect(putInput?.Key).toBe('a.jpg')
    expect(putInput?.ContentType).toBe('image/jpeg')
    expect(new Uint8Array(putInput?.Body as ArrayBufferLike)).toEqual(bytes)
  })
})

describe('migrateBucket / runMigration', () => {
  it('3 source objects, empty destination -> 3 PutObjectCommand calls, 3 [COPIED] rows, allPassed true', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
      { key: 'b.jpg', bytes: new Uint8Array([4, 5, 6]), contentType: 'image/jpeg' },
      { key: 'c.jpg', bytes: new Uint8Array([7, 8, 9]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    const copied = new Set<string>()
    s3Mock.on(HeadObjectCommand).callsFake((input) => {
      const key = input.Key as string
      if (!copied.has(key)) throw notFoundError()
      const obj = objects.find((o) => o.key === key)!
      return { ContentLength: obj.bytes.length, ContentType: obj.contentType }
    })
    s3Mock.on(PutObjectCommand).callsFake((input) => {
      copied.add(input.Key as string)
      return {}
    })
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { rows, counts } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(3)
    expect(rows.filter((r) => r.label === 'COPIED')).toHaveLength(3)
    expect(rows.every((r) => r.label !== 'FAIL')).toBe(true)
    expect(counts).toEqual({ source: 3, destination: 0 })
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('idempotency: destination already matches source for all 3 objects -> ZERO PutObjectCommand calls, 3 [MATCH] rows, allPassed true', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
      { key: 'b.jpg', bytes: new Uint8Array([4, 5, 6]), contentType: 'image/jpeg' },
      { key: 'c.jpg', bytes: new Uint8Array([7, 8, 9]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    s3Mock.on(HeadObjectCommand).callsFake((input) => {
      const obj = objects.find((o) => o.key === input.Key)!
      return { ContentLength: obj.bytes.length, ContentType: obj.contentType }
    })
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: objects.map((o) => ({ Key: o.key })),
      IsTruncated: false,
    })

    const { rows } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0)
    expect(rows.filter((r) => r.label === 'MATCH')).toHaveLength(3)
    expect(rows.every((r) => r.label !== 'FAIL')).toBe(true)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('mixed: 2 already matching + 1 absent -> exactly 1 PutObjectCommand call, for the absent key', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
      { key: 'b.jpg', bytes: new Uint8Array([4, 5, 6]), contentType: 'image/jpeg' },
      { key: 'c.jpg', bytes: new Uint8Array([7, 8, 9]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    const copied = new Set<string>()
    s3Mock.on(HeadObjectCommand).callsFake((input) => {
      const key = input.Key as string
      if (key === 'c.jpg' && !copied.has(key)) throw notFoundError()
      const obj = objects.find((o) => o.key === key)!
      return { ContentLength: obj.bytes.length, ContentType: obj.contentType }
    })
    s3Mock.on(PutObjectCommand).callsFake((input) => {
      copied.add(input.Key as string)
      return {}
    })
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { rows } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    const putCalls = s3Mock.commandCalls(PutObjectCommand)
    expect(putCalls).toHaveLength(1)
    expect(putCalls[0].args[0].input.Key).toBe('c.jpg')
    expect(rows.filter((r) => r.label === 'MATCH')).toHaveLength(2)
    expect(rows.filter((r) => r.label === 'COPIED')).toHaveLength(1)
  })

  it('post-copy re-verification: if the re-read after copy reports a different size, the row is [FAIL] and allPassed is false', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    let headCallCount = 0
    s3Mock.on(HeadObjectCommand).callsFake(() => {
      headCallCount += 1
      if (headCallCount === 1) throw notFoundError()
      // Post-copy re-read reports the WRONG size — the write appeared to
      // succeed but did not land correctly.
      return { ContentLength: 999, ContentType: 'image/jpeg' }
    })
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { rows } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('FAIL')
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1)
  })

  it('size mismatch on an existing destination object -> re-copied (unconditional overwrite), then re-verified -> [COPIED] once the re-read matches', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    let headCallCount = 0
    s3Mock.on(HeadObjectCommand).callsFake(() => {
      headCallCount += 1
      // First read: stale/corrupted destination (wrong size). Second read
      // (post-copy): matches.
      if (headCallCount === 1) return { ContentLength: 1, ContentType: 'image/jpeg' }
      return { ContentLength: 4, ContentType: 'image/jpeg' }
    })
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { rows } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1)
    expect(rows[0].label).toBe('COPIED')
  })

  it('[EXTRA]: a destination-only key (ListObjectsV2) with no source counterpart -> one [EXTRA] row, allPassed stays true, destination count reflects it', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    s3Mock.on(HeadObjectCommand, { Bucket: 'photos', Key: 'a.jpg' }).resolves({
      ContentLength: 3,
      ContentType: 'image/jpeg',
    })
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: 'a.jpg' }, { Key: 'orphan.jpg' }],
      IsTruncated: false,
    })

    const { rows, counts } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: false,
      buckets: ['photos'],
    })

    const extraRows = rows.filter((r) => r.label === 'EXTRA')
    expect(extraRows).toHaveLength(1)
    expect(extraRows[0].key).toBe('orphan.jpg')
    expect(rows.every((r) => r.label !== 'FAIL')).toBe(true)
    expect(counts.destination).toBe(2)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('--verify-only performs ZERO PutObjectCommand calls even when objects are missing/mismatched', async () => {
    const { migrateBucket } = await import('../../../scripts/r2-migrate')
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
      { key: 'b.jpg', bytes: new Uint8Array([4, 5, 6]), contentType: 'image/jpeg' },
    ]
    const source = sourceStorageWithObjects('photos', objects)

    s3Mock.on(HeadObjectCommand, { Bucket: 'photos', Key: 'a.jpg' }).rejects(notFoundError())
    s3Mock
      .on(HeadObjectCommand, { Bucket: 'photos', Key: 'b.jpg' })
      .resolves({ ContentLength: 1, ContentType: 'image/jpeg' })
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { rows } = await migrateBucket(buildDeps(source), 'photos', {
      verifyOnly: true,
      buckets: ['photos'],
    })

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0)
    expect(rows.filter((r) => r.label === 'FAIL')).toHaveLength(2)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('runMigration renders a single combined report across multiple buckets', async () => {
    const { runMigration } = await import('../../../scripts/r2-migrate')
    const photosObjects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]
    const logosObjects: FakeSourceObject[] = [
      { key: 'b.png', bytes: new Uint8Array([4, 5]), contentType: 'image/png' },
    ]
    const source = fakeStorage({
      async list(bucket, prefix) {
        if (prefix !== undefined) return []
        if (bucket === 'photos') return photosObjects.map((o) => file(o.key))
        if (bucket === 'logos') return logosObjects.map((o) => file(o.key))
        return []
      },
      async download(bucket, key) {
        const pool = bucket === 'photos' ? photosObjects : logosObjects
        const obj = pool.find((o) => o.key === key)!
        return { type: obj.contentType, arrayBuffer: async () => obj.bytes.buffer } as unknown as Blob
      },
    })

    s3Mock.on(HeadObjectCommand).callsFake((input) => {
      const pool = input.Bucket === 'photos' ? photosObjects : logosObjects
      const obj = pool.find((o) => o.key === input.Key)!
      return { ContentLength: obj.bytes.length, ContentType: obj.contentType }
    })
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const { text, allPassed } = await runMigration(buildDeps(source), {
      verifyOnly: false,
      buckets: ['photos', 'logos'],
    })

    expect(allPassed).toBe(true)
    expect(text).toContain('photos: source=1 destination=0')
    expect(text).toContain('logos: source=1 destination=0')
  })
})

describe('parseArgs', () => {
  it('no args -> { verifyOnly: false, buckets: MIGRATION_BUCKETS }', async () => {
    const { parseArgs, MIGRATION_BUCKETS } = await import('../../../scripts/r2-migrate')
    expect(parseArgs([])).toEqual({ verifyOnly: false, buckets: MIGRATION_BUCKETS })
  })

  it('--verify-only -> verifyOnly: true', async () => {
    const { parseArgs } = await import('../../../scripts/r2-migrate')
    expect(parseArgs(['--verify-only']).verifyOnly).toBe(true)
  })

  it('--bucket photos -> buckets: ["photos"]', async () => {
    const { parseArgs } = await import('../../../scripts/r2-migrate')
    expect(parseArgs(['--bucket', 'photos']).buckets).toEqual(['photos'])
  })

  it('--bucket estimates (not one of the five) -> throws, naming the five valid buckets', async () => {
    const { parseArgs } = await import('../../../scripts/r2-migrate')
    expect(() => parseArgs(['--bucket', 'estimates'])).toThrow(
      /audio, photos, pdfs, logos, platform-brand/,
    )
  })

  it('--delete-extra (unrecognized flag) -> throws — an unknown flag must never be silently ignored', async () => {
    const { parseArgs } = await import('../../../scripts/r2-migrate')
    expect(() => parseArgs(['--delete-extra'])).toThrow()
  })

  it('any other unrecognized flag -> throws', async () => {
    const { parseArgs } = await import('../../../scripts/r2-migrate')
    expect(() => parseArgs(['--verify-only', '--bogus'])).toThrow()
  })
})

describe('main() — missing config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('s3ConfigFromEnv() returning null -> prints which S3_* vars are missing and exits 1, never reaching the SDK', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined)
    vi.stubEnv('S3_REGION', undefined)
    vi.stubEnv('S3_ACCESS_KEY_ID', undefined)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', undefined)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    s3Mock.reset()

    const { main } = await import('../../../scripts/r2-migrate')
    await expect(main([])).resolves.toBeUndefined()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy.mock.calls[0][0]).toContain('S3_*')
    expect(s3Mock.calls()).toHaveLength(0)

    exitSpy.mockRestore()
    errorSpy.mockRestore()
    vi.unstubAllEnvs()
  })
})

describe('main() — corruption drill (Success Criterion 3) in --verify-only', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('S3_ENDPOINT', FAKE_ENV.S3_ENDPOINT)
    vi.stubEnv('S3_REGION', FAKE_ENV.S3_REGION)
    vi.stubEnv('S3_ACCESS_KEY_ID', FAKE_ENV.S3_ACCESS_KEY_ID)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', FAKE_ENV.S3_SECRET_ACCESS_KEY)
  })

  /**
   * `vi.resetModules()` is required for the `vi.doMock` substitutions of
   * `@/lib/storage` / `@/lib/supabase/service` to apply — otherwise
   * `scripts/r2-migrate` (already imported by earlier describe blocks in
   * this file) stays cached with its ORIGINAL dependencies. But resetting
   * the module registry also forces `@aws-sdk/client-s3` to be re-evaluated
   * as a brand-new module instance, so the outer `s3Mock` (patched onto the
   * PRE-reset `S3Client` class) would no longer intercept calls made by the
   * freshly re-imported `scripts/r2-migrate`. The fix: import
   * `@aws-sdk/client-s3` fresh ourselves, right after resetModules and
   * before importing `scripts/r2-migrate`, and mock THAT instance — so both
   * this helper and the freshly-imported script share the same `S3Client`
   * class reference.
   */
  async function runMainWithSource(
    objects: FakeSourceObject[],
    argv: string[],
    configureAws: (
      aws: typeof import('@aws-sdk/client-s3'),
      mock: ReturnType<typeof mockClient>,
    ) => void,
  ) {
    vi.doMock('@/lib/storage', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/storage')>()
      return {
        ...actual,
        createStorage: () => sourceStorageWithObjects('photos', objects),
      }
    })
    vi.doMock('@/lib/supabase/service', () => ({
      requireServiceClient: () => ({}) as never,
    }))

    const aws = await import('@aws-sdk/client-s3')
    const freshMock = mockClient(aws.S3Client)
    freshMock.reset()
    configureAws(aws, freshMock)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { main } = await import('../../../scripts/r2-migrate')
    await main(['--verify-only', '--bucket', 'photos', ...argv])

    // Capture the exit code BEFORE mockRestore() — restoring a spy clears
    // its recorded call history, so asserting on the spy itself after
    // restoring would always see zero calls.
    const exitCode = exitSpy.mock.calls[0]?.[0]
    const text = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    const putCallCount = freshMock.commandCalls(aws.PutObjectCommand).length

    exitSpy.mockRestore()
    logSpy.mockRestore()
    vi.doUnmock('@/lib/storage')
    vi.doUnmock('@/lib/supabase/service')

    return { exitCode, text, putCallCount }
  }

  it('a destination key whose HeadObject rejects NotFound -> [FAIL] missing, exit 1, zero PutObjectCommand calls', async () => {
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]

    const { exitCode, text, putCallCount } = await runMainWithSource(objects, [], (aws, mock) => {
      mock.on(aws.HeadObjectCommand).rejects(notFoundError())
      mock.on(aws.ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })
    })

    expect(exitCode).toBe(1)
    expect(text).toContain('[FAIL]')
    expect(text).toContain('destination absent')
    expect(putCallCount).toBe(0)
  })

  it('a destination key whose HeadObject reports a size 1 byte off -> [FAIL] size-mismatch, exit 1', async () => {
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]

    const { exitCode, text, putCallCount } = await runMainWithSource(objects, [], (aws, mock) => {
      mock.on(aws.HeadObjectCommand).resolves({ ContentLength: 4, ContentType: 'image/jpeg' })
      mock.on(aws.ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })
    })

    expect(exitCode).toBe(1)
    expect(text).toContain('[FAIL]')
    expect(putCallCount).toBe(0)
  })

  it('a destination key whose HeadObject reports application/octet-stream against a source of image/jpeg -> [FAIL] content-type-mismatch, exit 1 (the extensionless-key case)', async () => {
    const objects: FakeSourceObject[] = [
      { key: 'platform/1784854705622-kvwo24', bytes: new Uint8Array(2048), contentType: 'image/jpeg' },
    ]

    const { exitCode, text, putCallCount } = await runMainWithSource(objects, [], (aws, mock) => {
      mock
        .on(aws.HeadObjectCommand)
        .resolves({ ContentLength: 2048, ContentType: 'application/octet-stream' })
      mock.on(aws.ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })
    })

    expect(exitCode).toBe(1)
    expect(text).toContain('[FAIL]')
    expect(text).toContain('platform/1784854705622-kvwo24')
    expect(putCallCount).toBe(0)
  })

  it('a run where every object matches -> exit 0, text ends with the ALL OBJECTS VERIFIED summary', async () => {
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]

    const { exitCode, text, putCallCount } = await runMainWithSource(objects, [], (aws, mock) => {
      mock.on(aws.HeadObjectCommand).resolves({ ContentLength: 3, ContentType: 'image/jpeg' })
      mock.on(aws.ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })
    })

    expect(exitCode).toBe(0)
    expect(text.trim().endsWith('ALL OBJECTS VERIFIED')).toBe(true)
    expect(putCallCount).toBe(0)
  })

  it('main() prints the report BEFORE exiting — console.log happens prior to process.exit', async () => {
    const objects: FakeSourceObject[] = [
      { key: 'a.jpg', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' },
    ]
    const callOrder: string[] = []

    vi.doMock('@/lib/storage', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/storage')>()
      return { ...actual, createStorage: () => sourceStorageWithObjects('photos', objects) }
    })
    vi.doMock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({}) as never }))

    const aws = await import('@aws-sdk/client-s3')
    const freshMock = mockClient(aws.S3Client)
    freshMock.reset()
    freshMock.on(aws.HeadObjectCommand).resolves({ ContentLength: 3, ContentType: 'image/jpeg' })
    freshMock.on(aws.ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      callOrder.push('exit')
      return undefined as never
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      callOrder.push('log')
    })

    const { main } = await import('../../../scripts/r2-migrate')
    await main(['--verify-only', '--bucket', 'photos'])

    expect(callOrder.indexOf('log')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('log')).toBeLessThan(callOrder.lastIndexOf('exit'))

    exitSpy.mockRestore()
    logSpy.mockRestore()
    vi.doUnmock('@/lib/storage')
    vi.doUnmock('@/lib/supabase/service')
  })
})
