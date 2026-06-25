/**
 * Phase 125 SCOPE FENCE (static-source) — UI-only invariant.
 *
 * Phase 125 builds the chat UI shell ONLY. The Phase-124 backend is frozen:
 * `app/api/chat/route.ts` (the stream) and `lib/chat/tools.ts` (the 8 tools) must
 * NOT be edited by any UI task. Rather than snapshot whole files, this asserts the
 * load-bearing structural invariants that would only change if the backend were
 * touched — mirroring the 124 route static-source tests.
 *
 * Pure file read — runs in CI with no DB and no secrets.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const ROUTE_PATH = 'app/api/chat/route.ts'
const TOOLS_PATH = 'lib/chat/tools.ts'

describe('Phase 125 scope fence: backend stays UI-untouched', () => {
  it('route still returns the v6 UIMessage stream (toUIMessageStreamResponse)', () => {
    const src = read(ROUTE_PATH)
    expect(src).toContain('toUIMessageStreamResponse')
  })

  it('route still round-trips the FULL messages array (originalMessages: messages)', () => {
    const src = read(ROUTE_PATH)
    // The full-array contract: the UI must send the whole messages[] (no
    // last-message-only optimization). If this drifts, the body wiring broke.
    expect(src).toContain('originalMessages: messages')
  })

  it('tools module still exports buildChatTools (the 8 tools untouched)', () => {
    const src = read(TOOLS_PATH)
    expect(src).toContain('buildChatTools')
  })

  it('backend does NOT import UI modules (no @/components/chat leakage)', () => {
    const route = read(ROUTE_PATH)
    const tools = read(TOOLS_PATH)
    for (const src of [route, tools]) {
      expect(src).not.toContain('@/components/chat')
      expect(src).not.toContain('@/lib/chat/history-mapper')
    }
  })
})
