import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'

/** The server's limit (uploadClientLogoAction). */
export const CLIENT_PHOTO_MAX_BYTES = 2 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
/** Files at or under this size upload untouched (keeps a logo's PNG transparency). */
const UPLOAD_AS_IS_BYTES = 1.5 * 1024 * 1024
/** Avatars never render larger than ~80px; 1024px leaves room for sharp screens. */
const MAX_WIDTH = 1024

export type PreparedPhoto = { file: File } | { error: string }

/**
 * Makes a picked image uploadable as a client photo or logo. Phone camera
 * photos are often 3-8 MB, over the 2 MB limit, so anything large is resized
 * in the browser to a 1024px JPEG first. Small files go up as they are (the
 * server converts every upload to WebP). iPhone HEIC files are refused with a
 * clear message: browsers cannot decode them.
 */
export async function prepareClientPhoto(file: File): Promise<PreparedPhoto> {
  if (await isLikelyHeic(file)) {
    return { error: 'This photo is in HEIC format. Choose a JPG or PNG, or set the camera to "Most compatible".' }
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.' }
  }
  if (file.size <= UPLOAD_AS_IS_BYTES) return { file }

  try {
    const blob = await compressImage(file, MAX_WIDTH, 0.85)
    if (blob.size > CLIENT_PHOTO_MAX_BYTES) return { error: 'This image is too large. Choose a smaller one.' }
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { file: new File([blob], name, { type: 'image/jpeg' }) }
  } catch {
    return { error: 'This image could not be read. Choose another one.' }
  }
}
