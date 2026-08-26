import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EngagementButton } from '@/components/workspace/estimate/engagement-button'

// Phase 193 Plan 03 (Task 2a) — header chip/trigger states. The "hidden when
// never sent" rule lives in the CALLER (project-header.tsx only mounts this
// when slot.sentAt is set), so it isn't re-tested here.

// EngagementPanel does its own data fetching (covered by
// engagement-panel.test.tsx) — stub it so this file only exercises the chip.
vi.mock('@/components/workspace/estimate/engagement-panel', () => ({
  EngagementPanel: () => <div data-testid="stub-panel" />,
}))

describe('EngagementButton', () => {
  it('shows the open count + relative last-viewed time when there are opens', () => {
    render(
      <EngagementButton
        estimateId="est-1"
        viewCount={5}
        lastViewedAt={new Date(Date.now() - 60_000).toISOString()}
        hasPassword={false}
      />
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText(/·/)).toBeTruthy()
    expect(screen.queryByText('Password protected', { exact: false })).toBeNull()
  })

  it('shows a muted "Not opened yet" state when sent but view_count is 0', () => {
    render(<EngagementButton estimateId="est-1" viewCount={0} lastViewedAt={null} hasPassword={false} />)
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getAllByText(/Not opened yet/).length).toBeGreaterThan(0)
  })

  it('renders a lock affordance when the share link is password-protected', () => {
    render(<EngagementButton estimateId="est-1" viewCount={2} lastViewedAt={null} hasPassword />)
    expect(screen.getByLabelText('Password protected')).toBeTruthy()
  })
})
