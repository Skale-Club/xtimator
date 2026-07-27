import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Demo cutover contract (181-05, CUTOVER-01/CUTOVER-02).
 *
 * Static-source-guard tests (readFileSync + regex assertions — no RTL
 * rendering, no mocks; mirrors tests/unit/settings/demo-tab-visibility.test.ts
 * and tests/unit/settings/demo-hidden-tab-guards.test.ts).
 *
 * Proves the landing page's only public demo entry point is `/demo/entry`
 * (Phase 180's verified handoff route), not the retired standalone `/demo`
 * index.
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
})
