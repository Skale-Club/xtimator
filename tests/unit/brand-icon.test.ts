// @vitest-environment node
//
// Phase 190 Plan 03 (URL-03) — loadBrandLogoDataUri() backs the dynamic
// app/icon.tsx and app/apple-icon.tsx routes. Those are ImageResponse renderers
// running in Node with NO browser origin, so the previous bare `fetch(url)`
// threw "Failed to parse URL" the moment an admin's favicon became a
// same-origin `/storage/platform-brand/...` path — and the surrounding catch
// silently degraded every tab icon to the bundled logo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/platform-config', () => ({ getBranding: vi.fn() }))
vi.mock('@/lib/storage/asset-inline', () => ({ resolveAssetForRenderer: vi.fn() }))
vi.mock('fs/promises', () => ({ readFile: vi.fn() }))

import { readFile } from 'fs/promises'
import { loadBrandLogoDataUri } from '@/lib/brand-icon'
import { getBranding } from '@/lib/platform-config'
import { resolveAssetForRenderer } from '@/lib/storage/asset-inline'

const mockGetBranding = vi.mocked(getBranding)
const mockResolveAsset = vi.mocked(resolveAssetForRenderer)
const mockReadFile = vi.mocked(readFile)

const BUNDLED_BYTES = Buffer.from([0x62, 0x75, 0x6e, 0x64])
const BUNDLED_DATA_URI = `data:image/png;base64,${BUNDLED_BYTES.toString('base64')}`

const REMOTE_BYTES = Buffer.from([0x72, 0x65, 0x6d, 0x74])
const REMOTE_DATA_URI = `data:image/png;base64,${REMOTE_BYTES.toString('base64')}`

const RELATIVE_FAVICON = '/storage/platform-brand/favicon-123.png'
const RELATIVE_LOGO = '/storage/platform-brand/logo-123.webp'
const LEGACY_ABSOLUTE =
  'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/platform-brand/logo.png'

const INLINED = 'data:image/png;base64,QUJD'

let fetchSpy: ReturnType<typeof vi.fn>

function branding(overrides: { faviconUrl?: string | null; logoUrl?: string | null }) {
  return { appName: 'Xtimator', faviconUrl: null, logoUrl: null, ...overrides } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadFile.mockResolvedValue(BUNDLED_BYTES as never)
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadBrandLogoDataUri — same-origin branding assets', () => {
  it('inlines a same-origin favicon path and never calls global fetch', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: RELATIVE_FAVICON }))
    mockResolveAsset.mockResolvedValue(INLINED)

    const result = await loadBrandLogoDataUri()

    expect(mockResolveAsset).toHaveBeenCalledWith(RELATIVE_FAVICON)
    expect(result).toBe(INLINED)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('preserves the faviconUrl ?? logoUrl precedence — falls to the logo when no favicon is set', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: null, logoUrl: RELATIVE_LOGO }))
    mockResolveAsset.mockResolvedValue(INLINED)

    const result = await loadBrandLogoDataUri()

    expect(mockResolveAsset).toHaveBeenCalledWith(RELATIVE_LOGO)
    expect(result).toBe(INLINED)
  })

  it('prefers the favicon over the logo when both are set', async () => {
    mockGetBranding.mockResolvedValue(
      branding({ faviconUrl: RELATIVE_FAVICON, logoUrl: RELATIVE_LOGO }),
    )
    mockResolveAsset.mockResolvedValue(INLINED)

    await loadBrandLogoDataUri()

    expect(mockResolveAsset).toHaveBeenCalledWith(RELATIVE_FAVICON)
    expect(mockResolveAsset).toHaveBeenCalledTimes(1)
  })
})

describe('loadBrandLogoDataUri — existing absolute URLs must not regress', () => {
  it('fetches an absolute URL and base64s it, exactly as before Phase 190', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: LEGACY_ABSOLUTE }))
    mockResolveAsset.mockResolvedValue(LEGACY_ABSOLUTE)
    fetchSpy.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        REMOTE_BYTES.buffer.slice(
          REMOTE_BYTES.byteOffset,
          REMOTE_BYTES.byteOffset + REMOTE_BYTES.byteLength,
        ),
      headers: new Headers({ 'content-type': 'image/png' }),
    })

    const result = await loadBrandLogoDataUri()

    expect(fetchSpy).toHaveBeenCalledWith(LEGACY_ABSOLUTE)
    expect(result).toBe(REMOTE_DATA_URI)
  })

  it('keeps the content-type parameter strip on the absolute path', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: LEGACY_ABSOLUTE }))
    mockResolveAsset.mockResolvedValue(LEGACY_ABSOLUTE)
    fetchSpy.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        REMOTE_BYTES.buffer.slice(
          REMOTE_BYTES.byteOffset,
          REMOTE_BYTES.byteOffset + REMOTE_BYTES.byteLength,
        ),
      headers: new Headers({ 'content-type': 'image/jpeg; charset=binary' }),
    })

    const result = await loadBrandLogoDataUri()

    expect(result).toBe(`data:image/jpeg;base64,${REMOTE_BYTES.toString('base64')}`)
  })

  it('falls back to the bundled logo when the absolute fetch is not ok', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: LEGACY_ABSOLUTE }))
    mockResolveAsset.mockResolvedValue(LEGACY_ABSOLUTE)
    fetchSpy.mockResolvedValue({ ok: false, headers: new Headers() })

    expect(await loadBrandLogoDataUri()).toBe(BUNDLED_DATA_URI)
  })
})

describe('loadBrandLogoDataUri — clean fallback', () => {
  it('falls back to the bundled logo when the branding asset cannot be resolved', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: RELATIVE_FAVICON }))
    mockResolveAsset.mockResolvedValue(null)

    const result = await loadBrandLogoDataUri()

    expect(result).toBe(BUNDLED_DATA_URI)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls back cleanly for a .ico favicon (outside the resolver allowlist) instead of a broken tile', async () => {
    // app/admin/branding/actions.ts accepts .ico uploads, so this is a real
    // input: image/vnd.microsoft.icon is not inlineable, the resolver returns
    // null, and the bundled logo renders. Pre-Phase-190 a relative URL threw
    // here and fell back to the same place.
    mockGetBranding.mockResolvedValue(
      branding({ faviconUrl: '/storage/platform-brand/favicon-123.ico' }),
    )
    mockResolveAsset.mockResolvedValue(null)

    expect(await loadBrandLogoDataUri()).toBe(BUNDLED_DATA_URI)
  })

  it('falls back to the bundled logo when no branding asset is configured at all', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: null, logoUrl: null }))

    expect(await loadBrandLogoDataUri()).toBe(BUNDLED_DATA_URI)
    expect(mockResolveAsset).not.toHaveBeenCalled()
  })

  it('falls back to the bundled logo when the branding lookup throws', async () => {
    mockGetBranding.mockRejectedValue(new Error('db down'))

    expect(await loadBrandLogoDataUri()).toBe(BUNDLED_DATA_URI)
  })

  it('falls back to the bundled logo when the resolver itself throws', async () => {
    mockGetBranding.mockResolvedValue(branding({ faviconUrl: RELATIVE_FAVICON }))
    mockResolveAsset.mockRejectedValue(new Error('boom'))

    expect(await loadBrandLogoDataUri()).toBe(BUNDLED_DATA_URI)
  })

  it('returns null ONLY when both the branding path and the bundled read fail', async () => {
    mockGetBranding.mockRejectedValue(new Error('db down'))
    mockReadFile.mockRejectedValue(new Error('no such file'))

    expect(await loadBrandLogoDataUri()).toBeNull()
  })
})
