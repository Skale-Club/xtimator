/**
 * In-app Chat scope fence (bubble activation).
 *
 * The chat is ACTIVE, but only through the ChatBubble mounted in the authed
 * app-shell layout — there is deliberately NO dedicated /chat surface:
 * the owner route still redirects to Dashboard, tenant navigation has no Chat
 * entry, and no public route may mount chat UI. The API retains its owner
 * authentication and entitlement gates as the security boundary.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const CHAT_PAGE_PATH = 'app/(app)/chat/[[...id]]/page.tsx'
const ROUTE_PATH = 'app/api/chat/route.ts'
const NAV_ITEMS_PATH = 'components/app-shell/nav-items.ts'

const PUBLIC_ROUTE_GROUPS = [
  'app/(auth)',
  'app/(capture)',
  'app/admin',
  'app/blog',
  'app/demo',
  'app/estimate',
  'app/oauth',
  'app/offline',
  'app/onboarding',
  'app/privacy-policy',
  'app/terms-of-service',
]

function collectSourceFiles(dirRel: string): string[] {
  const out: string[] = []
  const abs = resolve(process.cwd(), dirRel)
  if (!existsSync(abs)) return out
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(join(dirRel, entry)))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(join(dirRel, entry))
    }
  }
  return out
}

const FORBIDDEN_CHAT_TOKENS = ['ChatWorkspace', '@/components/chat', '/api/chat']

describe('chat scope fence (bubble-only surface)', () => {
  it('redirects the owner chat page without loading chat UI', () => {
    const src = read(CHAT_PAGE_PATH)
    expect(src).toContain("redirect('/dashboard')")
    expect(src).not.toContain('ChatWorkspace')
    expect(src).not.toContain('listConversations')
  })

  it('mounts the chat bubble in the authed app-shell layout, demo-hidden', () => {
    const src = read('app/(app)/layout.tsx')
    expect(src).toContain('ChatBubble')
    expect(src).toContain('!isDemo && <ChatBubble')
    expect(src).toContain('chatEnabled={getEntitlements(tier).chatEnabled}')
  })

  it('does not expose /chat in tenant navigation', () => {
    const src = read(NAV_ITEMS_PATH)
    expect(src).not.toContain("href: '/chat'")
  })

  it('does not mount chat from a public route group', () => {
    const offenders: string[] = []
    for (const group of PUBLIC_ROUTE_GROUPS) {
      for (const file of collectSourceFiles(group)) {
        const src = read(file)
        for (const token of FORBIDDEN_CHAT_TOKENS) {
          if (src.includes(token)) {
            offenders.push(`${file} references "${token}"`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the dormant API owner-authenticated and entitlement-gated', () => {
    const src = read(ROUTE_PATH)
    expect(src).toContain('getClaims')
    expect(src).toContain('chat_not_on_plan')
  })
})
