import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * quick-260821 — static regression guard for the Gemini null-cost bug
 * (lib/ai/providers/gemini.ts previously recorded `realCostUsd: null` at
 * every recordAICost call site, which lib/billing/credit-ledger.ts's
 * recordCreditDebit (`if (input.realCostUsd == null) return`) silently reads
 * as "no debit" — so the Gemini fallback, ~95% of prod traffic, never
 * charged credits).
 *
 * This test greps every lib/ai/providers/*.ts file for the literal
 * `realCostUsd: null` and fails the build if it finds one — UNLESS that
 * exact line also carries a trailing `// cost-unknown: <reason>` comment,
 * which is the explicit, reviewable escape hatch for a genuinely-unknown
 * cost (mirrors the null-vs-0 discipline documented in
 * lib/billing/record-ai-cost.ts: null must mean "unknown", never "silently
 * unimplemented").
 *
 * A COMPUTED expression (e.g. `realCostUsd: computeGeminiCostUsd(...)`,
 * `realCostUsd: json.usage?.cost ?? null`) is fine — it's the bare, literal
 * `null` with no accompanying justification that this guard blocks, because
 * that's exactly the shape of the original bug: a hard-coded "always
 * unknown" with no explanation and no attempt to compute a real number.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')
// Every directory that records AI cost rows — the main provider adapters AND
// the price-research adapters (which record operation_type 'price_research').
const SCAN_DIRS = [
  join(REPO_ROOT, 'lib', 'ai', 'providers'),
  join(REPO_ROOT, 'lib', 'estimate', 'price-research', 'adapters'),
]
const PROVIDERS_DIR = SCAN_DIRS[0]

// Matches `realCostUsd: null` (any surrounding whitespace/comma), optionally
// followed later on the SAME line by a `// cost-unknown: <reason>` comment.
const BARE_NULL_RE = /realCostUsd\s*:\s*null\b/
const JUSTIFIED_RE = /\/\/\s*cost-unknown:\s*\S+/

describe('provider-cost-invariant (quick-260821): no silent realCostUsd: null regressions', () => {
  const entries = SCAN_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .sort()
      .map((f) => ({ dir, file: f })),
  )
  const files = entries.filter((e) => e.dir === PROVIDERS_DIR).map((e) => e.file)

  it('finds at least the known provider adapter files (sanity check the glob itself works)', () => {
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual(expect.arrayContaining(['gemini.ts', 'openrouter.ts']))
    expect(entries.map((e) => e.file)).toEqual(expect.arrayContaining(['openrouter-web.ts']))
  })

  for (const { dir, file } of entries) {
    it(`${file} — every literal "realCostUsd: null" carries a "// cost-unknown: <reason>" justification`, () => {
      const fullPath = join(dir, file)
      const content = readFileSync(fullPath, 'utf8')
      const lines = content.split('\n')

      const unjustifiedOffenders: Array<{ line: number; text: string }> = []
      lines.forEach((lineText, idx) => {
        if (BARE_NULL_RE.test(lineText) && !JUSTIFIED_RE.test(lineText)) {
          unjustifiedOffenders.push({ line: idx + 1, text: lineText.trim() })
        }
      })

      if (unjustifiedOffenders.length > 0) {
        const detail = unjustifiedOffenders
          .map((o) => `  ${file}:${o.line}: ${o.text}`)
          .join('\n')
        throw new Error(
          `Found unjustified "realCostUsd: null" in lib/ai/providers/${file}. ` +
            `Compute a real cost (see lib/ai/pricing/gemini.ts's computeGeminiCostUsd for the ` +
            `pattern), or if the cost is genuinely unknowable, add a trailing ` +
            `"// cost-unknown: <reason>" comment on the SAME line to document why.\n${detail}`
        )
      }

      expect(unjustifiedOffenders).toHaveLength(0)
    })
  }
})
