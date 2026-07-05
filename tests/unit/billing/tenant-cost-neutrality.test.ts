import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Phase 152 Plan 01 (CREDITUI-04) — tenant-facing cost neutrality.
 *
 * Static source-grep guard (mirrors tests/unit/agent-tools/neutrality.test.ts):
 * lib/queries/credits.ts and every non-test file under components/billing/
 * must NEVER contain the literal tokens `real_cost_usd`, `markup`,
 * `balance_after` as bare substrings. This is the structural enforcement
 * mechanism for CREDITUI-04's "never even indirectly" requirement — a hard
 * gate, not just a code-review convention.
 *
 * Task 2 already reworded the credit-balance-card.tsx and
 * credit-history-list.tsx doc comments that used to contain these tokens as
 * prose. lib/queries/credits.ts's OWN doc comment (untouched by this plan —
 * the read_first note explicitly says DO NOT modify it) still names the
 * forbidden tokens as prose describing the cardinal rule it enforces, so a
 * naive bare-substring scan would false-positive on that comment. Per the
 * plan's own fallback instruction, both comment styles are stripped before
 * scanning rather than weakening the forbidden-token list.
 */

const ROOT = process.cwd()

const FORBIDDEN = ['real_cost_usd', 'markup', 'balance_after'] as const

const COMPONENTS_BILLING_DIR = 'components/billing'
const CREDITS_QUERY_FILE = 'lib/queries/credits.ts'

function collectTsFiles(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) return []
  const out: string[] = []
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const full = join(dirAbs, entry.name)
    if (entry.isDirectory()) out.push(...collectTsFiles(full))
    else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    )
      out.push(full)
  }
  return out
}

/**
 * Strips block comments and line comments so the scan targets executable
 * source (imports, selects, prop names) — never doc-comment prose describing
 * the invariant. This is deliberately conservative (does not understand
 * strings that contain a double-slash), which is fine for this codebase's
 * comment style.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function scanFiles(files: string[]): Array<{ file: string; token: string }> {
  const violations: Array<{ file: string; token: string }> = []
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const token of FORBIDDEN) {
      if (src.includes(token)) {
        violations.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), token })
      }
    }
  }
  return violations
}

describe('CREDITUI-04: tenant-facing cost neutrality', () => {
  it('Test 3 (sanity/RED-guard): the scan visits more than zero files', () => {
    const files = [
      ...collectTsFiles(resolve(ROOT, COMPONENTS_BILLING_DIR)),
      resolve(ROOT, CREDITS_QUERY_FILE),
    ]
    expect(files.length).toBeGreaterThan(0)
  })

  it('Test 1: lib/queries/credits.ts contains none of the forbidden tokens', () => {
    const violations = scanFiles([resolve(ROOT, CREDITS_QUERY_FILE)])
    expect(violations).toEqual([])
  })

  it('Test 2: every non-test file under components/billing/ contains none of the forbidden tokens', () => {
    const files = collectTsFiles(resolve(ROOT, COMPONENTS_BILLING_DIR))
    const violations = scanFiles(files)
    expect(violations).toEqual([])
  })
})
