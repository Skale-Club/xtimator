// @vitest-environment node
//
// Phase 190 Plan 03 (URL-03) — unit coverage for resolveAssetForRenderer
// (lib/storage/asset-inline.ts): the origin-less resolver used by the
// server-side PDF renderer and the dynamic favicon route.
//
// `fetchStoredAsset` is MOCKED throughout. That is deliberate and load-bearing
// for the no-console assertion below: `lib/storage/asset-source.ts` legitimately
// console.warns from its own `recordFallback()` when R2 is configured and
// misses. Mocking it out scopes every console assertion here to
// asset-inline.ts's OWN code, which must stay silent on every branch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/storage/asset-source', () => ({
  fetchStoredAsset: vi.fn(),
}))

import { resolveAssetForRenderer } from '@/lib/storage/asset-inline'
import { fetchStoredAsset } from '@/lib/storage/asset-source'

const mockFetchStoredAsset = vi.mocked(fetchStoredAsset)

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64')

const LEGACY_ABSOLUTE =
  'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/co-1/logo.webp'

function blobAsset(bytes: Uint8Array, contentType: string) {
  const blob = new Blob([bytes], { type: contentType })
  return { body: blob, contentType, contentLength: blob.size, source: 'supabase' as const }
}

function streamOf(
  chunks: Uint8Array[],
  hooks: { onEnqueue?: (index: number) => void; onCancel?: () => void } = {},
): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      hooks.onEnqueue?.(i)
      controller.enqueue(chunks[i++])
    },
    cancel() {
      hooks.onCancel?.()
    },
  })
}

function streamAsset(bytes: Uint8Array, contentType: string) {
  return {
    body: streamOf([bytes]),
    contentType,
    contentLength: bytes.byteLength,
    source: 'r2' as const,
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>
let infoSpy: ReturnType<typeof vi.spyOn>
let debugSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  // Module-scoped no-logging guarantee: applies to EVERY test in this file,
  // including all the reject branches. A "could not inline" warn is exactly
  // the leak the content-type allowlist exists to prevent.
  expect(warnSpy).not.toHaveBeenCalled()
  expect(errorSpy).not.toHaveBeenCalled()
  expect(logSpy).not.toHaveBeenCalled()
  expect(infoSpy).not.toHaveBeenCalled()
  expect(debugSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('resolveAssetForRenderer — empty input', () => {
  it('returns null for null, undefined and the empty string, and never reads storage', async () => {
    expect(await resolveAssetForRenderer(null)).toBeNull()
    expect(await resolveAssetForRenderer(undefined)).toBeNull()
    expect(await resolveAssetForRenderer('')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })
})

describe('resolveAssetForRenderer — absolute URL passthrough', () => {
  it('returns an existing absolute *.supabase.co URL BYTE-IDENTICAL with zero storage reads', async () => {
    const result = await resolveAssetForRenderer(LEGACY_ABSOLUTE)
    expect(result).toBe(LEGACY_ABSOLUTE)
    expect(mockFetchStoredAsset).toHaveBeenCalledTimes(0)
  })

  it('returns an http: URL untouched', async () => {
    expect(await resolveAssetForRenderer('http://cdn.example.test/a.png')).toBe(
      'http://cdn.example.test/a.png',
    )
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })

  it('returns an existing data: URI untouched', async () => {
    expect(await resolveAssetForRenderer('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    )
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })
})

describe('resolveAssetForRenderer — same-origin path', () => {
  it('reads the object once and returns a data URI built from its bytes', async () => {
    mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, 'image/webp'))

    const result = await resolveAssetForRenderer(
      '/storage/logos/11111111-2222-3333-4444-555555555555/logo.webp',
    )

    expect(mockFetchStoredAsset).toHaveBeenCalledTimes(1)
    expect(mockFetchStoredAsset).toHaveBeenCalledWith(
      'logos',
      '11111111-2222-3333-4444-555555555555/logo.webp',
    )
    expect(result).toBe(`data:image/webp;base64,${PNG_BASE64}`)
  })

  it('hands fetchStoredAsset a DECODED key (percent-encoded space becomes a real space)', async () => {
    mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, 'image/png'))

    await resolveAssetForRenderer('/storage/logos/co-1/my%20logo.png')

    expect(mockFetchStoredAsset).toHaveBeenCalledWith('logos', 'co-1/my logo.png')
  })

  it('resolves a platform-brand path', async () => {
    mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, 'image/png'))

    const result = await resolveAssetForRenderer('/storage/platform-brand/favicon-123.png')

    expect(mockFetchStoredAsset).toHaveBeenCalledWith('platform-brand', 'favicon-123.png')
    expect(result).toBe(`data:image/png;base64,${PNG_BASE64}`)
  })

  it('produces the SAME base64 whether the body is a Blob (Supabase) or a ReadableStream (R2)', async () => {
    mockFetchStoredAsset.mockResolvedValueOnce(blobAsset(PNG_BYTES, 'image/png'))
    const fromBlob = await resolveAssetForRenderer('/storage/logos/co-1/logo.png')

    mockFetchStoredAsset.mockResolvedValueOnce(streamAsset(PNG_BYTES, 'image/png'))
    const fromStream = await resolveAssetForRenderer('/storage/logos/co-1/logo.png')

    expect(fromBlob).toBe(`data:image/png;base64,${PNG_BASE64}`)
    expect(fromStream).toBe(fromBlob)
  })
})

describe('resolveAssetForRenderer — content-type allowlist (B3)', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    it(`emits a data URI for ${type}`, async () => {
      mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, type))
      expect(await resolveAssetForRenderer('/storage/logos/co-1/asset')).toBe(
        `data:${type};base64,${PNG_BASE64}`,
      )
    })
  }

  it('parses the media type before the ";" — "image/png; charset=binary" still inlines', async () => {
    mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, 'image/png; charset=binary'))

    const result = await resolveAssetForRenderer('/storage/logos/co-1/asset')

    expect(result).toBe(`data:image/png;base64,${PNG_BASE64}`)
  })

  it('matches case-insensitively — "IMAGE/PNG" inlines as the normalised type', async () => {
    mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, 'IMAGE/PNG'))

    expect(await resolveAssetForRenderer('/storage/logos/co-1/asset')).toBe(
      `data:image/png;base64,${PNG_BASE64}`,
    )
  })

  for (const type of [
    'application/octet-stream', // asset-source.ts's DEFAULT on BOTH branches
    'text/html',
    'image/svg+xml', // can carry inline script; dropped from allowed_mime_types
    'image/vnd.microsoft.icon', // real: admin branding accepts .ico uploads
    'video/mp4',
    '',
  ]) {
    it(`returns null (and NO data URI) for content type "${type}"`, async () => {
      mockFetchStoredAsset.mockResolvedValue(blobAsset(PNG_BYTES, type))

      const result = await resolveAssetForRenderer('/storage/logos/co-1/asset')

      expect(result).toBeNull()
    })
  }
})

describe('resolveAssetForRenderer — fail-soft', () => {
  it('returns null when the object exists in neither backend', async () => {
    mockFetchStoredAsset.mockResolvedValue(null)

    const result = await resolveAssetForRenderer('/storage/logos/co-1/logo.png')

    expect(result).toBeNull()
  })

  it('never returns the unresolvable relative path itself', async () => {
    mockFetchStoredAsset.mockResolvedValue(null)

    const result = await resolveAssetForRenderer('/storage/logos/co-1/logo.png')

    expect(result).not.toBe('/storage/logos/co-1/logo.png')
  })

  it('returns null (does not throw) when fetchStoredAsset throws', async () => {
    mockFetchStoredAsset.mockRejectedValue(new Error('boom'))

    await expect(resolveAssetForRenderer('/storage/logos/co-1/logo.png')).resolves.toBeNull()
  })

  it('returns null (does not throw) when reading the body throws mid-stream', async () => {
    mockFetchStoredAsset.mockResolvedValue({
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error('socket reset'))
        },
      }),
      contentType: 'image/png',
      source: 'r2' as const,
    })

    await expect(resolveAssetForRenderer('/storage/logos/co-1/logo.png')).resolves.toBeNull()
  })
})

describe('resolveAssetForRenderer — size cap', () => {
  it('rejects on contentLength alone, without reading the body at all', async () => {
    let enqueued = 0
    mockFetchStoredAsset.mockResolvedValue({
      body: streamOf([new Uint8Array(1024)], { onEnqueue: () => { enqueued += 1 } }),
      contentType: 'image/png',
      contentLength: 3 * 1024 * 1024,
      source: 'r2' as const,
    })

    const result = await resolveAssetForRenderer('/storage/logos/co-1/huge.png')

    expect(result).toBeNull()
    expect(enqueued).toBe(0)
  })

  it('aborts the read once the accumulated length exceeds the cap when contentLength is absent', async () => {
    let enqueued = 0
    let cancelled = false
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(512 * 1024)) // 5 MB total
    mockFetchStoredAsset.mockResolvedValue({
      body: streamOf(chunks, {
        onEnqueue: () => { enqueued += 1 },
        onCancel: () => { cancelled = true },
      }),
      contentType: 'image/png',
      source: 'r2' as const,
    })

    const result = await resolveAssetForRenderer('/storage/logos/co-1/huge.png')

    expect(result).toBeNull()
    expect(cancelled).toBe(true)
    // The whole body was NOT buffered: 2 MB cap / 512 kB chunks means the read
    // stops around the 5th chunk, well short of all 10.
    expect(enqueued).toBeLessThan(10)
  })

  it('accepts an object exactly at the cap', async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024)
    mockFetchStoredAsset.mockResolvedValue(blobAsset(bytes, 'image/png'))

    const result = await resolveAssetForRenderer('/storage/logos/co-1/big.png')

    expect(result).not.toBeNull()
    expect(result?.startsWith('data:image/png;base64,')).toBe(true)
  })
})

describe('resolveAssetForRenderer — rejected shapes', () => {
  it('returns null for a bucket outside the proxy allowlist, with zero storage reads', async () => {
    expect(await resolveAssetForRenderer('/storage/estimates/x')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })

  it('returns null for a protocol-relative URL — never passed through as opaque', async () => {
    expect(await resolveAssetForRenderer('//evil.test/storage/logos/x')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })

  it('returns null for javascript:', async () => {
    expect(await resolveAssetForRenderer('javascript:alert(1)')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })

  it('returns null for a traversal attempt', async () => {
    expect(await resolveAssetForRenderer('/storage/logos/../../etc/passwd')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })

  it('returns null for a bare relative path that is not a proxy path', async () => {
    expect(await resolveAssetForRenderer('/icons/logo.png')).toBeNull()
    expect(mockFetchStoredAsset).not.toHaveBeenCalled()
  })
})
