import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FeaturesSection } from '@/components/landing/features-section'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// LAND-01: Hero section — headline, subheadline, CTAs
describe('HeroSection (LAND-01)', () => {
  it('renders the locked D-05 headline containing "5 minutes"', () => {
    render(<HeroSection />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent?.toLowerCase()).toContain('5 minutes')
  })

  it('renders a link to /auth/signup', () => {
    render(<HeroSection />)
    const links = screen.getAllByRole('link')
    const signupLink = links.find(l => l.getAttribute('href') === '/auth/signup')
    expect(signupLink).toBeTruthy()
  })

  it('renders a link to /auth/login', () => {
    render(<HeroSection />)
    const links = screen.getAllByRole('link')
    const loginLink = links.find(l => l.getAttribute('href') === '/auth/login')
    expect(loginLink).toBeTruthy()
  })
})

// LAND-02: How It Works — 3-step flow
describe('HowItWorksSection (LAND-02)', () => {
  it('renders the 3 step titles', () => {
    const { container } = render(<HowItWorksSection />)
    expect(container.textContent).toContain('Record audio')
    expect(container.textContent).toContain('Add photos')
    expect(container.textContent).toContain('Get estimate')
  })
})

// LAND-03: Features grid — 4 feature cards
describe('FeaturesSection (LAND-03)', () => {
  it('renders 4 feature card titles', () => {
    const { container } = render(<FeaturesSection />)
    expect(container.textContent).toContain('AI-generated estimate draft')
    expect(container.textContent).toContain('Branded PDF output')
    expect(container.textContent).toContain('Share link for fast approvals')
    expect(container.textContent).toContain('Mobile-first from the driveway')
  })
})
