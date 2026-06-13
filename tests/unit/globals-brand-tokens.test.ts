import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const globalsCss   = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
const authLayout   = readFileSync(resolve(root, 'app/(auth)/layout.tsx'), 'utf8')
const adminLayout  = readFileSync(resolve(root, 'app/admin/layout.tsx'), 'utf8')
const systemColors = readFileSync(resolve(root, 'lib/system-colors.ts'), 'utf8')

describe('Global brand tokens (Phase 10)', () => {
  describe('BRAND-01 — authenticated app pages use #406EF1 primary', () => {
    it('--system-primary is defined as 224 86% 60% (single source of truth)', () => {
      // Brand triplet lives in --system-primary; all --primary vars reference it via var().
      expect(globalsCss).toMatch(/--system-primary:\s*224 86% 60%/)
    })

    it('lib/system-colors.ts exports primaryHsl as "224 86% 60%"', () => {
      expect(systemColors).toContain("primaryHsl: '224 86% 60%'")
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

  describe('BRAND-02 — admin panel default accent is #406EF1', () => {
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
      expect(authLayout).toMatch(/min-h-screen/)
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
