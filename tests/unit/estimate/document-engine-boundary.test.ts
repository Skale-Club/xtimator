import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const ENGINE_FILES = [
  'lib/estimate/document/model.ts',
  'lib/estimate/document/labels.ts',
  'lib/estimate/document/format.ts',
  'lib/estimate/document/tokens.ts',
]

describe('lib/estimate/document/* has zero framework imports (Pitfall 5)', () => {
  for (const file of ENGINE_FILES) {
    it(`${file} imports no @react-pdf/renderer, no 'react', no components/*`, () => {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from ['"]@react-pdf\/renderer['"]/)
      expect(source).not.toMatch(/from ['"]react['"]/)
      expect(source).not.toMatch(/from ['"]@\/components\//)
    })
  }
})
