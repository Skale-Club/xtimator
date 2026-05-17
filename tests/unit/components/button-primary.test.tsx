import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button gradient variants (Phase 71-02)', () => {
  it('default variant still uses bg-primary (backward compat)', () => {
    render(<Button>Default</Button>)
    const btn = screen.getByRole('button', { name: 'Default' })
    expect(btn.dataset.variant).toBe('default')
    expect(btn.className).toMatch(/bg-primary/)
  })

  it('primary variant uses gradient-brand + btn-shimmer overlay', () => {
    render(<Button variant="primary">Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn.dataset.variant).toBe('primary')
    expect(btn.className).toMatch(/gradient-brand/)
    expect(btn.className).toMatch(/btn-shimmer/)
  })

  it('primary variant exposes shadow-glow-brand on hover', () => {
    render(<Button variant="primary">Glow</Button>)
    const btn = screen.getByRole('button', { name: 'Glow' })
    expect(btn.className).toMatch(/shadow-glow-brand/)
  })

  it('premium variant uses gradient-premium', () => {
    render(<Button variant="premium">Upgrade</Button>)
    const btn = screen.getByRole('button', { name: 'Upgrade' })
    expect(btn.dataset.variant).toBe('premium')
    expect(btn.className).toMatch(/gradient-premium/)
  })
})
