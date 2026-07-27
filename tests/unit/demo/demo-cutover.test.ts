import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Demo cutover contract (181-05, CUTOVER-01/CUTOVER-02).
 *
 * Static-source-guard tests (readFileSync + regex assertions — no RTL
 * rendering, no mocks; mirrors tests/unit/settings/demo-tab-visibility.test.ts
 * and tests/unit/settings/demo-hidden-tab-guards.test.ts).
 *
 * Proves:
 * - The landing page's only public demo entry point is `/demo/entry` (Phase
 *   180's verified handoff route), not the retired standalone `/demo` index.
 * - The retired standalone `/demo/*` UI is gone from the repository, while the
 *   two look-alike survivors stay: `app/demo/entry/route.ts` (the handoff
 *   route) and `components/demo/demo-banner.tsx` (the in-app read-only banner
 *   still rendered by `app/(app)/layout.tsx`).
 * - DEMO-WORKSPACE.md carries the structural markers of the host-isolated
 *   architecture and none of the pre-Phase-180 stale claims. (Full narrative
 *   accuracy is a manual review item — these are drift tripwires, not a proof
 *   of correctness.)
 */

const root = resolve(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

/**
 * Matches only the bare legacy link. The closing quote immediately after
 * `/demo` means this deliberately does NOT match `href="/demo/entry"`.
 */
const LEGACY_DEMO_HREF = /href="\/demo"/
const ENTRY_DEMO_HREF = /href="\/demo\/entry"/

const LANDING_CTA_FILES = [
  'components/landing/hero-section.tsx',
  'components/landing/final-cta-section.tsx',
  'components/landing/landing-footer.tsx',
]

/** The retired standalone demo UI — deleted by 181-05 (CUTOVER-01). */
const RETIRED_DEMO_FILES = [
  'app/demo/page.tsx',
  'app/demo/layout.tsx',
  'app/demo/dashboard/page.tsx',
  'app/demo/dashboard/loading.tsx',
  'app/demo/clients/page.tsx',
  'app/demo/clients/loading.tsx',
  'app/demo/projects/page.tsx',
  'app/demo/projects/loading.tsx',
  'app/demo/price-book/page.tsx',
  'app/demo/price-book/loading.tsx',
  'components/demo/demo-nav.tsx',
]

/** Deliberate survivors — deleting either of these breaks a live surface. */
const SURVIVING_DEMO_FILES = [
  'app/demo/entry/route.ts',
  'components/demo/demo-banner.tsx',
]

describe('Demo cutover (181-05)', () => {
  describe('landing "See Demo" CTAs point at the verified handoff route', () => {
    for (const file of LANDING_CTA_FILES) {
      describe(file, () => {
        const source = read(file)

        it('no longer links to the retired standalone /demo index', () => {
          expect(source).not.toMatch(LEGACY_DEMO_HREF)
        })

        it('links to /demo/entry', () => {
          expect(source).toMatch(ENTRY_DEMO_HREF)
        })
      })
    }
  })

  describe('the retired standalone /demo UI is gone', () => {
    it.each(RETIRED_DEMO_FILES)('%s no longer exists', (path) => {
      expect(existsSync(resolve(root, path))).toBe(false)
    })
  })

  describe('the live demo surfaces survive', () => {
    it.each(SURVIVING_DEMO_FILES)('%s still exists', (path) => {
      expect(existsSync(resolve(root, path))).toBe(true)
    })
  })

  describe('DEMO-WORKSPACE.md documents the host-isolated architecture', () => {
    const doc = read('DEMO-WORKSPACE.md')

    it('does not reference the never-existing app/demo/route.ts', () => {
      expect(doc).not.toContain('app/demo/route.ts')
    })

    it('names the real handoff route', () => {
      expect(doc).toContain('app/demo/entry/route.ts')
    })

    it('documents the demo hostname', () => {
      expect(doc).toContain('demo.xtimator.com')
    })

    it('documents the DEMO_APP_ORIGIN env var', () => {
      expect(doc).toContain('DEMO_APP_ORIGIN')
    })

    it('states the real production pipeline', () => {
      expect(doc).toContain('GitHub Actions')
    })

    it('does not present Vercel as a deployment target alongside Coolify', () => {
      expect(doc).not.toContain('Coolify / Vercel')
    })
  })
})
