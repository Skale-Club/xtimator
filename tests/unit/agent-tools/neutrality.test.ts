import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * ENGINE-01 (channel neutrality): the lib/agent-tools/ module MUST be
 * channel-neutral — no source file imports lib/whatsapp/* or references any
 * channel-specific token. This is a STATIC source-grep guard (mirrors
 * tests/unit/knowledge/knowledge-neutrality.test.ts), the isolation boundary
 * between the neutral domain tools (consumed by WhatsApp + chat + MCP) and any
 * single channel.
 *
 * RED-by-missing-dir until Plan 122-02/122-03 add the first lib/agent-tools/*.ts
 * file: "has at least one source file to scan" fails because collectTsFiles()
 * returns [] on a non-existent dir. It flips GREEN the moment the first neutral
 * source file ships and stays the permanent neutrality gate (NEUT-05 forward
 * guard). Do NOT weaken it.
 */

const ROOT = process.cwd()

// Channel-specific markers that must NEVER appear in lib/agent-tools/.
const FORBIDDEN = [
  'lib/whatsapp',
  'ownerPhone',
  'WhatsAppMessage',
  'sendWhatsAppMessage',
  'whatsapp_',
  'downloadWhatsAppMedia',
] as const

const AGENT_TOOLS_DIR = 'lib/agent-tools'

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

describe('ENGINE-01: lib/agent-tools/ channel neutrality', () => {
  it('has at least one source file to scan', () => {
    const files = collectTsFiles(resolve(ROOT, AGENT_TOOLS_DIR))
    expect(files.length).toBeGreaterThan(0)
  })

  it('no source file references any channel-specific token', () => {
    const files = collectTsFiles(resolve(ROOT, AGENT_TOOLS_DIR))
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
