import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * ENGINE-01 (Wave 0 RED stub — source lands in Wave 2).
 *
 * The shared estimate core (`lib/estimate/graph/` + `lib/estimate/quality/`) MUST be
 * channel-neutral: it imports NO `lib/whatsapp/*` and references none of the
 * WhatsApp-specific tokens. This is a STATIC source-grep guard — the only isolation
 * boundary between the canonical graph and a single channel.
 *
 * RED today: the core source files (state.ts / types.ts / nodes / quality/vagueness.ts)
 * do not exist yet, so the "core files exist" assertion fails. Once Wave 2 lands the
 * neutral core, the same test becomes the GREEN neutrality gate.
 */

const ROOT = process.cwd()

// WhatsApp-specific markers that must NEVER appear in the shared core.
const FORBIDDEN = [
  'lib/whatsapp',
  'ownerPhone',
  'WhatsAppMessage',
  'sendWhatsAppMessage',
  'whatsapp_',
  'downloadWhatsAppMedia',
] as const

// Directories that make up the channel-neutral shared core.
const CORE_DIRS = ['lib/estimate/graph', 'lib/estimate/quality'] as const

// Files whose presence proves the core was actually extracted (not just an empty dir).
const REQUIRED_CORE_FILES = [
  'lib/estimate/graph/state.ts',
  'lib/estimate/graph/types.ts',
  'lib/estimate/quality/vagueness.ts',
] as const

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

describe('ENGINE-01: shared core neutrality (no WhatsApp leakage)', () => {
  it('the channel-neutral core files exist (RED until Wave 2 extracts them)', () => {
    const missing = REQUIRED_CORE_FILES.filter(
      (f) => !existsSync(resolve(ROOT, f))
    )
    expect(missing).toEqual([])
  })

  it('no file under the shared core references any WhatsApp-specific token', () => {
    const files = CORE_DIRS.flatMap((d) => collectTsFiles(resolve(ROOT, d)))
    // Once the core exists there must be at least one source file to scan.
    expect(files.length).toBeGreaterThan(0)

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
