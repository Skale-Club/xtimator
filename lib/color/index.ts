// Barrel for the color module. Preserves the `@/lib/color` import path (4 existing
// consumers import `hexToHslTriplet` from here) while also re-exporting the new
// WCAG contrast utilities so `@/lib/color/contrast` names are reachable via `@/lib/color`.
export * from './contrast'

// Converts '#RRGGBB' or '#RGB' to HSL triplet string 'H S% L%' (space-separated,
// matches shadcn CSS-var convention). Returns null for malformed input.
export function hexToHslTriplet(hex: string): string | null {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let hVal = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        hVal = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        hVal = (b - r) / d + 2
        break
      case b:
        hVal = (r - g) / d + 4
        break
    }
    hVal *= 60
  }
  return `${Math.round(hVal)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
