import { compressImage, isLikelyHeic } from '@/lib/utils/image-compressor'

/** The server rejects anything above this (uploadProjectCover). */
export const COVER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
/** Files at or under this size go up untouched (keeps a PNG's transparency). */
const UPLOAD_AS_IS_BYTES = 1024 * 1024
/** The stored thumb is 160px; 640px leaves room for the centre crop. */
const MAX_WIDTH = 640

export type PreparedCover = { file: File } | { error: string }

/**
 * Makes a picked image ready to send as a project thumbnail. Big phone photos
 * are shrunk in the browser first (the thumb is only 160px), so the upload is
 * small on a cellular connection. iPhone HEIC files are refused: browsers
 * cannot decode them.
 */
export async function prepareCoverImage(file: File): Promise<PreparedCover> {
  if (await isLikelyHeic(file)) {
    return { error: 'This photo is in HEIC format. Choose a JPG or PNG, or set the camera to "Most compatible".' }
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.' }
  }
  if (file.size <= UPLOAD_AS_IS_BYTES) return { file }
  try {
    const blob = await compressImage(file, MAX_WIDTH, 0.85)
    if (blob.size > COVER_UPLOAD_MAX_BYTES) return { error: 'This image is too large. Choose a smaller one.' }
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { file: new File([blob], name, { type: 'image/jpeg' }) }
  } catch {
    return { error: 'This image could not be read. Choose another one.' }
  }
}
