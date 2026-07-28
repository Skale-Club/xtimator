import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// `measure/estimator.ts` is deliberately EXCLUDED — Plan 184-03 creates it as
// the one file in this module allowed to import fontkit/linebreak/node:fs.
// Plan 184-03 also ADDS `blocks-from-model.ts` to this array once it exists.
const ENGINE_FILES = [
  'lib/estimate/pagination/types.ts',
  'lib/estimate/pagination/rules.ts',
  'lib/estimate/pagination/engine.ts',
  'lib/estimate/pagination/measure/types.ts',
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
