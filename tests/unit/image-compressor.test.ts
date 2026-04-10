import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressImage } from '@/lib/utils/image-compressor'

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
