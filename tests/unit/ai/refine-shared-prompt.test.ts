import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * HARD-02 / UNIFY-02 — refine reuses the shared prompt builder; no bespoke refine prompt remains.
 * (Wave 0 RED scaffold; source edits land in Wave 1.)
 *
 * Both `OpenRouterAdapter.refineEstimate` and `GeminiAdapter.refineEstimate` must:
 *   1. call the shared `buildSystemPrompt(..., { mode: 'refine' })` — ONE prompt source of truth;
 *   2. NOT contain the bespoke marker `## Refinement Instruction` (Pitfall 4 — deleting one but
 *      leaving the other silently breaks UNIFY-02);
 *   3. import from `../prompt-builder`.
 *
 * Source-grep style (fs.readFileSync) so the contract is asserted structurally and independently of
 * the network. RED today: both adapters still build a bespoke refine prompt and never pass
 * `mode: 'refine'`.
 *
 * Wave-1 owner: 101-01 (delete bespoke refine prompt in both adapters; route through the shared builder).
 */

const ROOT = process.cwd()
const ADAPTERS = [
  { name: 'openrouter', path: resolve(ROOT, 'lib/ai/providers/openrouter.ts') },
  { name: 'gemini', path: resolve(ROOT, 'lib/ai/providers/gemini.ts') },
] as const

describe('HARD-02/UNIFY-02: refine reuses the shared prompt builder', () => {
  for (const adapter of ADAPTERS) {
    describe(`${adapter.name}.ts`, () => {
      it('imports from the shared prompt-builder', () => {
        const src = readFileSync(adapter.path, 'utf8')
        expect(src).toMatch(/from ['"]\.\.\/prompt-builder['"]/)
      })

      it('no longer contains the bespoke "## Refinement Instruction" marker', () => {
        const src = readFileSync(adapter.path, 'utf8')
        expect(src).not.toContain('## Refinement Instruction')
      })

      it("refineEstimate routes through buildSystemPrompt with mode: 'refine'", () => {
        const src = readFileSync(adapter.path, 'utf8')
        // Isolate the refineEstimate method body so we assert the refine path specifically,
        // not the generate path (which already calls buildSystemPrompt(input)).
        const start = src.indexOf('refineEstimate')
        expect(start).toBeGreaterThan(-1)
        const body = src.slice(start)
        // A shared-builder refine call carries a refine mode argument near the refine path.
        expect(body).toMatch(/buildSystemPrompt\([^)]*mode:\s*['"]refine['"]/)
      })
    })
  }
})
