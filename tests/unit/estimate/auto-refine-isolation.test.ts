import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()

/**
 * Phase 96 — Wave 0 RED stubs (auto-refine isolation).
 *
 * All behavioral tests start RED because the production files they target
 * (`lib/estimate/graph/nodes/auto-refine.ts` and the updated
 * `lib/estimate/adapters/default.ts`) do not exist yet or have empty finalize
 * bodies. These stubs define the acceptance contracts Wave 2 must satisfy.
 *
 * Requirements covered: SMART-01, SMART-03, SMART-04, QA-02.
 */
describe('Phase 96 — auto-refine isolation (SMART-01/03/04, QA-02)', () => {
  /**
   * Test A — SMART-01: autoRefine node increments refineAttempts and resets
   * estimateId / isVague.
   *
   * Behavioral contract: `autoRefineNode` returns
   *   { refineAttempts: 1, estimateId: undefined, isVague: undefined, prompts: [..., REFINE_HINT] }
   * when called with initial state where refineAttempts is undefined.
   *
   * RED — auto-refine.ts does not exist yet.
   */
  it('SMART-01: autoRefineNode increments refineAttempts and resets estimateId/isVague (RED — Wave 0 stub)', () => {
    expect.fail('RED — auto-refine.ts does not exist yet')
  })

  /**
   * Test B — SMART-03/04: default adapter finalize handles the vague-after-refine
   * path.
   *
   * Behavioral contract: when called with
   *   { isVague: true, refineAttempts: 1, projectId: 'p1', estimateId: 'e1' }
   * the default adapter `finalize` must:
   *   1. Write `projects.status = 'awaiting_details'` (SMART-03).
   *   2. Chain `.eq('company_id', companyId)` using the closure-captured value.
   *   3. Call `revertVagueEstimate` to clean up the $0 estimate.
   *   4. Return `{ needsDetails: true }` (SMART-04).
   *
   * RED — default adapter finalize is still a no-op; Wave 2 adds body.
   */
  it('SMART-03/04: default adapter finalize writes awaiting_details and returns needsDetails (RED — Wave 0 stub)', () => {
    expect.fail('RED — default adapter finalize is still a no-op; Wave 2 adds body')
  })

  /**
   * Test C — QA-02 source anchor: auto-refine.ts reads state.companyId (not a
   * parameter overrideable by the LLM).
   *
   * Source-text check: the file must use `state.companyId` directly and must NOT
   * expose companyId as a named function parameter in any function signature, nor
   * assign it from a `params` or `input` object.
   *
   * If the file does not exist yet the test fails RED with an explicit message.
   */
  it('QA-02 source anchor: auto-refine.ts reads state.companyId (never an overrideable param)', () => {
    const path = resolve(ROOT, 'lib/estimate/graph/nodes/auto-refine.ts')
    if (!existsSync(path)) {
      expect.fail('RED — lib/estimate/graph/nodes/auto-refine.ts does not exist yet')
    }
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('state.companyId')
    expect(src).not.toMatch(/function\s+\w+\s*\([^)]*companyId/)
    expect(src).not.toMatch(/companyId\s*=\s*params\./i)
    expect(src).not.toMatch(/companyId\s*=\s*input\./i)
  })

  /**
   * Test D — QA-02 closure isolation: default adapter finalize chains
   * .eq('company_id') from the closure value, not from state.
   *
   * Behavioral contract: the `.eq('company_id', companyId)` call in finalize must
   * use the closure-captured value from `makeDefaultAdapter({ companyId: 'company-SECRET' })`,
   * NOT `state.companyId`. This ensures the tenant scope cannot be altered by
   * graph-state manipulation.
   *
   * RED — default adapter finalize is still a no-op; Wave 2 adds body.
   */
  it('QA-02 closure isolation: default adapter finalize uses closure companyId, not state.companyId (RED — Wave 0 stub)', () => {
    expect.fail('RED — default adapter finalize is still a no-op; Wave 2 adds body')
  })
})
