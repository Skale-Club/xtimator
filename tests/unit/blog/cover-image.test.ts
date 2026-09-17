import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Cover images (autoblog-parity XT-06).
 *
 * The contract this file defends is "a cover can never cost a post": every
 * failure mode below must return null rather than throw, because the caller
 * treats a throw as a failed generation.
 */

vi.mock('@/lib/ai/openrouter-client', () => ({
  getORKey: vi.fn(async () => 'test-key'),
  OPENROUTER_BASE: 'https://openrouter.test/api/v1',
}))

const upload = vi.fn()
vi.mock('@/lib/storage/server', () => ({
  serverStorage: () => ({ upload }),
}))

import { generateCoverImage } from '@/lib/blog/cover-image'

/** A real 40x10 PNG, so sharp has actual bytes to crop and encode. */
async function pngBytes(width: number, height: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } },
  })
    .png()
    .toBuffer()
}

function imageResponse(bytes: Buffer, mime = 'image/png') {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { images: [{ image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }] } }],
    }),
  } as unknown as Response
}

const ARGS = { model: 'test/image-model', title: 'How to price a reroof', focusKeyword: 'reroof pricing', slug: 'how-to-price-a-reroof' }

describe('generateCoverImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    upload.mockReset()
    upload.mockImplementation(async (_bucket: string, path: string) => ({ path }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips entirely when no image model is configured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    // Not "generate and discard": no model means no request, no spend.
    expect(await generateCoverImage({} as never, { ...ARGS, model: '   ' })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stores a same-origin proxy path, never a backend hostname', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(await pngBytes(1600, 900))))

    const result = await generateCoverImage({} as never, ARGS)

    expect(result).not.toBeNull()
    // A persisted provider URL bills every view as provider egress and breaks
    // the moment the storage backend changes.
    expect(result!.url).toMatch(/^\/storage\/platform-brand\/blog\//)
    expect(result!.url).not.toMatch(/https?:|supabase\.co|r2\.cloudflarestorage/)
    expect(result!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('uploads WebP and keys it immutably', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(await pngBytes(1600, 900))))

    await generateCoverImage({} as never, ARGS)

    const [bucket, path, body, opts] = upload.mock.calls[0]
    expect(bucket).toBe('platform-brand')
    expect(path).toMatch(/^blog\/\d+-how-to-price-a-reroof\.webp$/)
    expect(opts).toMatchObject({ contentType: 'image/webp', upsert: false })
    // platform-brand is served immutable for a year, so a reused key would
    // strand every edge copy — hence upsert: false and a timestamped key.
    expect(Buffer.isBuffer(body)).toBe(true)
    // RIFF....WEBP
    expect(body.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(body.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('crops a square image the model returned down to 16:9', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(await pngBytes(1000, 1000))))

    await generateCoverImage({} as never, ARGS)

    const { default: sharp } = await import('sharp')
    const meta = await sharp(upload.mock.calls[0][2]).metadata()
    // Crops the long side away rather than scaling — never invent pixels.
    expect(meta.width).toBe(1000)
    expect(meta.height).toBe(563)
    expect(Math.abs(meta.width! / meta.height! - 16 / 9)).toBeLessThan(0.02)
  })

  it('leaves an already-16:9 image uncropped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(await pngBytes(1600, 900))))

    await generateCoverImage({} as never, ARGS)

    const { default: sharp } = await import('sharp')
    const meta = await sharp(upload.mock.calls[0][2]).metadata()
    expect(meta.width).toBe(1600)
    expect(meta.height).toBe(900)
  })

  it('returns null when the model answers without an image', async () => {
    // Several image-capable models do this for a prompt they decline. It is a
    // normal outcome, not an error.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: {} }] }) }) as unknown as Response))

    expect(await generateCoverImage({} as never, ARGS)).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })

  it('returns null — never throws — when the image API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'upstream busy' }) as unknown as Response))

    await expect(generateCoverImage({} as never, ARGS)).resolves.toBeNull()
  })

  it('returns null — never throws — when the upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(await pngBytes(1600, 900))))
    upload.mockRejectedValueOnce(new Error('bucket unreachable'))

    // The post is about to be written. A storage blip must not take it down.
    await expect(generateCoverImage({} as never, ARGS)).resolves.toBeNull()
  })

  it('returns null when the data URL is not an image payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { images: [{ image_url: { url: 'https://example.com/not-a-data-url.png' } }] } }] }),
    }) as unknown as Response))

    expect(await generateCoverImage({} as never, ARGS)).toBeNull()
  })

  it('asks the model for no text and a 16:9 composition', async () => {
    const fetchSpy = vi.fn(async () => imageResponse(await pngBytes(1600, 900)))
    vi.stubGlobal('fetch', fetchSpy)

    await generateCoverImage({} as never, ARGS)

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.modalities).toEqual(['image', 'text'])
    expect(body.model).toBe('test/image-model')
    const prompt: string = body.messages[0].content
    // Text baked into a generated cover cannot be fixed later and reads as a
    // typo to every visitor.
    expect(prompt).toMatch(/no text/i)
    expect(prompt).toMatch(/16:9/)
    expect(prompt).toContain(ARGS.title)
  })
})
