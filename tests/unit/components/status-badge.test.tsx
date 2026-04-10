import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/dashboard/status-badge'

describe('StatusBadge', () => {
  it('renders draft status with gray classes', () => {
    const { container } = render(<StatusBadge status="draft" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.textContent).toBe('draft')
    expect(badge.className).toContain('bg-gray-100')
    expect(badge.className).toContain('text-gray-700')
  })

  it('renders accepted status with green classes', () => {
    const { container } = render(<StatusBadge status="accepted" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.textContent).toBe('accepted')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-700')
  })

  it('renders declined status with red classes', () => {
    const { container } = render(<StatusBadge status="declined" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.textContent).toBe('declined')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-700')
  })

  it('renders unknown status without crashing (falls back to draft style)', () => {
    const { container } = render(<StatusBadge status="unknown-status" />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.textContent).toBe('unknown-status')
    expect(badge.className).toContain('bg-gray-100')
  })

  it('renders all 7 known statuses with non-empty output', () => {
    const statuses = ['draft', 'processing', 'ready', 'sent', 'accepted', 'declined', 'archived']
    for (const status of statuses) {
      const { container, unmount } = render(<StatusBadge status={status} />)
      const badge = container.firstElementChild as HTMLElement
      expect(badge.textContent).toBe(status)
      expect(badge.textContent!.length).toBeGreaterThan(0)
      unmount()
    }
  })
})
