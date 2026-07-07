'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { LandingContent } from '@/lib/platform-config'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { TrustBar } from '@/components/landing/trust-bar'
import { LandingFooter } from '@/components/landing/landing-footer'
import { TopNav } from '@/components/landing/top-nav'

const AuthDialog = dynamic(() =>
  import('@/components/landing/auth-dialog').then((module) => module.AuthDialog),
)

interface LandingPageProps {
  content: LandingContent
  branding: { appName: string; logoUrl: string | null }
  navUser?: { email: string; avatarUrl: string | null } | null
}

export function LandingPage({ content, branding, navUser }: LandingPageProps) {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  // SEAT-04: the invite-accept route sends logged-out visitors here with a
  // ?next=/invite/accept?token=... param. Capture it before router.replace strips
  // it, then thread it into the auth dialog so the token survives signup/signin.
  const [authNext, setAuthNext] = useState<string | null>(null)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const authParam = searchParams.get('auth')
    const nextParam = searchParams.get('next')
    if (authParam === 'login' || authParam === 'signup') {
      setAuthMode(authParam)
      if (nextParam) setAuthNext(nextParam)
      setAuthOpen(true)
      window.history.replaceState(window.history.state, '', '/')
    } else if (authParam) {
      window.history.replaceState(window.history.state, '', '/')
    }
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
        {/* Snap page 1: hero + trust bar. pt matches TopNav height (4rem) plus the
            PWA status-bar inset the nav now absorbs (safe-area-inset-top). */}
        <div className="hero-shell min-h-[100dvh] pt-[calc(4rem_+_env(safe-area-inset-top,_0px))] flex flex-col">
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

      {authOpen && (
        <AuthDialog
          branding={branding}
          open
          onClose={() => setAuthOpen(false)}
          initialMode={authMode}
          next={authNext}
        />
      )}
    </div>
  )
}
