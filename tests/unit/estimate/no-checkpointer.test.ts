import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * DURABLE-02.
 *
 * Two guards:
 *   1. ARTIFACT PRESENCE (GREEN now — Task 1 wrote it): `lib/estimate/graph/CHECKPOINTING.md`
 *      exists and states the locked decision ("no LangGraph checkpointer" + "sole durability").
 *   2. NO-SAVER COMPILE (RED until Wave 2): the graph factory (`lib/estimate/graph/index.ts`)
 *      compiles the StateGraph with NO checkpointer / saver argument — `.compile(` must appear
 *      and must NOT reference `checkpointer` / `Saver`.
 *
 * The no-saver assertion guards on file existence so the file COLLECTS cleanly before Wave 2
 * (the "factory exists" expectation is what fails today — RED by design).
 */

const ROOT = process.cwd()
const ARTIFACT = resolve(ROOT, 'lib/estimate/graph/CHECKPOINTING.md')
const FACTORY = resolve(ROOT, 'lib/estimate/graph/index.ts')
const REFINE_FACTORY = resolve(ROOT, 'lib/estimate/graph/refine-graph.ts')

describe('DURABLE-02: checkpoint-granularity decision artifact (present now)', () => {
  it('CHECKPOINTING.md exists', () => {
    expect(existsSync(ARTIFACT)).toBe(true)
  })

  it('artifact states "no LangGraph checkpointer" and "sole durability"', () => {
    const src = readFileSync(ARTIFACT, 'utf8')
    expect(src).toMatch(/no LangGraph checkpointer/)
    expect(src.toLowerCase()).toContain('sole durability')
  })

  it('artifact points to the StepRunner seam as the finer-resume path (not a checkpointer)', () => {
    const src = readFileSync(ARTIFACT, 'utf8')
    expect(src).toContain('StepRunner')
    expect(src).toContain('step.run')
  })
})

describe('DURABLE-02: graph compiled with no saver (RED until Wave 2)', () => {
  it('the graph factory exists', () => {
    expect(existsSync(FACTORY)).toBe(true)
  })

  it('graph.compile() takes no checkpointer / saver argument', () => {
    if (!existsSync(FACTORY)) {
      // Guard so the suite COLLECTS before Wave 2; the "factory exists" test above is the RED gate.
      expect(existsSync(FACTORY)).toBe(true)
      return
    }
    const src = readFileSync(FACTORY, 'utf8')
    expect(src).toMatch(/\.compile\(/)
    expect(src).not.toMatch(/checkpointer/)
    expect(src).not.toMatch(/Saver/)
  })
})

/**
 * DURABLE-02 (Phase 101) — the refine sub-graph factory `buildRefineGraph`
 * (`lib/estimate/graph/refine-graph.ts`) must ALSO compile the StateGraph with NO
 * checkpointer / saver: refine runs inline via the passthrough StepRunner (USER DECISION
 * 2026-06-21 — refine is a synchronous non-persisting preview, not dispatched via Inngest).
 * RED until Wave 2 adds the factory.
 */
describe('DURABLE-02: refine graph compiled with no saver (RED until Wave 2)', () => {
  it('the refine graph factory exists', () => {
    expect(existsSync(REFINE_FACTORY)).toBe(true)
  })

  it('buildRefineGraph compiles the StateGraph with no checkpointer / saver argument', () => {
    if (!existsSync(REFINE_FACTORY)) {
      // Guard so the suite COLLECTS before Wave 2; the "factory exists" test above is the RED gate.
      expect(existsSync(REFINE_FACTORY)).toBe(true)
      return
    }
    const src = readFileSync(REFINE_FACTORY, 'utf8')
    expect(src).toMatch(/buildRefineGraph/)
    expect(src).toMatch(/\.compile\(/)
    expect(src).not.toMatch(/checkpointer/)
    expect(src).not.toMatch(/Saver/)
  })
})
