import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const globalsCss   = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
const authLayout   = readFileSync(resolve(root, 'app/(auth)/layout.tsx'), 'utf8')
const adminLayout  = readFileSync(resolve(root, 'app/admin/layout.tsx'), 'utf8')
const systemColors = readFileSync(resolve(root, 'lib/system-colors.ts'), 'utf8')

describe('Global brand tokens (Phase 10)', () => {
  describe('BRAND-01 — authenticated app pages use the system primary (224 86% 57%)', () => {
    it('--system-primary is defined as 224 86% 57% (single source of truth)', () => {
      // Brand triplet lives in --system-primary; all --primary vars reference it via var().
      expect(globalsCss).toMatch(/--system-primary:\s*224 86% 57%/)
    })

    it('lib/system-colors.ts exports primaryHsl as "224 86% 57%"', () => {
      expect(systemColors).toContain("primaryHsl: '224 86% 57%'")
    })

    it(':root --primary resolves through var(--system-primary)', () => {
      // globals.css uses var(--system-primary) indirection — at least :root and .dark.
      const matches = (globalsCss.match(/--primary:\s*var\(--system-primary\)/g) ?? []).length
      expect(matches, '--primary: var(--system-primary) must appear in :root and .dark (≥2)').toBeGreaterThanOrEqual(2)
    })

    it(':root --ring resolves through var(--system-primary)', () => {
      const matches = (globalsCss.match(/--ring:\s*var\(--system-primary\)/g) ?? []).length
      expect(matches, '--ring: var(--system-primary) must appear in :root and .dark (≥2)').toBeGreaterThanOrEqual(2)
    })

    it('.dark --primary-foreground is 0 0% 100% (white on brand blue)', () => {
      expect(globalsCss).toMatch(/--primary-foreground:\s*0 0% 100%/)
    })
  })

  describe('BRAND-02 — admin panel default accent is the system primary', () => {
    it('app/admin/layout.tsx fallback uses SYSTEM_COLORS.primaryHsl', () => {
      // Layout resolves brand triplet via SYSTEM_COLORS constant (not a hardcoded literal).
      expect(adminLayout).toContain('SYSTEM_COLORS.primaryHsl')
    })

    it('globals.css runtime override uses var(--platform-primary, var(--system-primary))', () => {
      // Super-admin can swap colours at runtime without a redeploy.
      expect(globalsCss).toMatch(/var\(--platform-primary,\s*var\(--system-primary\)\)/)
    })
  })

  describe('BRAND-03 — auth pages inherit the brand primary', () => {
    it('app/(auth)/layout.tsx is a standalone shell that inherits --system-primary (no stale color literal)', () => {
      // The auth layout was redesigned into a dedicated full-height shell; the brand primary
      // now reaches auth pages via the global --system-primary token (BRAND-01), not a layout
      // literal. The regression guard below still forbids the old hardcoded fallback.
      expect(authLayout).toMatch(/min-h-(screen|dvh)/)  // full-height shell; dvh avoids the mobile URL-bar jump
      expect(authLayout).not.toContain('220 91% 60%')
    })
  })

  describe('Regression guards', () => {
    it('old fallback 220 91% 60% is absent from globals.css', () => {
      expect(globalsCss).not.toContain('220 91% 60%')
    })

    it('old fallback 220 91% 60% is absent from auth layout', () => {
      expect(authLayout).not.toContain('220 91% 60%')
    })

    it('old fallback 220 91% 60% is absent from admin layout', () => {
      expect(adminLayout).not.toContain('220 91% 60%')
    })

    it('runtime override path var(--platform-primary, ...) is preserved in globals.css', () => {
      expect(globalsCss).toMatch(/var\(--platform-primary,/)
    })
  })
})

describe('Primary contrast (WCAG AA, axe scans of 2026-11-25)', () => {
  const hslToHex = (triplet: string) => {
    const [h, s, l] = triplet.replace(/%/g, '').trim().split(/\s+/).map(Number)
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
    const f = (n: number) => {
      const k = (n + h / 30) % 12
      const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
      return Math.round(v * 255).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }
  const token = (name: string) => {
    const match = globalsCss.match(new RegExp(`--${name}:\\s*([\\d.]+ [\\d.]+% [\\d.]+%)`))
    expect(match, `--${name} must be an HSL triplet`).not.toBeNull()
    return hslToHex(match![1])
  }

  it('white text on the system primary fill reaches 4.5:1', async () => {
    const { contrastRatio } = await import('@/lib/color/contrast')
    expect(contrastRatio(token('system-primary'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('primary text on the darkest app surfaces reaches 4.5:1', async () => {
    const { contrastRatio } = await import('@/lib/color/contrast')
    for (const surface of ['#09090b', '#101218', '#1f1f23']) {
      expect(contrastRatio(token('primary-text'), surface), surface).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('text-primary reads the dark-surface tone and forced-light scopes reset it', () => {
    expect(globalsCss).toMatch(/\.text-primary\s*\{\s*color:\s*hsl\(var\(--primary-text,\s*var\(--primary\)\)\)/)
    expect(globalsCss).toMatch(/\[data-theme="light"\]\s*\{[^}]*--primary-text:\s*initial/)
  })
})
