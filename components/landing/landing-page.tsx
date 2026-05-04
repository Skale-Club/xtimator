import type { LandingContent } from '@/lib/platform-config'
import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { LandingFooter } from '@/components/landing/landing-footer'
import { TopNav } from '@/components/landing/top-nav'

export function LandingPage({ content }: { content: LandingContent }) {
  return (
    <div
      data-testid="landing-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/30"
    >
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]" />
      <TopNav />
      <main className="pt-16">
        <HeroSection content={{ heroHeadline: content.heroHeadline, heroSubheadline: content.heroSubheadline, ctaLabel: content.ctaLabel }} />
        <HowItWorksSection steps={content.howItWorksSteps} />
        <FeaturesSection features={content.features} />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
