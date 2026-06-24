import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * ENGINE-01 (channel neutrality): the lib/knowledge/ module MUST be
 * channel-neutral — no source file imports lib/whatsapp/* or references any
 * channel-specific token. This is a STATIC source-grep guard (mirrors
 * tests/unit/estimate/graph-neutrality.test.ts), the isolation boundary between
 * the neutral knowledge engine and any single channel.
 *
 * GREEN from Plan 01 onward (provider.ts + embed.ts ship clean); it stays the
 * neutrality gate as Plan 02/03 add retrieve/answer/fixture. Do NOT weaken it.
 */

const ROOT = process.cwd()

// Channel-specific markers that must NEVER appear in lib/knowledge/.
const FORBIDDEN = [
  'lib/whatsapp',
  'ownerPhone',
  'WhatsAppMessage',
  'sendWhatsAppMessage',
  'whatsapp_',
  'downloadWhatsAppMedia',
] as const

const KNOWLEDGE_DIR = 'lib/knowledge'

function collectTsFiles(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) return []
  const out: string[] = []
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const full = join(dirAbs, entry.name)
    if (entry.isDirectory()) out.push(...collectTsFiles(full))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
      out.push(full)
  }
  return out
}

describe('ENGINE-01: lib/knowledge/ channel neutrality', () => {
  it('has at least one source file to scan', () => {
    const files = collectTsFiles(resolve(ROOT, KNOWLEDGE_DIR))
    expect(files.length).toBeGreaterThan(0)
  })

  it('no source file references any channel-specific token', () => {
    const files = collectTsFiles(resolve(ROOT, KNOWLEDGE_DIR))
    const violations: Array<{ file: string; token: string }> = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN) {
        if (src.includes(token)) {
          violations.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), token })
        }
      }
    }
    expect(violations).toEqual([])
  })
})
