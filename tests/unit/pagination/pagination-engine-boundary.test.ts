import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// `measure/estimator.ts` is deliberately EXCLUDED — Plan 184-03 creates it as
// the one file in this module allowed to import fontkit/linebreak/node:fs.
// Plan 184-03 ADDS `blocks-from-model.ts` below, confirming it stays
// client-safe (no react-pdf/react/components/fontkit/linebreak imports) even
// though it turns a real document model into PageBlock[].
//
// Phase 185 Plan 01 additionally EXCLUDES `measure/line-packer.ts` (imports
// 'linebreak' — the isomorphic core shared by both estimator.ts AND the new
// measure/browser-estimator.ts) and `measure/browser-estimator.ts` (imports
// 'fontkit') from this list, for the same reason estimator.ts already is.
const ENGINE_FILES = [
  'lib/estimate/pagination/types.ts',
  'lib/estimate/pagination/rules.ts',
  'lib/estimate/pagination/engine.ts',
  'lib/estimate/pagination/measure/types.ts',
  'lib/estimate/pagination/blocks-from-model.ts',
]

describe('lib/estimate/pagination/* core has zero framework/measurement imports', () => {
  for (const file of ENGINE_FILES) {
    it(`${file} imports no @react-pdf/renderer, no 'react', no components/*, no fontkit, no linebreak`, () => {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from ['"]@react-pdf\/renderer['"]/)
      expect(source).not.toMatch(/from ['"]react['"]/)
      expect(source).not.toMatch(/from ['"]@\/components\//)
      expect(source).not.toMatch(/from ['"]fontkit['"]/)
      expect(source).not.toMatch(/from ['"]linebreak['"]/)
    })
  }
})

describe('lib/estimate/pagination/measure/browser-estimator.ts is client-safe (inverse assertion)', () => {
  it('contains zero node:fs / node:path / server-only imports', () => {
    const source = readFileSync('lib/estimate/pagination/measure/browser-estimator.ts', 'utf8')
    expect(source).not.toMatch(/from ['"]node:fs['"]/)
    expect(source).not.toMatch(/from ['"]node:path['"]/)
    expect(source).not.toMatch(/require\(['"]node:fs['"]\)/)
    expect(source).not.toMatch(/require\(['"]node:path['"]\)/)
    expect(source).not.toMatch(/^import ['"]server-only['"]/m)
  })
})
