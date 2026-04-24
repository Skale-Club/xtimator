import { FinalCtaSection } from '@/components/landing/final-cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { LandingFooter } from '@/components/landing/landing-footer'

export function LandingPage() {
  return (
    <div
      data-testid="landing-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#0a0a0f_0%,#0d0f1a_100%)] text-foreground"
    >
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <FinalCtaSection />
      <LandingFooter />
    </div>
  )
}
