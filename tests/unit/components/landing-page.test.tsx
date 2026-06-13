import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { LandingPage } from '@/components/landing/landing-page'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Module-scope mocks for next/navigation so the LandingPage modal auto-open
// tests can drive useSearchParams / useRouter behavior.
const routerReplace = vi.fn()
let currentSearchParams = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplace,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => '/',
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
  heroImageUrl: null,
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

const LANDING_CONTENT = {
  heroHeadline: HERO_CONTENT.heroHeadline,
  heroSubheadline: HERO_CONTENT.heroSubheadline,
  ctaLabel: HERO_CONTENT.ctaLabel,
  heroImageUrl: HERO_CONTENT.heroImageUrl,
  howItWorksSteps: HOW_IT_WORKS_STEPS,
  features: FEATURES,
  // Minimal fields needed by sections; cast to LandingContent shape.
} as unknown as Parameters<typeof LandingPage>[0]['content']

const BRANDING = { appName: 'Xtimator', logoUrl: null }

// LAND-01: Hero section -- headline, subheadline, CTAs
describe('HeroSection (LAND-01)', () => {
  it('renders the locked D-05 headline containing "5 minutes"', () => {
    render(<HeroSection content={HERO_CONTENT} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent?.toLowerCase()).toContain('5 minutes')
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

// New: LandingPage modal auto-open from ?auth=login|signup
describe('LandingPage modal auto-open', () => {
  beforeEach(() => {
    routerReplace.mockClear()
    currentSearchParams = new URLSearchParams('')
  })

  it('opens the AuthDialog in login mode when ?auth=login and strips the param via router.replace', async () => {
    currentSearchParams = new URLSearchParams('auth=login')
    render(<LandingPage content={LANDING_CONTENT} branding={BRANDING} />)
    // AuthDialog mounts in a portal; the login heading "Sign in to {appName}" is the marker.
    const heading = await screen.findByRole('heading', { name: /sign in to/i })
    expect(heading).toBeTruthy()
    expect(routerReplace).toHaveBeenCalledWith('/', { scroll: false })
  })

  it('does NOT open the AuthDialog and does NOT call router.replace when no auth param is present', () => {
    currentSearchParams = new URLSearchParams('')
    render(<LandingPage content={LANDING_CONTENT} branding={BRANDING} />)
    // Heading from any mode of the dialog should NOT exist.
    expect(screen.queryByRole('heading', { name: /sign in to/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /create account/i })).toBeNull()
    expect(routerReplace).not.toHaveBeenCalled()
  })
})
