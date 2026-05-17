import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

describe('UI primitives — Phase 9 redesign', () => {
  it('Button default variant uses --radius-md + shadow-xs + --focus-shadow', () => {
    render(<Button>Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn.className).toContain('rounded-[var(--radius-md)]')
    expect(btn.className).toContain('shadow-xs')
    expect(btn.className).toContain('shadow-[var(--focus-shadow)]')
  })

  it('Button default size is h-10', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button').className).toContain('h-10')
  })

  it('Button destructive variant is bg-destructive text-white', () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toContain('bg-destructive')
    expect(btn.className).toContain('text-white')
  })

  it('Input uses h-10 + radius-md + shadow-xs + glow-brand focus (Phase 71)', () => {
    render(<Input placeholder="p" />)
    const input = screen.getByPlaceholderText('p')
    expect(input.className).toContain('h-10')
    expect(input.className).toContain('rounded-[var(--radius-md)]')
    expect(input.className).toContain('shadow-xs')
    // Phase 71: focus shadow shifted from --focus-shadow to gradient-brand glow
    expect(input.className).toContain('shadow-glow-brand')
  })

  it('Card uses --radius-lg + shadow-sm', () => {
    render(<Card data-testid="card">c</Card>)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('rounded-[var(--radius-lg)]')
    expect(card.className).toContain('shadow-sm')
  })

  it('Badge is pill-shaped via --radius-full', () => {
    render(<Badge>new</Badge>)
    expect(screen.getByText('new').className).toContain('rounded-[var(--radius-full)]')
  })

  it('Skeleton has shimmer animation', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />)
    const el = container.querySelector('[data-slot="skeleton"]')
    expect(el).toBeTruthy()
    expect(el!.className).toContain('animate-[shimmer')
  })

  it('no primitive class string contains a hardcoded Tailwind color class', () => {
    const { container: c1 } = render(<Button>x</Button>)
    const { container: c2 } = render(<Input placeholder="y" />)
    const { container: c3 } = render(<Card>z</Card>)
    const { container: c4 } = render(<Badge>w</Badge>)
    for (const el of [c1, c2, c3, c4].flatMap(c => Array.from(c.querySelectorAll('*')))) {
      expect(el.className).not.toMatch(/bg-(gray|green|red|blue|yellow|purple)-\d{3}/)
      expect(el.className).not.toMatch(/text-(gray|green|red|blue|yellow|purple)-\d{3}/)
    }
  })
})
