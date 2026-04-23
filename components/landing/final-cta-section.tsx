import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinalCtaSection() {
  return (
    <section className="bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="rounded-[var(--radius-xl)] border border-white/10 bg-[linear-gradient(135deg,rgba(64,110,241,0.16),rgba(127,164,244,0.08)_35%,rgba(255,255,255,0.04)_100%)] px-6 py-8 shadow-[var(--shadow-lg)] backdrop-blur sm:px-8 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Ready to try it live?</p>
            <h2 className="text-3xl font-semibold tracking-[var(--tracking-tight)] sm:text-4xl">
              Start your next estimate before you leave the property.
            </h2>
            <p className="text-lg text-muted-foreground">
              Use the visit you already have to produce a cleaner, faster quote for the customer.
            </p>
          </div>
          <div className="mt-6 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0">
            <Button asChild size="lg" className="min-h-12 sm:min-w-44 shadow-[0_12px_30px_rgba(64,110,241,0.28)]">
              <Link href="/auth/signup">
                Create account
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 border-white/15 bg-black/20 text-foreground hover:bg-white/10 sm:min-w-40"
            >
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
