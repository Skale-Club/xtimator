import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * HARD-06 (configurable auto-refine cap) — Wave 0 RED scaffold (Phase 102).
 *
 * Pins the cap behavior of `checkVagueAfterAssessEdge`
 * (`lib/estimate/graph/nodes/decide.ts`):
 *
 *   - DEFAULT (no env override): the cap is 1 — exactly today's behavior. A first
 *     vague result (refineAttempts undefined/0) routes to 'autoRefine'; once
 *     refineAttempts has reached 1 it routes to 'finalize'. A non-vague estimate
 *     ALWAYS routes to 'finalize'.
 *   - OVERRIDE (`AUTO_REFINE_MAX_ATTEMPTS=2`): the edge keeps routing to
 *     'autoRefine' while refineAttempts < 2, then 'finalize' at 2.
 *
 * RED today (intended): the source still hard-codes `(refineAttempts ?? 0) < 1`,
 * so the OVERRIDE case (`AUTO_REFINE_MAX_ATTEMPTS=2`, refineAttempts:1 → expect
 * 'autoRefine') FAILS — the literal `1` ignores the env. The DEFAULT and
 * non-vague cases are already green and pin "no behavior change at the default".
 *
 * Wave-1/2 owner: Phase 102 Plan 02 (HARD-06 cap) replaces the literal `1` with
 * a module constant `AUTO_REFINE_MAX_ATTEMPTS` (read once at module load from
 * `process.env`, default 1). Because the constant is read at module load, each
 * case uses `vi.resetModules()` + a fresh dynamic `await import()` so the env
 * stub is read fresh per invocation.
 *
 * Mocks/env are scoped: the env var is set per-case and deleted in afterEach so
 * cross-suite runs do not leak.
 */

import { vi } from 'vitest'

type EdgeState = {
  isVague?: boolean
  refineAttempts?: number
}

/**
 * Re-import `checkVagueAfterAssessEdge` fresh so a per-case env stub is read at
 * module load (the configurable cap is a module-level constant after Plan 02).
 */
async function freshEdge(): Promise<(state: EdgeState) => string> {
  vi.resetModules()
  const mod = await import('@/lib/estimate/graph/nodes/decide')
  return mod.checkVagueAfterAssessEdge as unknown as (state: EdgeState) => string
}

beforeEach(() => {
  delete process.env.AUTO_REFINE_MAX_ATTEMPTS
})

afterEach(() => {
  delete process.env.AUTO_REFINE_MAX_ATTEMPTS
  vi.resetModules()
})

describe('HARD-06: configurable auto-refine cap (checkVagueAfterAssessEdge)', () => {
  describe('default cap = 1 (no env override) — today behavior preserved', () => {
    it('first vague result (refineAttempts undefined) routes to autoRefine', async () => {
      const edge = await freshEdge()
      expect(edge({ isVague: true, refineAttempts: undefined })).toBe('autoRefine')
    })

    it('after one attempt (refineAttempts = 1) routes to finalize', async () => {
      const edge = await freshEdge()
      expect(edge({ isVague: true, refineAttempts: 1 })).toBe('finalize')
    })
  })

  describe('AUTO_REFINE_MAX_ATTEMPTS = 2 (env override)', () => {
    it('one attempt done (refineAttempts = 1) still routes to autoRefine (loops again)', async () => {
      process.env.AUTO_REFINE_MAX_ATTEMPTS = '2'
      const edge = await freshEdge()
      // RED today: source hard-codes `< 1`, so this returns 'finalize' until Plan 02.
      expect(edge({ isVague: true, refineAttempts: 1 })).toBe('autoRefine')
    })

    it('cap reached (refineAttempts = 2) routes to finalize', async () => {
      process.env.AUTO_REFINE_MAX_ATTEMPTS = '2'
      const edge = await freshEdge()
      expect(edge({ isVague: true, refineAttempts: 2 })).toBe('finalize')
    })
  })

  describe('non-vague estimate always finalizes regardless of cap', () => {
    it('default cap: isVague false → finalize', async () => {
      const edge = await freshEdge()
      expect(edge({ isVague: false, refineAttempts: 0 })).toBe('finalize')
    })

    it('override cap: isVague false → finalize', async () => {
      process.env.AUTO_REFINE_MAX_ATTEMPTS = '2'
      const edge = await freshEdge()
      expect(edge({ isVague: false, refineAttempts: 0 })).toBe('finalize')
    })
  })
})
