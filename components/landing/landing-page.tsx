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
}

export function LandingPage({ content, branding }: LandingPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')

  useEffect(() => {
    const authParam = searchParams.get('auth')
    if (authParam === 'login' || authParam === 'signup') {
      setAuthMode(authParam)
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
    <div
      data-testid="landing-shell"
      className="dark isolate h-[100dvh] overflow-y-scroll overflow-x-hidden scroll-smooth overscroll-none bg-background text-foreground selection:bg-primary/30 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]" />
      <TopNav branding={branding} onOpenAuth={openAuth} />

      {/* Snap page 1: hero + trust bar */}
      <div className="min-h-[100dvh] pt-16 flex flex-col">
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

      {/* Snap page 2: how it works */}
      <div className="min-h-[100dvh] flex flex-col">
        <HowItWorksSection steps={content.howItWorksSteps} />
      </div>

      {/* Snap page 3: features */}
      <div className="min-h-[100dvh] pt-16 flex flex-col justify-center">
        <FeaturesSection features={content.features} />
      </div>

      {/* Snap page 4: final CTA + footer */}
      <div className="relative min-h-[100dvh] pt-16 pb-3 flex flex-col sm:pb-0">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
        <div className="flex-1 flex flex-col justify-center">
          <FinalCtaSection onOpenAuth={openAuth} />
        </div>
        <LandingFooter appName={branding.appName} logoUrl={branding.logoUrl} onOpenAuth={openAuth} />
      </div>

      <AuthDialog branding={branding} open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </div>
  )
}
