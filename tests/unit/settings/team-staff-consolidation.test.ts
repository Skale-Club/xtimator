import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Team and Staff consolidation', () => {
  it('keeps Team as the single visible member-management destination', () => {
    const nav = read('components/settings/settings-nav.tsx')
    expect(nav).toContain("href: '/settings/team'")
    expect(nav).not.toContain("href: '/settings/staff'")
  })

  it('redirects legacy Staff bookmarks to Team', () => {
    const page = read('app/(app)/settings/(tabs)/staff/page.tsx')
    expect(page).toContain("redirect('/settings/team')")
    expect(page).not.toContain('StaffSection')
  })

  it('has no production Team module that writes role staff', () => {
    expect(read('lib/actions/team.ts')).not.toMatch(/role:\s*['"]staff['"]/)
    expect(read('lib/actions/invite-accept.ts')).not.toMatch(
      /role:\s*['"]staff['"]/,
    )
  })

  it('adds invite display names for Prepared by attribution', () => {
    const migration = read(
      'supabase/migrations/20260628000002_team_invite_display_name.sql',
    )
    const accept = read('lib/actions/invite-accept.ts')
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS display_name text/i)
    expect(accept).toContain('display_name: displayName')
  })

  it('scopes live PDF attribution to the creating user and company', () => {
    const resolver = read('lib/pdf/render-estimate-pdf.ts')
    const identity = read('lib/estimate/signing-identity.ts')
    expect(resolver).toMatch(/await loadSigningPreparedBy\(\s*requireServiceClient\(\),\s*estimate\.company_id,\s*estimate\.created_by_user_id,/)
    expect(identity).toContain(".from('company_members')")
    expect(identity).toContain(".select('display_name')")
    expect(identity).toContain(".eq('user_id', creatorId)")
    expect(identity).toContain(".eq('company_id', companyId)")
  })
})
