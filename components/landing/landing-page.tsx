import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { LandingFooter } from '@/components/landing/landing-footer'
import { TopNav } from '@/components/landing/top-nav'

export function LandingPage() {
  return (
    <div
      data-testid="landing-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-[#0a0a0f] text-foreground selection:bg-[#406EF1]/30"
    >
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(64,110,241,0.15),rgba(255,255,255,0))]" />
      <TopNav />
      <main className="pt-16">
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
