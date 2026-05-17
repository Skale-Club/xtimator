import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'

describe('Badge gradient variants (Phase 71-02)', () => {
  it('default variant still uses bg-primary (backward compat)', () => {
    render(<Badge>Default</Badge>)
    const el = screen.getByText('Default')
    expect(el.dataset.variant).toBe('default')
    expect(el.className).toMatch(/bg-primary/)
  })

  it('success variant uses gradient-success', () => {
    render(<Badge variant="success">Paid</Badge>)
    const el = screen.getByText('Paid')
    expect(el.dataset.variant).toBe('success')
    expect(el.className).toMatch(/gradient-success/)
    expect(el.className).toMatch(/text-white/)
  })

  it('brand variant uses gradient-brand', () => {
    render(<Badge variant="brand">Pro</Badge>)
    const el = screen.getByText('Pro')
    expect(el.dataset.variant).toBe('brand')
    expect(el.className).toMatch(/gradient-brand/)
    expect(el.className).toMatch(/text-white/)
  })

  it('warning variant uses gradient-warning', () => {
    render(<Badge variant="warning">Expiring</Badge>)
    const el = screen.getByText('Expiring')
    expect(el.dataset.variant).toBe('warning')
    expect(el.className).toMatch(/gradient-warning/)
  })

  it('danger variant uses gradient-danger', () => {
    render(<Badge variant="danger">Failed</Badge>)
    const el = screen.getByText('Failed')
    expect(el.dataset.variant).toBe('danger')
    expect(el.className).toMatch(/gradient-danger/)
    expect(el.className).toMatch(/text-white/)
  })
})
