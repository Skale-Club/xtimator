'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  /** Server-checked auth state. When true, Start/CTA buttons skip the auth dialog and route to the dashboard. */
  isAuthenticated: boolean
}

export function LandingPage({ content, branding, isAuthenticated }: LandingPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')

  // Auto-open modal from ?auth=login|signup, then strip the param.
  // For already-authenticated visitors the dialog is pointless — send them
  // straight to the dashboard instead.
  useEffect(() => {
    const authParam = searchParams.get('auth')
    if (authParam === 'login' || authParam === 'signup') {
      if (isAuthenticated) {
        router.replace('/dashboard')
        return
      }
      setAuthMode(authParam)
      setAuthOpen(true)
      router.replace('/', { scroll: false })
    } else if (authParam) {
      // Unknown value — strip it but don't open the dialog.
      router.replace('/', { scroll: false })
    }
    // We only want this to run once on mount based on initial search params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openAuth(mode: 'login' | 'signup') {
    if (isAuthenticated) {
      router.push('/dashboard')
      return
    }
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
        <HeroSection
          content={{
            heroHeadline: content.heroHeadline,
            heroSubheadline: content.heroSubheadline,
            ctaLabel: content.ctaLabel,
            heroImageUrl: content.heroImageUrl ?? null,
          }}
          onOpenAuth={openAuth}
        />
        <HowItWorksSection steps={content.howItWorksSteps} />
        <FeaturesSection features={content.features} />
        <FinalCtaSection onOpenAuth={openAuth} />
      </main>
      <LandingFooter appName={branding.appName} logoUrl={branding.logoUrl} onOpenAuth={openAuth} />
      <AuthDialog branding={branding} open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </div>
  )
}
