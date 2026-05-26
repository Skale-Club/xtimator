// tests/unit/mcp-server-registration.test.ts
// Phase 88: static-contract assertion that createMcpServer wires in
// registerReadTools.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SERVER_PATH = resolve(__dirname, '../../lib/mcp/server.ts')
const SERVER_SRC = readFileSync(SERVER_PATH, 'utf8')

describe('lib/mcp/server.ts — Phase 88 wiring', () => {
  it('imports registerReadTools from ./tools/read', () => {
    expect(SERVER_SRC).toMatch(/from\s+['"]\.\/tools\/read['"]/)
    expect(SERVER_SRC).toContain('registerReadTools')
  })

  it('calls registerReadTools inside createMcpServer', () => {
    // Find the createMcpServer body and assert it invokes registerReadTools.
    const factoryMatch = SERVER_SRC.match(
      /export\s+function\s+createMcpServer[\s\S]*?return\s+server\s*}/,
    )
    expect(factoryMatch).not.toBeNull()
    expect(factoryMatch![0]).toMatch(/registerReadTools\s*\(\s*server\s*,\s*authContext\s*\)/)
  })

  it('still advertises the tools capability', () => {
    expect(SERVER_SRC).toContain('tools:')
    expect(SERVER_SRC).toContain('listChanged: false')
  })
})
