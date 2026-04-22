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

describe('Platform branding sweep (ADMIN-07)', () => {
  it('no source file under app/ components/ lib/ contains "Xtimator"', () => {
    const roots = ['app', 'components', 'lib']
    const offenders: string[] = []
    for (const root of roots) {
      const abs = resolve(process.cwd(), root)
      try {
        for (const file of walk(abs)) {
          const body = readFileSync(file, 'utf8')
          if (/EstimateBuilder\s+Pro/.test(body)) offenders.push(file)
        }
      } catch { /* dir may not exist */ }
    }
    expect(offenders, `Files still hardcoding the legacy brand name:\n${offenders.join('\n')}`).toEqual([])
  })
})
