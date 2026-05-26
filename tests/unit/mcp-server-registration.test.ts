// tests/unit/mcp-server-registration.test.ts
// Phase 88 (originally) + Phase 89 refactor: static-contract assertion that
// createMcpServer wires in the shared tool registry (registerAllTools), which
// now owns the single tools/list + tools/call handler pair for both read and
// write tools.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SERVER_PATH = resolve(__dirname, '../../lib/mcp/server.ts')
const SERVER_SRC = readFileSync(SERVER_PATH, 'utf8')

describe('lib/mcp/server.ts — Phase 88/89 wiring', () => {
  it('imports registerAllTools from ./tools/registry', () => {
    expect(SERVER_SRC).toMatch(/from\s+['"]\.\/tools\/registry['"]/)
    expect(SERVER_SRC).toContain('registerAllTools')
  })

  it('calls registerAllTools inside createMcpServer', () => {
    const factoryMatch = SERVER_SRC.match(
      /export\s+function\s+createMcpServer[\s\S]*?return\s+server\s*}/,
    )
    expect(factoryMatch).not.toBeNull()
    expect(factoryMatch![0]).toMatch(/registerAllTools\s*\(\s*server\s*,\s*authContext\s*\)/)
  })

  it('still advertises the tools capability', () => {
    expect(SERVER_SRC).toContain('tools:')
    expect(SERVER_SRC).toContain('listChanged: false')
  })

  it('does not call setRequestHandler twice for the same schema', () => {
    // Phase 89: registerAllTools owns the single tools/list + tools/call
    // handler pair. server.ts must NOT re-register them on top.
    const listMatches = SERVER_SRC.match(/ListToolsRequestSchema/g) ?? []
    const callMatches = SERVER_SRC.match(/CallToolRequestSchema/g) ?? []
    expect(listMatches.length).toBe(0)
    expect(callMatches.length).toBe(0)
  })
})
