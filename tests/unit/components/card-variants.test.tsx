import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Card } from '@/components/ui/card'

describe('Card variants (Phase 71-02)', () => {
  it('renders default variant with bg-card (backward compat)', () => {
    const { container } = render(<Card>x</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.dataset.variant ?? 'default').toBe('default')
    expect(el.className).toMatch(/bg-card/)
  })

  it('renders glass variant with backdrop-blur + glass token', () => {
    const { container } = render(<Card variant="glass">x</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.dataset.variant).toBe('glass')
    expect(el.className).toMatch(/backdrop-blur|glass/)
    expect(el.className).toMatch(/glass-bg|glass-border/)
  })

  it('renders glass-strong variant with stronger backdrop-blur', () => {
    const { container } = render(<Card variant="glass-strong">x</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.dataset.variant).toBe('glass-strong')
    expect(el.className).toMatch(/glass-bg-strong|backdrop-blur/)
  })

  it('renders stat variant with gradient-brand top edge', () => {
    const { container } = render(<Card variant="stat">x</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.dataset.variant).toBe('stat')
    expect(el.className).toMatch(/gradient-brand/)
    expect(el.className).toMatch(/before:/)
  })
})
