'use client'

import { useState } from 'react'
import type { LandingContent } from '@/lib/platform-config'
import { AuthDialog } from '@/components/landing/auth-dialog'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { LandingFooter } from '@/components/landing/landing-footer'
import { TopNav } from '@/components/landing/top-nav'

interface LandingPageProps {
  content: LandingContent
  branding: { appName: string; logoUrl: string | null }
}

export function LandingPage({ content, branding }: LandingPageProps) {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')

  function openAuth(mode: 'login' | 'signup') {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  return (
    <div
      data-testid="landing-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/30"
    >
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]" />
      <TopNav branding={branding} onOpenAuth={openAuth} />
      <main className="pt-16">
        <HeroSection content={{ heroHeadline: content.heroHeadline, heroSubheadline: content.heroSubheadline, ctaLabel: content.ctaLabel }} onOpenAuth={openAuth} />
        <HowItWorksSection steps={content.howItWorksSteps} />
        <FeaturesSection features={content.features} />
        <FinalCtaSection onOpenAuth={openAuth} />
      </main>
      <LandingFooter appName={branding.appName} logoUrl={branding.logoUrl} onOpenAuth={openAuth} />
      <AuthDialog branding={branding} open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </div>
  )
}
