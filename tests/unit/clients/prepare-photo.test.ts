import { describe, it, expect, vi, beforeEach } from 'vitest'

const compressImage = vi.fn()
const isLikelyHeic = vi.fn()
vi.mock('@/lib/utils/image-compressor', () => ({
  compressImage: (...args: unknown[]) => compressImage(...args),
  isLikelyHeic: (...args: unknown[]) => isLikelyHeic(...args),
}))

import { prepareClientPhoto, CLIENT_PHOTO_MAX_BYTES } from '@/lib/clients/prepare-photo'

function fileOf(size: number, type: string, name = 'photo.jpg') {
  return new File([new Uint8Array(size)], name, { type })
}

beforeEach(() => {
  compressImage.mockReset()
  isLikelyHeic.mockReset().mockResolvedValue(false)
})

describe('prepareClientPhoto', () => {
  it('uploads a small PNG untouched (keeps a logo transparent)', async () => {
    const file = fileOf(200_000, 'image/png', 'logo.png')
    expect(await prepareClientPhoto(file)).toEqual({ file })
    expect(compressImage).not.toHaveBeenCalled()
  })

  it('resizes a large phone photo to a 1024px JPEG under the limit', async () => {
    compressImage.mockResolvedValue(new Blob([new Uint8Array(300_000)], { type: 'image/jpeg' }))
    const result = await prepareClientPhoto(fileOf(5_000_000, 'image/jpeg', 'IMG_0001.jpeg'))
    expect(compressImage).toHaveBeenCalledWith(expect.any(File), 1024, 0.85)
    expect('file' in result && result.file.type).toBe('image/jpeg')
    expect('file' in result && result.file.name).toBe('IMG_0001.jpg')
    expect('file' in result && result.file.size).toBeLessThanOrEqual(CLIENT_PHOTO_MAX_BYTES)
  })

  it('refuses HEIC with a clear message', async () => {
    isLikelyHeic.mockResolvedValue(true)
    const result = await prepareClientPhoto(fileOf(3_000_000, '', 'IMG_0002.HEIC'))
    expect(result).toEqual({ error: expect.stringContaining('HEIC') })
  })

  it('refuses formats the server does not accept', async () => {
    expect(await prepareClientPhoto(fileOf(10_000, 'image/gif', 'a.gif'))).toEqual({ error: expect.stringContaining('Unsupported') })
  })

  it('reports an image that cannot be read', async () => {
    compressImage.mockRejectedValue(new Error('Failed to load image'))
    expect(await prepareClientPhoto(fileOf(4_000_000, 'image/jpeg'))).toEqual({ error: expect.stringContaining('could not be read') })
  })
})
