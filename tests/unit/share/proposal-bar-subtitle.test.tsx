import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ProposalBar } from '@/components/share/proposal-bar'

const base = {
  companyName: 'Acme',
  logoUrl: null,
  phone: null,
  email: null,
  estimateNumber: 'EST-77',
  estimateDate: 'March 5, 2026',
  total: '$1,234.50',
  brandText: '#2563eb',
  showAccept: false,
  onAccept: () => {},
}

describe('ProposalBar subtitle', () => {
  it('keeps the estimate output unchanged without the new props', () => {
    render(<ProposalBar {...base} />)
    const bar = screen.getByTestId('proposal-bar')
    expect(bar.textContent).toContain('Estimate #EST-77 · March 5, 2026')
    expect(bar.textContent).toContain('Total')
  })

  it('replaces the subtitle and the total caption when given', () => {
    render(<ProposalBar {...base} subtitle="Change order SK-1045-CO1" totalLabel="This change order" />)
    const bar = screen.getByTestId('proposal-bar')
    expect(bar.textContent).toContain('Change order SK-1045-CO1')
    expect(bar.textContent).not.toContain('Estimate #')
    expect(bar.textContent).toContain('This change order')
    expect(bar.textContent).not.toMatch(/Total/)
  })
})
