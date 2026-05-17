import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DesignSystemPage from '@/app/admin/design-system/page'

describe('/admin/design-system page (Phase 71-02)', () => {
  it('renders the page heading', () => {
    render(<DesignSystemPage />)
    expect(screen.getByRole('heading', { name: 'Design System', level: 1 })).toBeTruthy()
  })

  it('renders all 9 section headings (tokens, glass, buttons, badges, input, tabs, dialog, skeleton, patterns)', () => {
    render(<DesignSystemPage />)
    const expected = [
      /Gradient Tokens/i,
      /Glass Surfaces/i,
      /Buttons/i,
      /^4\. Badges/i,
      /Input \+ Textarea/i,
      /Tabs/i,
      /Dialog/i,
      /Skeleton/i,
      /Patterns/i,
    ]
    for (const re of expected) {
      expect(screen.getByRole('heading', { name: re, level: 2 })).toBeTruthy()
    }
  })

  it('renders every gradient swatch', () => {
    render(<DesignSystemPage />)
    for (const name of [
      '.gradient-brand',
      '.gradient-success',
      '.gradient-warning',
      '.gradient-danger',
      '.gradient-premium',
    ]) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  it('renders all 4 stat cards', () => {
    render(<DesignSystemPage />)
    expect(screen.getByText('Revenue (30d)')).toBeTruthy()
    expect(screen.getByText('Estimates sent')).toBeTruthy()
    expect(screen.getByText('Acceptance rate')).toBeTruthy()
    expect(screen.getByText('Active projects')).toBeTruthy()
  })

  it('renders all 3 tier cards (Free / Pro / Business)', () => {
    render(<DesignSystemPage />)
    expect(screen.getByText('Free')).toBeTruthy()
    expect(screen.getAllByText(/Pro/).length).toBeGreaterThan(0)
    expect(screen.getByText('Business')).toBeTruthy()
  })

  it('renders empty-state pattern', () => {
    render(<DesignSystemPage />)
    expect(screen.getByText('No estimates yet')).toBeTruthy()
  })

  it('renders 4 toast trigger buttons (success, error, warning, info)', () => {
    render(<DesignSystemPage />)
    expect(screen.getByRole('button', { name: /Success toast/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Error toast/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Warning toast/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Info toast/ })).toBeTruthy()
  })
})
