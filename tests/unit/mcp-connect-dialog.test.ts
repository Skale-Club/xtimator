import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DIALOG_PATH = resolve(
  __dirname,
  '../../app/(app)/settings/integrations/mcp/connect-dialog.tsx',
)
const PAGE_PATH = resolve(
  __dirname,
  '../../app/(app)/settings/integrations/mcp/page.tsx',
)

describe('ConnectDialog — single-button + tabs UX (static contract)', () => {
  it('file exists at expected path', () => {
    expect(existsSync(DIALOG_PATH)).toBe(true)
  })

  const src = existsSync(DIALOG_PATH) ? readFileSync(DIALOG_PATH, 'utf8') : ''

  it('is a client component', () => {
    expect(src).toMatch(/^\s*['"]use client['"]/m)
  })

  it('imports Dialog primitives from components/ui/dialog', () => {
    expect(src).toMatch(/import\s+\{[^}]*Dialog[^}]*\}\s+from\s+['"]@\/components\/ui\/dialog['"]/)
  })

  it('imports Tabs primitives from components/ui/tabs', () => {
    expect(src).toMatch(/import\s+\{[^}]*Tabs[^}]*\}\s+from\s+['"]@\/components\/ui\/tabs['"]/)
  })

  it('renders three tabs (Claude Code, Claude.ai / Desktop, ChatGPT)', () => {
    expect(src).toMatch(/TabsTrigger\s+value=["']claude-code["']/)
    expect(src).toMatch(/TabsTrigger\s+value=["']claude-ai["']/)
    expect(src).toMatch(/TabsTrigger\s+value=["']chatgpt["']/)
  })

  it('takes mcpUrl and claudeCodeCmd as props (from server component)', () => {
    expect(src).toMatch(/mcpUrl:\s*string/)
    expect(src).toMatch(/claudeCodeCmd:\s*string/)
  })

  it('uses DialogTrigger asChild with a Button (single connect entry point)', () => {
    expect(src).toMatch(/DialogTrigger\s+asChild/)
  })
})

describe('mcp/page.tsx — uses ConnectDialog (no longer renders 3 stacked cards)', () => {
  const src = readFileSync(PAGE_PATH, 'utf8')

  it('imports ConnectDialog', () => {
    expect(src).toMatch(/import\s+\{\s*ConnectDialog\s*\}\s+from\s+['"]\.\/connect-dialog['"]/)
  })

  it('renders <ConnectDialog mcpUrl={...} claudeCodeCmd={...} />', () => {
    expect(src).toMatch(/<ConnectDialog\s+mcpUrl=\{mcpUrl\}\s+claudeCodeCmd=\{claudeCodeCmd\}/)
  })

  it('no longer has the three separate CardTitle headings for the connect clients', () => {
    // The old layout had <CardTitle>Claude Code (CLI)</CardTitle> etc. as direct
    // children of the page. They now live inside the dialog. The page itself
    // should NOT contain those literal titles anymore.
    expect(src).not.toMatch(/<CardTitle>Claude Code \(CLI\)<\/CardTitle>/)
    expect(src).not.toMatch(/<CardTitle>Claude\.ai \/ Claude Desktop<\/CardTitle>/)
    expect(src).not.toMatch(/<CardTitle>ChatGPT \(Connectors\)<\/CardTitle>/)
  })
})
