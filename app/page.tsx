import { getBranding } from '@/lib/platform-config'
import { LandingNav } from '@/components/landing/landing-nav'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { FooterMinimal } from '@/components/landing/footer-minimal'

export default async function RootPage() {
  const branding = await getBranding()
  const appName = branding.appName ?? 'EstimateBuilder Pro'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <LandingNav appName={appName} />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <FooterMinimal appName={appName} />
    </main>
  )
}
