import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const p = join(dir, entry)
    let s: ReturnType<typeof statSync>
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

// PUBURL-04: every estimate share-URL construction must go through
// buildEstimatePublicPath() (friendly) or buildShareLink() (legacy,
// client-only). No file outside those two sanctioned builders may
// hand-roll `/estimate/${...}` from a share_token/public_slug_token.
const FORBIDDEN = /\/estimate\/\$\{/

const EXEMPT = new Set([
  resolve(process.cwd(), 'lib/estimate/public-url.ts'),
  resolve(process.cwd(), 'lib/utils/share-link.ts'),
])

describe('No hardcoded estimate share-URL construction (PUBURL-04)', () => {
  // Walking app/components/lib (a large, growing tree) can approach vitest's
  // 5s default test timeout on a cold run (mirrors env-var-sweep.test.ts's
  // same walk() cost) — an explicit longer timeout keeps this deterministic.
  it(
    'no source file outside the two sanctioned builders constructs an estimate share URL inline',
    () => {
      const offenders: string[] = []

      for (const root of ['app', 'components', 'lib']) {
        const abs = resolve(process.cwd(), root)
        for (const file of walk(abs)) {
          if (EXEMPT.has(file)) continue
          const body = readFileSync(file, 'utf8')
          if (FORBIDDEN.test(body)) {
            offenders.push(file)
          }
        }
      }

      expect(
        offenders,
        `Files still hand-rolling an inline estimate share URL:\n${offenders.join('\n')}`
      ).toEqual([])
    },
    20000
  )
})
