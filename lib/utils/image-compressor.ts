// Pre-launch audit fix: HEIC/HEIF photos from an iPhone's default camera
// format can't be decoded by <img>/<canvas> in most browsers, so
// compressImage below would reject and the caller used to silently fall
// back to uploading the raw HEIC bytes mislabeled as image/jpeg. Detect it
// up front (file.type is unreliable across browsers, so we also check the
// extension and the ISO-BMFF 'ftyp' box's brand) so the caller can reject
// with a clear message instead.
const HEIC_FTYP_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']

export async function isLikelyHeic(file: File): Promise<boolean> {
  if (/\.(heic|heif)$/i.test(file.name)) return true
  if (file.type === 'image/heic' || file.type === 'image/heif') return true

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (header.length < 12) return false
  const boxType = String.fromCharCode(...header.slice(4, 8))
  if (boxType !== 'ftyp') return false
  const brand = String.fromCharCode(...header.slice(8, 12)).toLowerCase()
  return HEIC_FTYP_BRANDS.includes(brand)
}

export function compressImage(
  file: File,
  maxWidth: number = 2000,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
        'image/jpeg',
        quality
      )
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}
