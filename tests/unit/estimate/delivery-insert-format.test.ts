// Phase 163 (SENDHUB-03): every `estimate_deliveries` INSERT payload MUST
// include a `format:` key. Static grep; catches the pitfall #5 regression
// ("6 INSERT sites is easy to miss one").

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SOURCES = [
  'app/api/estimates/[id]/send/route.ts',
  'app/api/estimates/[id]/send-sms/route.ts',
  'lib/whatsapp/send-estimate.ts',
  'lib/actions/estimate.ts', // markAsSentAction gains an insert in Wave 3
]

// Match a `.from('estimate_deliveries').insert({ ... })` payload block.
// The callback form (`.insert(payload)`) is out of scope -- research confirms
// every existing call site is inline object-literal form.
const INSERT_RE = /\.from\(\s*['"]estimate_deliveries['"]\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g

describe('SENDHUB-03: every estimate_deliveries INSERT payload includes a `format:` key', () => {
  for (const path of SOURCES) {
    it(`${path}: every insert payload has format:`, () => {
      const source = readFileSync(path, 'utf8')
      const matches = [...source.matchAll(INSERT_RE)]
      // Sanity: source files under audit MUST contain at least one insert
      // (except lib/actions/estimate.ts which Wave 3 adds -- allow zero there
      // and gate on presence in the final phase-completion sweep).
      if (path === 'lib/actions/estimate.ts' && matches.length === 0) {
        // Wave 3 hasn't shipped yet -- skip the payload gate for this file.
        // The delivery-insert grep will fail-fast if Wave 3 forgets to add it,
        // which is the desired signal.
        return
      }
      expect(
        matches.length,
        `${path} must contain at least one estimate_deliveries insert`,
      ).toBeGreaterThan(0)
      for (const [full, body] of matches) {
        expect(
          body,
          `${path}: insert payload missing \`format:\` key -- payload was ${full.slice(0, 200)}`,
        ).toMatch(/\bformat\s*:/)
      }
    })
  }
})
