// WCAG 2.1 contrast utilities — PURE module (no React, no DOM, no I/O).
//
// Purpose: adapt a business's stored brand color at RENDER TIME so estimates
// stay legible for ANY color, without ever mutating the stored value.
//
// Two cases this file solves:
//   1. Brand color used as TEXT ON WHITE  → `ensureReadableOnWhite` darkens the
//      color (hue + saturation preserved) only as much as needed to reach the
//      minimum contrast ratio (default 4.5:1) against white.
//   2. Fixed foreground OVER A BRAND FILL → `readableTextColor` returns whichever
//      of black/white has the greater contrast over the fill.
//
// Invalid-input semantics (documented, never throws):
//   - hexToRgb(invalid)            → null
//   - relativeLuminance            → operates on an already-validated {r,g,b}
//   - contrastRatio(invalid, ...)  → the invalid side is treated as luminance 0
//                                    (black); result stays in [1, 21], no throw
//   - readableTextColor(invalid)   → '#000000' (safe legible default on white)
//   - ensureReadableOnWhite(bad)   → '#000000' (safe legible default on white)

export interface Rgb {
  r: number
  g: number
  b: number
}

// Parse '#RGB', '#RRGGBB', or the same without a leading '#'. Returns null for
// anything malformed (wrong length, non-hex chars, empty, non-string).
export function hexToRgb(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

// WCAG relative luminance from an sRGB {r,g,b} (0..255 per channel).
export function relativeLuminance(rgb: Rgb): number {
  const lin = (channel: number): number => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

// WCAG contrast ratio between two hex colors → range [1, 21].
// An invalid hex is treated as luminance 0 (black) so this never throws.
export function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1)
  const rgb2 = hexToRgb(hex2)
  const l1 = rgb1 ? relativeLuminance(rgb1) : 0
  const l2 = rgb2 ? relativeLuminance(rgb2) : 0
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// For a fixed foreground over a brand-colored fill: pick black or white,
// whichever has the greater contrast against the background. Invalid → '#000000'.
export function readableTextColor(bgHex: string): '#000000' | '#ffffff' {
  if (!hexToRgb(bgHex)) return '#000000'
  const contrastBlack = contrastRatio('#000000', bgHex)
  const contrastWhite = contrastRatio('#ffffff', bgHex)
  return contrastWhite > contrastBlack ? '#ffffff' : '#000000'
}

// --- Internal HSL helpers (kept private; hue/sat preservation for case 1) ----

interface Hsl {
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h *= 60
  }
  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = h / 360
  return {
    r: Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hk) * 255),
    b: Math.round(hue2rgb(p, q, hk - 1 / 3) * 255),
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Case 1: brand color as text on WHITE. If the color already meets `minRatio`
// against white it is returned UNCHANGED. Otherwise its lightness is reduced in
// small steps (hue + saturation preserved) until it passes. Invalid → '#000000'.
export function ensureReadableOnWhite(hex: string, minRatio = 4.5): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#000000'
  if (contrastRatio(hex, '#ffffff') >= minRatio) return hex

  const { h, s, l } = rgbToHsl(rgb)
  // Reduce lightness in ~2% steps, preserving hue/saturation, until it passes
  // or bottoms out at black.
  for (let li = l; li >= 0; li -= 0.02) {
    const candidateHex = rgbToHex(hslToRgb({ h, s, l: Math.max(0, li) }))
    if (contrastRatio(candidateHex, '#ffffff') >= minRatio) {
      return candidateHex
    }
  }
  return '#000000'
}
