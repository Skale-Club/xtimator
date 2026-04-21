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

// Matches direct env reads of provider API keys that should now go through getIntegrationKey()
const FORBIDDEN = /process\.env\.(RESEND|ANTHROPIC|OPENAI)_API_KEY/

// Only lib/platform-config.ts is allowed to read these env vars (as a dev fallback)
const EXEMPT = new Set([resolve(process.cwd(), 'lib/platform-config.ts')])

describe('Env-var sweep (ADMIN-06)', () => {
  it('no source file outside lib/platform-config.ts reads provider API keys directly', () => {
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
      `Files still reading provider API keys directly from process.env:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
