// tests/unit/mcp-settings-page.test.ts
// Phase 90: static-contract checks for the MCP settings page.
//
// We don't render the page (it's a server component that calls cookies() and
// supabase — out of scope for a vitest jsdom env). Instead we assert the file
// exists, imports the canonical resolvers, references every tool by its
// snake_case name (so the doc copy can't silently drift when tool names
// change), and that the parent /settings/integrations page links to the
// sub-page.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const PAGE_PATH = resolve(
  ROOT,
  'app/(app)/settings/integrations/mcp/page.tsx',
)
const PARENT_PATH = resolve(
  ROOT,
  'app/(app)/settings/integrations/page.tsx',
)
const COPY_BUTTON_PATH = resolve(
  ROOT,
  'app/(app)/settings/integrations/mcp/copy-button.tsx',
)

describe('app/(app)/settings/integrations/mcp/page.tsx — source contract', () => {
  it('the page file exists', () => {
    expect(existsSync(PAGE_PATH)).toBe(true)
  })

  it('the copy-button client component file exists', () => {
    expect(existsSync(COPY_BUTTON_PATH)).toBe(true)
  })

  it('imports getActiveCompany from @/lib/queries/active-company', () => {
    const src = readFileSync(PAGE_PATH, 'utf8')
    expect(src).toMatch(/from\s+['"]@\/lib\/queries\/active-company['"]/)
    expect(src).toContain('getActiveCompany')
  })

  it('imports resolveIssuer from @/lib/oauth/issuer', () => {
    const src = readFileSync(PAGE_PATH, 'utf8')
    expect(src).toMatch(/from\s+['"]@\/lib\/oauth\/issuer['"]/)
    expect(src).toContain('resolveIssuer')
  })

  it.each([
    'list_estimates',
    'get_estimate',
    'list_clients',
    'list_projects',
    'create_estimate',
    'check_job_status',
  ])('source references the %s tool by snake_case name', (toolName) => {
    const src = readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain(toolName)
  })

  it('builds the connect URL by appending /api/mcp to the issuer', () => {
    const src = readFileSync(PAGE_PATH, 'utf8')
    expect(src).toMatch(/\/api\/mcp/)
  })

  it('documents the claude mcp add command for Claude Code', () => {
    const src = readFileSync(PAGE_PATH, 'utf8')
    // The command is built from a template literal; the prefix is the stable part.
    expect(src).toContain('claude mcp add xtimator')
  })
})

describe('app/(app)/settings/integrations/page.tsx — links to MCP sub-page', () => {
  it('references /settings/integrations/mcp', () => {
    const src = readFileSync(PARENT_PATH, 'utf8')
    expect(src).toContain('/settings/integrations/mcp')
  })

  it('mentions MCP in the entry card', () => {
    const src = readFileSync(PARENT_PATH, 'utf8')
    expect(src).toMatch(/MCP/i)
  })
})
