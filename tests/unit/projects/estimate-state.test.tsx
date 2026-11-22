import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectStatusBadge } from '@/components/projects/project-status-badge'
import { matchesStatusTab, projectEstimateState } from '@/lib/projects/estimate-state'
import { STATUS_TABS } from '@/components/dashboard/project-list'

vi.mock('@/components/dashboard/project-actions', () => ({ ProjectActions: () => null }))
vi.mock('@/components/projects/project-table', () => ({ ProjectTable: () => null }))

describe('ProjectStatusBadge with an estimate', () => {
  it('shows the estimate states for a sent project', () => {
    const { rerender } = render(<ProjectStatusBadge status="sent" estimate={{ state: 'unopened' }} />)
    expect(screen.getByText('Not opened yet')).toBeTruthy()
    rerender(<ProjectStatusBadge status="sent" estimate={{ state: 'viewed', views: 3 }} />)
    expect(screen.getByText('Viewed 3×')).toBeTruthy()
    rerender(<ProjectStatusBadge status="completed" estimate={{ state: 'accepted' }} />)
    expect(screen.getByText('Accepted')).toBeTruthy()
    rerender(<ProjectStatusBadge status="declined" estimate={{ state: 'declined' }} />)
    expect(screen.getByText('Declined')).toBeTruthy()
  })

  it('keeps the credits pause over the estimate state', () => {
    render(<ProjectStatusBadge status="awaiting_credits" estimate={{ state: 'unopened' }} />)
    expect(screen.getByText('Paused: out of credits')).toBeTruthy()
  })

  it('falls back to the project status when there is no estimate', () => {
    render(<ProjectStatusBadge status="recording" />)
    expect(screen.getByText('In progress')).toBeTruthy()
  })
})

describe('status tabs', () => {
  it('uses the estimate vocabulary', () => {
    expect(STATUS_TABS.map((t) => t.label)).toEqual(['All', 'Not opened yet', 'Viewed', 'Accepted', 'Declined'])
  })

  it('filters by the derived estimate state, not project.status', () => {
    const viewed = { status: 'sent', estimate_status: { state: 'viewed' as const } }
    const unopened = { status: 'sent', estimate_status: { state: 'unopened' as const } }
    const none = { status: 'recording' }
    expect(matchesStatusTab('viewed', viewed)).toBe(true)
    expect(matchesStatusTab('viewed', unopened)).toBe(false)
    expect(matchesStatusTab('unopened', none)).toBe(false)
    expect(projectEstimateState({ status: 'awaiting_credits', estimate_status: { state: 'viewed' } })).toBeNull()
  })
})
