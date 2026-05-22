import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/dashboard/status-badge'

describe('StatusBadge', () => {
  it('renders estimate_ready in green with the "Estimate ready" label', () => {
    render(<StatusBadge status="estimate_ready" />)
    const el = screen.getByText('Estimate ready')
    expect(el.className).toContain('bg-green-500/15')
    expect(el.className).toContain('text-green-400')
    expect(el.className).toContain('border-green-500/50')
  })

  for (const status of ['draft', 'recording', 'photos_added', 'in_progress', 'sent', 'completed', 'xyz-unknown']) {
    it(`renders ${status} as "In progress" with blue outline`, () => {
      render(<StatusBadge status={status} />)
      const el = screen.getByText('In progress')
      expect(el.className).toContain('bg-transparent')
      expect(el.className).toContain('text-blue-400')
      expect(el.className).toContain('border-blue-500/60')
    })
  }
})
