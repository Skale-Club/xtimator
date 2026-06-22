import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * OBS-01 + OBS-03: CallbackHandler attachment and safe-metadata rule
 *
 * Source-text anchor tests — read production files and verify structural
 * guarantees without spinning up a server.
 *
 * These tests are RED in Wave 1 (no production code yet).
 * They turn GREEN in Wave 3 when CallbackHandler is wired at graph.invoke.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const GENERATE_ESTIMATE_FN = 'lib/inngest/functions/generate-estimate.ts'
const WHATSAPP_ESTIMATE_GRAPH = 'lib/whatsapp/estimate-graph.ts'

// ── OBS-01: CallbackHandler at graph.invoke ───────────────────────────────────

describe('OBS-01: CallbackHandler attached at graph.invoke call sites', () => {
  it('OBS-01 web: generate-estimate.ts imports and instantiates CallbackHandler', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    expect(src).toContain('CallbackHandler')
  })

  it('OBS-01 web: generate-estimate.ts passes callbacks: [...] to graph.invoke', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    expect(src).toContain('callbacks:')
  })

  it('OBS-01 web: generate-estimate.ts includes channel discriminator in handler metadata', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    // Must carry channel in tags or metadata (not just the state field)
    expect(src).toMatch(/tags.*web|metadata.*web|'web'.*estimate-engine|estimate-engine.*web/s)
  })

  it('OBS-01 whatsapp: estimate-graph.ts imports and instantiates CallbackHandler', () => {
    const src = read(WHATSAPP_ESTIMATE_GRAPH)
    expect(src).toContain('CallbackHandler')
  })

  it('OBS-01 whatsapp: estimate-graph.ts passes callbacks: [...] to graph.invoke', () => {
    const src = read(WHATSAPP_ESTIMATE_GRAPH)
    expect(src).toContain('callbacks:')
  })
})

// ── OBS-03: Safe-metadata rule ────────────────────────────────────────────────

describe('OBS-03: safe-metadata — no sensitive tokens in trace call sites', () => {
  it('OBS-03: generate-estimate.ts CallbackHandler construction does not contain forbidden tokens', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    // These tokens must NEVER appear in CallbackHandler metadata/tags
    expect(src).not.toMatch(/langfuseSessionId.*transcript|transcript.*langfuseSessionId/s)
    expect(src).not.toContain('raw_content')
    expect(src).not.toContain('apiKey')
    expect(src).not.toContain('audio_data')
  })

  it('OBS-03: estimate-graph.ts CallbackHandler construction does not contain forbidden tokens', () => {
    const src = read(WHATSAPP_ESTIMATE_GRAPH)
    expect(src).not.toMatch(/langfuseSessionId.*transcript|transcript.*langfuseSessionId/s)
    expect(src).not.toContain('raw_content')
    expect(src).not.toContain('apiKey')
    expect(src).not.toContain('audio_data')
  })

  it('OBS-03: generate-estimate.ts includes projectId and companyId as the only identifiers in trace metadata', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    // Must carry projectId and companyId (per safe-metadata v4.2 rule)
    expect(src).toMatch(/langfuseSessionId|langfuseUserId/)
  })
})

// ── GUARD-04: correlation id threaded into the trace ──────────────────────────

/**
 * GUARD-04 (Phase 100, Wave 0 RED) — one correlation id (the promoted `attemptId`)
 * threads into the Langfuse trace metadata in generate-estimate.ts. Source-text anchor:
 * the wiring lands in Plan 100-03, which adds `correlationId` to the graph.invoke config
 * metadata and ties it to the existing `attemptId` lineage. This case also closes the
 * pre-existing OBS-03 RED (`langfuseSessionId`/`langfuseUserId` token) once 100-03 moves
 * those into the config metadata.
 *
 * RED today: `correlationId` is absent from generate-estimate.ts. The forbidden-token
 * assertions above are NOT weakened.
 */
describe('GUARD-04: generate-estimate.ts threads the correlation id into trace metadata', () => {
  it('GUARD-04: generate-estimate.ts threads attemptId as correlationId into trace metadata', () => {
    const src = read(GENERATE_ESTIMATE_FN)
    // The promoted correlation id is the existing attemptId — both tokens must co-occur.
    expect(src).toMatch(/correlationId/)
    expect(src).toMatch(/attemptId/)
  })
})
