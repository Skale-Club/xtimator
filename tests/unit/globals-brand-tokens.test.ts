import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const globalsCss   = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
const authLayout   = readFileSync(resolve(root, 'app/(auth)/layout.tsx'), 'utf8')
const adminLayout  = readFileSync(resolve(root, 'app/admin/layout.tsx'), 'utf8')

describe('Global brand tokens (Phase 10)', () => {
  describe('BRAND-01 — authenticated app pages use #406EF1 primary', () => {
    it(':root --primary is 224 86% 60%', () => {
      // Assert the :root block contains the brand primary triplet.
      // Simple approach: count occurrences of the new value to ensure both
      // :root and .dark scopes are covered (at minimum 2 matches for --primary).
      const primaryMatches = (globalsCss.match(/--primary:\s*224 86% 60%/g) ?? []).length
      expect(primaryMatches, '--primary: 224 86% 60% must appear in :root and .dark (at least 2 times)').toBeGreaterThanOrEqual(2)
    })

    it(':root and .dark --ring is 224 86% 60%', () => {
      const ringMatches = (globalsCss.match(/--ring:\s*224 86% 60%/g) ?? []).length
      expect(ringMatches, '--ring: 224 86% 60% must appear in :root and .dark (at least 2 times)').toBeGreaterThanOrEqual(2)
    })

    it('.dark --primary-foreground is 0 0% 100% (white on brand blue)', () => {
      // The .dark scope must have white foreground for contrast on the blue primary.
      // We look for the value; a single occurrence is sufficient.
      expect(globalsCss).toMatch(/--primary-foreground:\s*0 0% 100%/)
    })
  })

  describe('BRAND-02 — admin panel default accent is #406EF1', () => {
    it('app/admin/layout.tsx fallback is 224 86% 60%', () => {
      expect(adminLayout).toContain("triplet ?? '224 86% 60%'")
    })

    it('globals.css [data-theme="admin-dark"] --primary fallback is 224 86% 60%', () => {
      expect(globalsCss).toMatch(/--platform-primary,\s*224 86% 60%/)
    })
  })

  describe('BRAND-03 — auth pages primary is #406EF1', () => {
    it('app/(auth)/layout.tsx fallback is 224 86% 60%', () => {
      expect(authLayout).toContain("triplet ?? '224 86% 60%'")
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
