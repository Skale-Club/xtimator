import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * SEAT-08 — the team server page computes the seat-cost summary (server-side)
 * and passes it to TeamSection for owner/admin ONLY.
 *
 * Boundaries mocked: auth claims, active company, the role gate, the roster
 * query, and buildSeatCostSummary (a vi.fn — its own math is covered by
 * seat-cost-summary.test.ts). TeamSection is replaced with a sentinel that
 * records the `seatCost` prop it receives, so we can assert the manager gate.
 *
 * Covers: owner/admin → buildSeatCostSummary called with ('co-1', members.length)
 * + sentinel gets a non-null prop; plain member → NOT called + null prop.
 */

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyRole: vi.fn() }))
vi.mock('@/lib/queries/team', () => ({ listCompanyRoster: vi.fn() }))
vi.mock('@/lib/billing/seat-cost-summary', () => ({ buildSeatCostSummary: vi.fn() }))

// Sentinel TeamSection — records the props (the seatCost) it was rendered with.
let lastProps: Record<string, unknown> | null = null
vi.mock('@/components/settings/team-section', () => ({
  TeamSection: (props: Record<string, unknown>) => {
    lastProps = props
    return null
  },
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyRole } = await import('@/lib/auth/require-company-role')
const { listCompanyRoster } = await import('@/lib/queries/team')
const { buildSeatCostSummary } = await import('@/lib/billing/seat-cost-summary')
const TeamTabPageMod = await import('@/app/(app)/settings/(tabs)/team/page')
const TeamTabPage = TeamTabPageMod.default

const members = [
  { user_id: 'u1', display_name: 'Owner', email: 'o@co.com', role: 'owner' },
  { user_id: 'u2', display_name: 'Two', email: 't@co.com', role: 'member' },
  { user_id: 'u3', display_name: 'Three', email: 'th@co.com', role: 'member' },
]

beforeEach(() => {
  vi.clearAllMocks()
  lastProps = null
  vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('co-1')
  vi.mocked(listCompanyRoster).mockResolvedValue({ members, invites: [] } as never)
})

describe('SEAT-08: team page seat-cost wiring', () => {
  it('owner → buildSeatCostSummary called with (co-1, members.length), non-null prop', async () => {
    vi.mocked(requireCompanyRole).mockResolvedValue({ role: 'owner' } as never)
    vi.mocked(buildSeatCostSummary).mockResolvedValue({
      activeSeats: 3,
      includedSeats: 1,
      billableSeats: 2,
      perSeatCents: 1500,
      monthlyCents: 3000,
      enforcementEnabled: false,
    } as never)

    render(await TeamTabPage())

    expect(buildSeatCostSummary).toHaveBeenCalledWith('co-1', members.length)
    expect(lastProps).not.toBeNull()
    expect(lastProps?.seatCost).not.toBeNull()
    expect((lastProps?.seatCost as { monthlyCents: number }).monthlyCents).toBe(3000)
  })

  it('admin → buildSeatCostSummary called, non-null prop', async () => {
    vi.mocked(requireCompanyRole).mockResolvedValue({ role: 'admin' } as never)
    vi.mocked(buildSeatCostSummary).mockResolvedValue({
      activeSeats: 3,
      includedSeats: 1,
      billableSeats: 2,
      perSeatCents: 1500,
      monthlyCents: 3000,
      enforcementEnabled: true,
    } as never)

    render(await TeamTabPage())

    expect(buildSeatCostSummary).toHaveBeenCalledWith('co-1', members.length)
    expect(lastProps?.seatCost).not.toBeNull()
  })

  it('plain member → buildSeatCostSummary NOT called, seatCost prop is null', async () => {
    vi.mocked(requireCompanyRole).mockResolvedValue({ role: 'member' } as never)

    render(await TeamTabPage())

    expect(buildSeatCostSummary).not.toHaveBeenCalled()
    expect(lastProps).not.toBeNull()
    expect(lastProps?.seatCost).toBeNull()
  })
})
