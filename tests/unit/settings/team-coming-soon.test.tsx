import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s }) }))
vi.mock('@/lib/actions/team', () => ({
  removeMember: vi.fn(),
  changeMemberRole: vi.fn(),
  revokeInvite: vi.fn(),
}))

const { TeamSection } = await import('@/components/settings/team-section')

describe('TeamSection (coming soon)', () => {
  const members = [
    { user_id: 'u1', display_name: 'Owner One', email: 'o@co.com', role: 'owner' },
  ] as never

  it('shows one coming-soon card, keeps the member list, and no seat billing copy', () => {
    const { container, getByTestId } = render(
      <TeamSection companyId="c1" currentUserId="u1" members={members} invites={[]} canManage />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Team members — coming soon')
    expect(getByTestId('team-coming-soon').textContent).toContain('on the way')
    expect(text).toContain('Owner One')
    expect(text).not.toMatch(/seat|per seat|estimate/i)
    expect(container.querySelector('form, input')).toBeNull()
  })
})
