/**
 * CHATMETER-02 owner-only / NEVER-customer-facing structural fence (static-source).
 *
 * The in-app chat is OWNER-only (authenticated, tenant-scoped) — per PROJECT.md
 * and SEED-034 it must NEVER be customer-facing. This is the structural half of
 * that guarantee (the route 403 from Plan 126-01 is the runtime boundary):
 *
 *   1. The chat lives ONLY under app/(app)/chat — the page references ChatWorkspace.
 *   2. NO public / non-(app) route group (auth, capture, admin, blog, demo,
 *      estimate, oauth, offline, onboarding, privacy-policy, terms-of-service)
 *      references ChatWorkspace, @/components/chat, or /api/chat — so no
 *      customer-facing, marketing, admin, or auth surface can mount the chat.
 *   3. app/api/chat/route.ts is owner-auth (getClaims) AND tier-gated
 *      (chat_not_on_plan) — proving the route itself is owner-only + entitled.
 *
 * Pure file read — runs in CI with no DB and no secrets (mirrors the Phase-125
 * chat-ui-scope.test.ts static-source model).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const CHAT_PAGE_PATH = 'app/(app)/chat/[[...id]]/page.tsx'
const ROUTE_PATH = 'app/api/chat/route.ts'

/** The public / non-(app) route groups that must NEVER mount the chat. */
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

/** Collect every .ts/.tsx file under a dir (recursive). */
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

describe('CHATMETER-02 scope fence: chat is owner-only / never customer-facing', () => {
  it('the chat page exists under app/(app)/chat and references ChatWorkspace', () => {
    const src = read(CHAT_PAGE_PATH)
    expect(src).toContain('ChatWorkspace')
  })

  it('NO public / non-(app) route group references the chat', () => {
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

  it('the /api/chat route is owner-auth (getClaims) AND tier-gated (chat_not_on_plan)', () => {
    const src = read(ROUTE_PATH)
    expect(src).toContain('getClaims')
    expect(src).toContain('chat_not_on_plan')
  })
})
