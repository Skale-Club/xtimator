import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/dashboard/status-badge'

describe('StatusBadge', () => {
  const EXPECTED: Record<string, string[]> = {
    draft:      ['bg-muted', 'text-muted-foreground'],
    processing: ['bg-[hsl(var(--warning-muted))]', 'text-[hsl(var(--warning))]'],
    ready:      ['bg-[hsl(var(--info-muted))]', 'text-[hsl(var(--info))]'],
    sent:       ['bg-accent', 'text-accent-foreground'],
    accepted:   ['bg-[hsl(var(--success-muted))]', 'text-[hsl(var(--success))]'],
    declined:   ['bg-[hsl(var(--danger-muted))]', 'text-[hsl(var(--danger))]'],
    archived:   ['bg-muted', 'text-muted-foreground'],
  }

  for (const [status, classes] of Object.entries(EXPECTED)) {
    it(`renders ${status} with semantic tokens`, () => {
      render(<StatusBadge status={status} />)
      const el = screen.getByText(status)
      for (const cls of classes) {
        expect(el.className).toContain(cls)
      }
    })
  }

  it('falls back to draft styling for unknown status', () => {
    render(<StatusBadge status="xyz-unknown" />)
    const el = screen.getByText('xyz-unknown')
    expect(el.className).toContain('bg-muted')
  })

  it('has no hardcoded color classes', () => {
    render(<StatusBadge status="accepted" />)
    const el = screen.getByText('accepted')
    expect(el.className).not.toMatch(/bg-(gray|green|red|blue|yellow|purple)-\d{3}/)
    expect(el.className).not.toMatch(/text-(gray|green|red|blue|yellow|purple)-\d{3}/)
  })
})
