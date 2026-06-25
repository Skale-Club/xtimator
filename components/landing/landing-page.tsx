'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LandingContent } from '@/lib/platform-config'
import { AuthDialog } from '@/components/landing/auth-dialog'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { TrustBar } from '@/components/landing/trust-bar'
import { LandingFooter } from '@/components/landing/landing-footer'
import { TopNav } from '@/components/landing/top-nav'

interface LandingPageProps {
  content: LandingContent
  branding: { appName: string; logoUrl: string | null }
  navUser?: { email: string; avatarUrl: string | null } | null
}

export function LandingPage({ content, branding, navUser }: LandingPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  // SEAT-04: the invite-accept route sends logged-out visitors here with a
  // ?next=/invite/accept?token=... param. Capture it before router.replace strips
  // it, then thread it into the auth dialog so the token survives signup/signin.
  const [authNext, setAuthNext] = useState<string | null>(null)

  useEffect(() => {
    const authParam = searchParams.get('auth')
    const nextParam = searchParams.get('next')
    if (authParam === 'login' || authParam === 'signup') {
      setAuthMode(authParam)
      if (nextParam) setAuthNext(nextParam)
      setAuthOpen(true)
      router.replace('/', { scroll: false })
    } else if (authParam) {
      router.replace('/', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openAuth(mode: 'login' | 'signup') {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  return (
    // Outer wrapper owns dark context + stacking context. No overflow here so
    // that position:fixed children (TopNav, AuthDialog) are never clipped —
    // iOS Safari clips fixed elements inside overflow:scroll/hidden containers.
    <div className="dark isolate bg-background text-foreground selection:bg-primary/30">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]" />

      <TopNav branding={branding} onOpenAuth={openAuth} navUser={navUser} />

      {/* Scrollable shell — overflow lives here, not on the outer wrapper */}
      <div
        data-testid="landing-shell"
        className="h-[100dvh] overflow-y-scroll overflow-x-hidden scroll-smooth overscroll-none [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Snap page 1: hero + trust bar */}
        <div className="hero-shell min-h-[100dvh] pt-16 flex flex-col">
          <HeroSection
            content={{
              heroHeadline: content.heroHeadline,
              heroSubheadline: content.heroSubheadline,
              ctaLabel: content.ctaLabel,
              heroImageUrl: content.heroImageUrl ?? null,
            }}
            onOpenAuth={openAuth}
          />
          <TrustBar />
        </div>

        {/* Snap page 2: how it works — 100dvh only once the desktop grid shows (≥720px); on phone the wrapper is natural height so py-8 = mb-8 = equal spacing */}
        <div className="min-[720px]:min-h-[100dvh] flex flex-col">
          <HowItWorksSection steps={content.howItWorksSteps} />
        </div>

        {/* Snap page 3: features — 100dvh only at desktop (≥1024px); below that wrapper is natural height */}
        <div className="lg:min-h-[100dvh] flex flex-col">
          <FeaturesSection features={content.features} />
        </div>

        {/* Snap page 4: final CTA + footer */}
        <div className="relative min-h-[100dvh] flex flex-col pb-3 sm:pb-0">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
          <FinalCtaSection onOpenAuth={openAuth} />
          <LandingFooter appName={branding.appName} logoUrl={branding.logoUrl} onOpenAuth={openAuth} />
        </div>
      </div>

      <AuthDialog branding={branding} open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} next={authNext} />
    </div>
  )
}
