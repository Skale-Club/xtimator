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

/**
 * Phase 156 (CREDITFIX-01) — regression guard for the 3 confirmed v4.15
 * CREDITUI-04 violations found on /settings/billing: TopUpPackCard's
 * "≈ X credits" subtext, AutoTopupDialog's pack-picker "(≈X credits)"
 * parenthetical, and CreditHistoryList's per-row numeric delta. This is
 * NARROWER than the FORBIDDEN token scan above (which only checks
 * real_cost_usd/markup/balance_after) — it specifically targets "a
 * credits/delta_credits value being formatted for display via
 * .toLocaleString()", the exact shape of all 3 original bugs, so a future
 * regression in ANY components/billing/ file is caught automatically, not
 * just these 3.
 *
 * IMPORTANT — why this is NOT a digit-literal regex: in source code, none
 * of the 3 real violations have a literal digit adjacent to the word
 * "credit(s)" — the number is only produced at RUNTIME via a rendered JSX
 * expression (`{credits.toLocaleString()}`) or a template-literal
 * interpolation (`` `≈ ${credits.toLocaleString()} credits` ``). A pattern
 * like /\d[\d,]*\s*credits?\b/i (matching an actual digit character) was
 * tested against the real pre-fix source of all 3 files and matched NONE
 * of them — it only matches an invented string like "≈ 1,300 credits",
 * which never appears in source. The patterns below instead target the
 * actual rendering signal: a `credits`/`delta_credits` value immediately
 * piped through `.toLocaleString()` (property access OR bare identifier),
 * or a template literal that interpolates a value next to the literal
 * word "credit(s)".
 */
const PROPERTY_ACCESS_PATTERN = /\.?(?:delta_)?credits\s*\.\s*toLocaleString\s*\(\s*\)/i
const TEMPLATE_LITERAL_CREDITS_PATTERN = /`[^`]*\$\{[^`]*\}[^`]*\bcredits?\b[^`]*`/i
const RAW_CREDIT_NUMBER_PATTERN = new RegExp(
  `(?:${PROPERTY_ACCESS_PATTERN.source})|(?:${TEMPLATE_LITERAL_CREDITS_PATTERN.source})`,
  'i'
)
const RENDERED_DELTA_CREDITS_PATTERN = /\.?delta_credits\s*\.\s*toLocaleString\s*\(\s*\)/i

describe('CREDITFIX-01: no raw credit number reaches a tenant surface (regression guard)', () => {
  const TARGET_FILES = [
    'components/billing/topup-pack-card.tsx',
    'components/billing/auto-topup-dialog.tsx',
    'components/billing/credit-history-list.tsx',
  ]

  it('Test H (sanity/RED-guard): all 3 target files exist and are non-empty', () => {
    for (const rel of TARGET_FILES) {
      const abs = resolve(ROOT, rel)
      expect(existsSync(abs), `${rel} should exist`).toBe(true)
      expect(readFileSync(abs, 'utf8').length, `${rel} should be non-empty`).toBeGreaterThan(0)
    }
  })

  it('Test F: none of the 3 files render a credits/delta_credits value via .toLocaleString(), and no template literal interpolates a value next to the word "credit(s)"', () => {
    const violations: Array<{ file: string }> = []
    for (const rel of TARGET_FILES) {
      const src = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'))
      if (RAW_CREDIT_NUMBER_PATTERN.test(src)) {
        violations.push({ file: rel })
      }
    }
    expect(violations).toEqual([])
  })

  it('Test G: none of the 3 files render delta_credits (or a derivative) formatted via .toLocaleString()', () => {
    const violations: Array<{ file: string }> = []
    for (const rel of TARGET_FILES) {
      const src = stripComments(readFileSync(resolve(ROOT, rel), 'utf8'))
      if (RENDERED_DELTA_CREDITS_PATTERN.test(src)) {
        violations.push({ file: rel })
      }
    }
    expect(violations).toEqual([])
  })

  it('Test I (broader net): every non-test file under components/billing/ is free of the raw-credit-number pattern', () => {
    const files = collectTsFiles(resolve(ROOT, COMPONENTS_BILLING_DIR))
    const violations: Array<{ file: string }> = []
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'))
      if (RAW_CREDIT_NUMBER_PATTERN.test(src)) {
        violations.push({ file: file.replace(ROOT, '').replace(/\\/g, '/') })
      }
    }
    expect(violations).toEqual([])
  })
})
