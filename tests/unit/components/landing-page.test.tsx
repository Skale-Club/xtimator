import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { LandingPage } from '@/components/landing/landing-page'
import { TopNavAuth } from '@/components/landing/top-nav-auth'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))

// LandingPage renders TopNav -> TopNavAuth, which calls @/lib/supabase/client's
// createClient() on mount (auth.getUser / onAuthStateChange). Mock it so that
// call never reaches the real @supabase/ssr client (which throws without
// NEXT_PUBLIC_SUPABASE_URL configured) — same pattern as
// tests/unit/notifications/notification-bell.test.tsx.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))

// LandingPage's contract is the auth query-param state transition, not the
// 600+ line dialog implementation. Mock the dynamically imported dialog so
// this suite does not race a large module graph against findByRole's timeout
// when all 500+ unit/eval files run concurrently in CI.
vi.mock('@/components/landing/auth-dialog', () => ({
  AuthDialog: ({
    open,
    initialMode = 'login',
  }: {
    open: boolean
    initialMode?: 'login' | 'signup'
  }) =>
    open ? (
      <h2>{initialMode === 'login' ? 'Sign in to Xtimator' : 'Create account'}</h2>
    ) : null,
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

describe('TopNavAuth', () => {
  it('shows only the signup CTA for anonymous visitors', () => {
    const onOpenAuth = vi.fn()
    render(
      <TopNavAuth
        branding={BRANDING}
        onOpenAuth={onOpenAuth}
        navUser={null}
        ctaLabel="Start free"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull()
    const startButton = screen.getByRole('button', { name: 'Start free' })
    fireEvent.click(startButton)
    expect(onOpenAuth).toHaveBeenCalledWith('signup')
  })
})

// LAND-01: Hero section -- headline, subheadline, CTAs
describe('HeroSection (LAND-01)', () => {
  it('renders the locked D-05 headline containing "5 minutes"', () => {
    render(<HeroSection content={HERO_CONTENT} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent?.toLowerCase()).toContain('5 minutes')
  })

  it('forces Professional / estimates in seconds onto two lines from 820px upward', () => {
    const { container } = render(<HeroSection content={HERO_CONTENT} />)
    const primaryLine = container.querySelector('[data-hero-title-line="primary"]')
    const secondaryLine = container.querySelector('[data-hero-title-line="secondary"]')
    const responsiveBreak = container.querySelector('[data-hero-title-break]')

    expect(primaryLine?.textContent).toBe('Professional')
    expect(secondaryLine?.textContent?.trim()).toBe('estimates in 5 minutes')
    expect(secondaryLine?.classList.contains('min-[820px]:whitespace-nowrap')).toBe(true)
    expect(responsiveBreak?.classList.contains('min-[820px]:block')).toBe(true)
    expect(responsiveBreak?.classList.contains('hidden')).toBe(true)
  })

  it('keeps the desktop foreground image full-size and close to the header', () => {
    const { container } = render(
      <HeroSection content={{ ...HERO_CONTENT, heroImageUrl: 'https://example.com/hero.webp' }} />,
    )
    const heroImage = container.querySelector('.hero-image')

    expect(heroImage?.classList.contains('lg:scale-90')).toBe(false)
    expect(heroImage?.classList.contains('lg:scale-100')).toBe(true)
    expect(heroImage?.classList.contains('lg:top-[8px]')).toBe(true)
    expect(heroImage?.classList.contains('xl:top-[55px]')).toBe(true)
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

  it('uses the shared 64px section rhythm at every breakpoint', () => {
    const { container } = render(<HowItWorksSection steps={HOW_IT_WORKS_STEPS} />)
    const section = container.querySelector('#how-it-works')

    expect(section?.classList.contains('py-16')).toBe(true)
    expect(section?.classList.contains('lg:py-10')).toBe(false)
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
//
// NOTE: components/landing/landing-page.tsx (since commit 950a9226, "perf:
// preserve static landing HTML") reads `window.location.search` directly and
// strips the param via `window.history.replaceState` instead of Next's
// useSearchParams()/router.replace() — this keeps the page eligible for static
// rendering (see tests/unit/seo/home-cacheability.test.ts, which pins this
// exact contract at the source-string level). These tests drive that
// window-level API directly rather than the next/navigation mocks.
describe('LandingPage modal auto-open', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    replaceStateSpy.mockRestore()
    window.history.replaceState(window.history.state, '', '/')
  })

  it('does not force below-the-fold section wrappers to viewport height', async () => {
    const { container } = render(<LandingPage content={LANDING_CONTENT} branding={BRANDING} />)
    await screen.findByText('How it works')

    const heroShell = container.querySelector('.hero-shell')
    const howItWorks = container.querySelector('#how-it-works')
    const features = container.querySelector('#features')

    expect(heroShell?.classList.contains('min-h-[100dvh]')).toBe(false)
    expect(howItWorks?.parentElement?.classList.contains('min-[720px]:min-h-[100dvh]')).toBe(false)
    expect(features?.parentElement?.classList.contains('lg:min-h-[100dvh]')).toBe(false)
  })

  it('opens the AuthDialog in login mode when ?auth=login and strips the param via history.replaceState', async () => {
    window.history.replaceState(window.history.state, '', '/?auth=login')
    replaceStateSpy.mockClear()
    render(<LandingPage content={LANDING_CONTENT} branding={BRANDING} />)
    // next/dynamic still preserves the async boundary; the mocked dialog keeps
    // that boundary deterministic without importing the production dialog's
    // large dependency graph in this state-transition unit test.
    const heading = await screen.findByRole('heading', { name: /sign in to/i }, { timeout: 3000 })
    expect(heading).toBeTruthy()
    // window.history.state is null in this jsdom test environment (no prior
    // history entries carry state) — expect.anything() deliberately excludes
    // null/undefined, so match the actual state value directly.
    expect(replaceStateSpy).toHaveBeenCalledWith(window.history.state, '', '/')
  })

  it('does NOT open the AuthDialog and does NOT call history.replaceState when no auth param is present', async () => {
    window.history.replaceState(window.history.state, '', '/')
    replaceStateSpy.mockClear()
    render(<LandingPage content={LANDING_CONTENT} branding={BRANDING} />)
    // Heading from any mode of the dialog should NOT exist.
    expect(screen.queryByRole('heading', { name: /sign in to/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /create account/i })).toBeNull()
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })
})
