import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ProductMockup } from './product-mockup'

export function HeroSection() {
  return (
    <section
      className="relative min-h-[90vh] flex items-center pt-16"
      style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.12), transparent)',
      }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: text + CTA */}
          <div className="flex flex-col gap-6">
            {/* Eyebrow */}
            <p className="text-[length:var(--font-size-sm)] font-[var(--font-weight-normal)] tracking-[0.04em] text-primary uppercase">
              AI-Powered Estimating
            </p>

            {/* Headline */}
            <h1
              className="font-[var(--font-weight-bold)] leading-[1.15] tracking-[var(--tracking-tighter)] text-foreground"
              style={{ fontSize: 'clamp(1.875rem, 4vw + 1rem, 3.25rem)' }}
            >
              From Job Site to Professional Estimate in{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(218 85% 73%) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                5 Minutes
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-[length:var(--font-size-base)] font-[var(--font-weight-normal)] leading-[1.6] text-muted-foreground max-w-lg">
              EstimateBuilder Pro uses AI to turn your audio walkthroughs and job site photos into branded, client-ready estimates — without touching a keyboard.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button size="lg" className="min-h-[44px] text-base font-semibold" asChild>
                <Link href="/auth/signup">Get Started Free</Link>
              </Button>
              <Button variant="ghost" size="lg" className="min-h-[44px] text-base" asChild>
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
          </div>

          {/* Right: product mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-[80%] lg:max-w-none flex justify-center">
              <ProductMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
