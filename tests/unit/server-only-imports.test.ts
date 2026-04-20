import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOTS = ['app', 'components']
const FORBIDDEN = ['@/lib/platform-config', '@/lib/crypto/aes']

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

describe('server-only imports (ADMIN-14, R-01, R-03)', () => {
  it('no client component imports @/lib/platform-config or @/lib/crypto/aes', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      const abs = resolve(process.cwd(), root)
      for (const file of walk(abs)) {
        const body = readFileSync(file, 'utf8')
        const firstLines = body.split('\n').slice(0, 3).join('\n')
        if (!/['"]use client['"]/.test(firstLines)) continue
        for (const bad of FORBIDDEN) {
          if (body.includes(bad)) {
            offenders.push(`${file} imports ${bad}`)
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
