import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'

// Pre-launch audit fix: iPhone photos in the default "High Efficiency" camera
// format upload as HEIC, which most browsers' <canvas> can't decode —
// compressImage would reject and the caller used to silently fall back to
// uploading the raw HEIC bytes mislabeled as image/jpeg. isLikelyHeic lets
// callers detect and reject BEFORE that happens.
describe('isLikelyHeic', () => {
  function fileWithMagicBytes(name: string, type: string, brand: string): File {
    const bytes = new Uint8Array(12)
    // bytes[0..3] is the box size (irrelevant here); bytes[4..7] must spell 'ftyp'
    bytes.set([0, 0, 0, 24], 0)
    bytes.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4)
    bytes.set([...brand].map((c) => c.charCodeAt(0)), 8)
    return new File([bytes], name, { type })
  }

  it('detects HEIC by file extension even when type is empty', async () => {
    const file = new File(['x'], 'IMG_0001.HEIC', { type: '' })
    expect(await isLikelyHeic(file)).toBe(true)
  })

  it('detects HEIF by file extension', async () => {
    const file = new File(['x'], 'photo.heif', { type: '' })
    expect(await isLikelyHeic(file)).toBe(true)
  })

  it('detects HEIC by MIME type', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/heic' })
    expect(await isLikelyHeic(file)).toBe(true)
  })

  it('detects HEIC by the ISO-BMFF ftyp box brand when name/type are misleading', async () => {
    const file = fileWithMagicBytes('photo.jpg', 'image/jpeg', 'heic')
    expect(await isLikelyHeic(file)).toBe(true)
  })

  it('does not flag a real JPEG (no ftyp box) as HEIC', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    expect(await isLikelyHeic(file)).toBe(false)
  })

  it('does not flag an unrelated ftyp brand (e.g. an mp4) as HEIC', async () => {
    const file = fileWithMagicBytes('video.mp4', 'video/mp4', 'isom')
    expect(await isLikelyHeic(file)).toBe(false)
  })
})

describe('compressImage', () => {
  let mockCanvas: {
    width: number
    height: number
    getContext: ReturnType<typeof vi.fn>
    toBlob: ReturnType<typeof vi.fn>
  }
  let mockCtx: { drawImage: ReturnType<typeof vi.fn> }
  let capturedOnload: (() => void) | null
  let capturedImgSrc: string

  beforeEach(() => {
    capturedOnload = null
    capturedImgSrc = ''

    mockCtx = { drawImage: vi.fn() }
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toBlob: vi.fn((cb: (blob: Blob | null) => void, type: string, quality: number) => {
        cb(new Blob(['fake'], { type }))
      }),
    }

    vi.stubGlobal('Image', class MockImage {
      width = 0
      height = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      get src() { return this._src }
      set src(val: string) {
        this._src = val
        capturedImgSrc = val
        // Simulate loaded image dimensions
        if (capturedOnload) {
          // Will be set by test
        }
      }
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this
        setTimeout(() => {
          capturedOnload = () => {
            if (self.onload) self.onload()
          }
        }, 0)
      }
    })

    vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas as unknown as HTMLElement)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  function triggerImageLoad(width: number, height: number) {
    // Find the Image instance and trigger onload with dimensions
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (capturedOnload) {
          clearInterval(checkInterval)
          // We need to set dimensions on the mock Image before triggering onload
          // The Image constructor stores `self`, we trigger via capturedOnload
          capturedOnload()
          resolve()
        }
      }, 5)
    })
  }

  it('compresses image wider than 2000px to max width 2000', async () => {
    // Override Image to have large dimensions
    vi.stubGlobal('Image', class MockImage {
      width = 4000
      height = 3000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      get src() { return this._src }
      set src(val: string) {
        this._src = val
        // Trigger onload asynchronously
        setTimeout(() => { if (this.onload) this.onload() }, 0)
      }
    })

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await compressImage(file, 2000, 0.85)

    expect(mockCanvas.width).toBe(2000)
    expect(mockCanvas.height).toBe(1500) // proportional
    expect(blob).toBeInstanceOf(Blob)
  })

  it('leaves dimensions unchanged for image narrower than 2000px', async () => {
    vi.stubGlobal('Image', class MockImage {
      width = 800
      height = 600
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      get src() { return this._src }
      set src(val: string) {
        this._src = val
        setTimeout(() => { if (this.onload) this.onload() }, 0)
      }
    })

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await compressImage(file, 2000, 0.85)

    expect(mockCanvas.width).toBe(800)
    expect(mockCanvas.height).toBe(600)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns JPEG blob (type image/jpeg)', async () => {
    vi.stubGlobal('Image', class MockImage {
      width = 800
      height = 600
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      get src() { return this._src }
      set src(val: string) {
        this._src = val
        setTimeout(() => { if (this.onload) this.onload() }, 0)
      }
    })

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' })
    const blob = await compressImage(file, 2000, 0.85)

    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85)
    expect(blob.type).toBe('image/jpeg')
  })
})
