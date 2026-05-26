import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROXY = readFileSync(resolve(__dirname, '../../proxy.ts'), 'utf8')

describe('proxy.ts — OAuth + MCP public-endpoint bypasses (regression guard)', () => {
  it('bypasses /.well-known/oauth-* (RFC 8414 + 9728 discovery must be public)', () => {
    expect(PROXY).toMatch(/pathname\.startsWith\(['"]\/\.well-known\/oauth-['"]\)/)
  })

  it('bypasses /oauth/register (RFC 7591 dynamic client registration is public)', () => {
    expect(PROXY).toMatch(/pathname === ['"]\/oauth\/register['"]/)
  })

  it('bypasses /oauth/token (RFC 6749 token endpoint is public, PKCE-protected)', () => {
    expect(PROXY).toMatch(/pathname === ['"]\/oauth\/token['"]/)
  })

  it('bypasses /api/mcp (Bearer-auth, not cookie-auth)', () => {
    expect(PROXY).toMatch(/pathname\.startsWith\(['"]\/api\/mcp['"]\)/)
  })

  it('does NOT bypass /oauth/authorize (consent screen requires signed-in user)', () => {
    // The authorize endpoint must go through updateSession so unauthenticated
    // visitors are redirected to /auth/login?next=... and return after sign-in.
    // We assert by checking that the bypass block doesn't list /oauth/authorize
    // as a pass-through.
    const bypassBlock = PROXY.match(
      /\/\/ OAuth \+ MCP bypass[\s\S]*?return NextResponse\.next\(\)\s*\}/,
    )?.[0]
    expect(bypassBlock, 'OAuth bypass block must exist').toBeTruthy()
    expect(bypassBlock).not.toMatch(/['"]\/oauth\/authorize['"]/)
  })

  it('bypass block sits between Inngest bypass and updateSession call (preserves order)', () => {
    const inngestIdx = PROXY.indexOf("'/api/inngest'")
    const bypassIdx = PROXY.indexOf('OAuth + MCP bypass')
    const sessionIdx = PROXY.indexOf('updateSession(request)')
    expect(inngestIdx).toBeGreaterThan(0)
    expect(bypassIdx).toBeGreaterThan(inngestIdx)
    expect(sessionIdx).toBeGreaterThan(bypassIdx)
  })
})
