/** Video helpers: YouTube url parsing and the per-video aspect ratio rule. */

export type VideoFormat = 'auto' | 'vertical' | 'horizontal' | 'square'
export type Aspect = 'vertical' | 'horizontal' | 'square'

const ID_RE = /^[A-Za-z0-9_-]{11}$/

/**
 * Extract the 11-char YouTube id from watch, shorts, live, embed and youtu.be
 * links. Returns null for anything else (never throws).
 */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '')
  let candidate: string | null = null
  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') candidate = parsed.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) candidate = parts[1] ?? null
  }
  return candidate && ID_RE.test(candidate) ? candidate : null
}

export function isShortsUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url.trim()).pathname.split('/').filter(Boolean)[0] === 'shorts'
  } catch {
    return false
  }
}

/** Map the Notion `Format` select value to the internal enum. */
export function parseFormat(value: string | null | undefined): VideoFormat {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'vertical':
      return 'vertical'
    case 'horizontal':
      return 'horizontal'
    case 'square':
      return 'square'
    default:
      return 'auto'
  }
}

/** Classify a width/height pair. Near-square (within 8%) counts as square. */
export function aspectFromSize(width: number, height: number): Aspect | null {
  if (!(width > 0) || !(height > 0)) return null
  const ratio = width / height
  if (ratio > 0.92 && ratio < 1.08) return 'square'
  return ratio < 1 ? 'vertical' : 'horizontal'
}

/**
 * The aspect rule, never a fixed default per app:
 *  1. an explicit `Format` (not Auto) wins;
 *  2. else detection from oEmbed width/height;
 *  3. else a /shorts/ URL implies vertical;
 *  4. else vertical while unknown (the common phone-recorded case).
 */
export function resolveAspect(input: {
  format: VideoFormat
  url: string | null
  oembed?: { width: number; height: number } | null
}): Aspect {
  if (input.format !== 'auto') return input.format
  if (input.oembed) {
    const detected = aspectFromSize(input.oembed.width, input.oembed.height)
    if (detected) return detected
  }
  if (isShortsUrl(input.url)) return 'vertical'
  return 'vertical'
}

export const ASPECT_RATIO_CSS: Record<Aspect, string> = {
  vertical: '9 / 16',
  horizontal: '16 / 9',
  square: '1 / 1',
}
