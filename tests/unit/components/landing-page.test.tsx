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

vi.stubGlobal(
  'IntersectionObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ''
    thresholds = []
  }
)

const HERO_CONTENT = {
  heroHeadline: 'Professional estimates in 5 minutes.',
  heroSubheadline: 'Record a site walkthrough, add photos, and let AI draft the scope.',
  ctaLabel: 'Start free',
}

const HOW_IT_WORKS_STEPS = [
  { eyebrow: 'Step 1', title: 'Record audio', description: 'Walk the property.' },
  { eyebrow: 'Step 2', title: 'Add photos', description: 'Drop in site photos.' },
  { eyebrow: 'Step 3', title: 'Get estimate', description: 'Review the draft.' },
]

const FEATURES = [
  { icon: 'BrainCircuit', title: 'AI-generated estimate draft', description: 'Turns field notes into scope.', benefit: 'Skip the blank-page struggle' },
  { icon: 'FileBadge2', title: 'Branded PDF output', description: 'Polished output.', benefit: 'Look professional' },
  { icon: 'Link2', title: 'Share link for fast approvals', description: 'Live estimate link.', benefit: 'Faster response' },
  { icon: 'Smartphone', title: 'Mobile-first from the driveway', description: 'iPhone and Android.', benefit: 'Works where you work' },
]

// LAND-01: Hero section -- headline, subheadline, CTAs
describe('HeroSection (LAND-01)', () => {
  it('renders the locked D-05 headline containing "5 minutes"', () => {
    render(<HeroSection content={HERO_CONTENT} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent?.toLowerCase()).toContain('5 minutes')
  })

  it('renders a link to /signup', () => {
    render(<HeroSection content={HERO_CONTENT} />)
    const links = screen.getAllByRole('link')
    const signupLink = links.find(l => l.getAttribute('href') === '/signup')
    expect(signupLink).toBeTruthy()
  })

  it('renders a link to /login', () => {
    render(<HeroSection content={HERO_CONTENT} />)
    const links = screen.getAllByRole('link')
    const loginLink = links.find(l => l.getAttribute('href') === '/login')
    expect(loginLink).toBeTruthy()
  })
})

// LAND-02: How It Works -- 3-step flow
describe('HowItWorksSection (LAND-02)', () => {
  it('renders the 3 step titles', () => {
    const { container } = render(<HowItWorksSection steps={HOW_IT_WORKS_STEPS} />)
    expect(container.textContent).toContain('Record audio')
    expect(container.textContent).toContain('Add photos')
    expect(container.textContent).toContain('Get estimate')
  })
})

// LAND-03: Features grid -- 4 feature cards
describe('FeaturesSection (LAND-03)', () => {
  it('renders 4 feature card titles', () => {
    const { container } = render(<FeaturesSection features={FEATURES} />)
    expect(container.textContent).toContain('AI-generated estimate draft')
    expect(container.textContent).toContain('Branded PDF output')
    expect(container.textContent).toContain('Share link for fast approvals')
    expect(container.textContent).toContain('Mobile-first from the driveway')
  })
})
