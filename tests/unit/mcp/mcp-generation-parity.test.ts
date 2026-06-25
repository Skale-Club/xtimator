import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * MPAR-01 — static binding + three-channel convergence proof.
 *
 * The companion to the BEHAVIOR guard (tests/unit/mcp-create-estimate.test.ts,
 * which proves the dispatch still fires the event with the right payload + id).
 * This file is a pure source-string assertion (mirrors
 * tests/unit/agent-tools/neutrality.test.ts — readFileSync + grep, no DB, no
 * mocks, no secrets): it proves the MCP create_estimate tool BINDS the neutral
 * `createEstimate` core rather than re-implementing the Inngest dispatch, and
 * that all three channel adapters (web chat / MCP / WhatsApp) route generation
 * through ONE engine.
 */

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8')

describe('MPAR-01: MCP binds the neutral core (not a re-implementation)', () => {
  it('mcp create_estimate imports + calls the neutral createEstimate', () => {
    const src = read('lib/mcp/tools/write.ts')
    // Imports from the neutral barrel (or the create-estimate module directly).
    expect(src).toContain("from '@/lib/agent-tools'")
    expect(src).toMatch(/from '@\/lib\/agent-tools(\/create-estimate)?'/)
    expect(src).toContain('createEstimate(')
  })

  it('mcp create_estimate no longer dispatches EVENT_ESTIMATE_GENERATE itself', () => {
    const src = read('lib/mcp/tools/write.ts')
    expect(src).not.toContain('EVENT_ESTIMATE_GENERATE')
  })

  it('all three channel adapters route generation through the neutral core', () => {
    // Web chat — binds the neutral createEstimate.
    expect(read('lib/chat/tools.ts')).toContain('createEstimate(')
    // MCP — binds the neutral createEstimate.
    expect(read('lib/mcp/tools/write.ts')).toContain('createEstimate(')
    // WhatsApp confirm-flow — converges on the same generation engine.
    expect(read('lib/whatsapp/confirm-actions.ts')).toContain(
      'generateEstimateForProject(',
    )
  })
})
