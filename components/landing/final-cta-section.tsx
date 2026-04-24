import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FinalCtaSection() {
  return (
    <section className="bg-transparent">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="relative overflow-hidden rounded-2xl border border-[rgba(127,164,244,0.18)] bg-[#13131A] px-6 py-10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:px-8 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-8">
          {/* Background glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                'radial-gradient(ellipse 60% 60% at 50% 110%, rgba(64,110,241,0.18), transparent)',
            }}
            aria-hidden="true"
          />

          <div className="relative max-w-2xl space-y-3">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Ready to try it live?</p>
            <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Start your next estimate before you leave the property.
            </h2>
            <p className="text-lg leading-7 text-muted-foreground">
              Use the visit you already have to produce a cleaner, faster quote for the customer.
            </p>
          </div>

          <div className="relative mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0">
            <Button
              asChild
              size="lg"
              className="min-h-12 shadow-[0_12px_30px_rgba(64,110,241,0.3)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#13131A] sm:min-w-44"
            >
              <Link href="/auth/signup">
                Create account
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 border-white/15 bg-black/20 text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#13131A] sm:min-w-40"
            >
              <Link href="/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
