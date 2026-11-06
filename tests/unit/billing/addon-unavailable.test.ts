import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 })

/**
 * SEED-055 D9 - 1 company + 1 user. With the REAL addon-availability module
 * (nothing is available), the three entry points that grow an account refuse
 * BEFORE any read or write:
 *   - createOrUpdateCompany({ mode: 'add' })
 *   - inviteMember
 *   - acceptInvite
 * and every UI entry point is hidden.
 */

const createClient = vi.fn()
const requireServiceClient = vi.fn()
const requireCompanyManager = vi.fn()
const sendInviteEmail = vi.fn()
const switchActiveCompany = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: (...a: unknown[]) => createClient(...a) }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...a: unknown[]) => requireServiceClient(...a),
}))
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyManager: (...a: unknown[]) => requireCompanyManager(...a),
}))
vi.mock('@/lib/email/invite-emails', () => ({ sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a) }))
vi.mock('@/lib/actions/active-company', () => ({
  switchActiveCompany: (...a: unknown[]) => switchActiveCompany(...a),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(async () => null),
  assertCompanyWritable: vi.fn(async () => null),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createOrUpdateCompany({ mode: add })', () => {
  it('returns addon_unavailable before touching auth, the database or the service client', async () => {
    const { createOrUpdateCompany } = await import('@/lib/actions/company')

    const res = await createOrUpdateCompany({ companyName: 'Second Co' } as never, { mode: 'add' })

    expect(res).toEqual({
      error: 'Adding companies is not available yet',
      code: 'addon_unavailable',
    })
    expect(createClient).not.toHaveBeenCalled()
    expect(requireServiceClient).not.toHaveBeenCalled()
  })
})

describe('inviteMember', () => {
  it('returns addon_unavailable for everyone, with no gate lookup, insert or email', async () => {
    const { inviteMember } = await import('@/lib/actions/team')

    const res = await inviteMember('c1', 'New Person', 'new@person.com', 'member')

    expect(res).toEqual({
      error: 'Inviting teammates is not available yet',
      code: 'addon_unavailable',
    })
    expect(requireCompanyManager).not.toHaveBeenCalled()
    expect(requireServiceClient).not.toHaveBeenCalled()
    expect(sendInviteEmail).not.toHaveBeenCalled()
  })
})

describe('acceptInvite', () => {
  it('refuses an existing invite with a friendly message and writes no membership', async () => {
    const { acceptInvite } = await import('@/lib/actions/invite-accept')

    const res = await acceptInvite('some-token')

    expect(res).toMatchObject({ code: 'addon_unavailable' })
    expect((res as { error: string }).error).toMatch(/not available yet/i)
    expect(createClient).not.toHaveBeenCalled()
    expect(requireServiceClient).not.toHaveBeenCalled()
    expect(switchActiveCompany).not.toHaveBeenCalled()
  })

  it('the invite page shows that message in its error card (no onboarding, no company creation)', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/invite/accept/page.tsx'), 'utf8')
    expect(src).toContain('acceptInvite(token)')
    expect(src).toContain('<AcceptCard message={result.error} isError />')
    expect(src).not.toMatch(/redirect\(['"`]\/onboarding/)
  })
})

describe('UI entry points are hidden', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

  it('team settings has no invite dialog or inviteMember call, but keeps the member list', () => {
    const src = read('components/settings/team-section.tsx')
    expect(src).not.toContain('inviteMember')
    expect(src).not.toContain('invite-email')
    expect(src).not.toContain('Send Invite')
    expect(src).toContain('members.map')
    expect(src).toContain('Inviting teammates is not available yet')
  })

  it('the company switcher offers "Add new company" to platform admins only (handoff path)', () => {
    const src = read('components/app-shell/company-selector.tsx')
    expect(src).toMatch(/\{isAdmin && \(\s*<>\s*<DropdownMenuSeparator \/>\s*<DropdownMenuItem[\s\S]*?Add new company/)
    expect(src).not.toContain('/onboarding?mode=add"')
  })
})
