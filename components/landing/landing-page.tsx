import { HeroSection } from '@/components/landing/hero-section'

export function LandingPage() {
  return (
    <div
      data-testid="landing-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#0a0a0f_0%,#0d0f1a_100%)] text-foreground"
    >
      <HeroSection />
    </div>
  )
}
