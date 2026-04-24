import Link from 'next/link'
import { ArrowRight, LogIn, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-transparent">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsla(var(--primary),0.22),transparent_70%),linear-gradient(180deg,rgba(9,12,24,0.96),rgba(8,10,18,0.98))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(127,164,244,0.55),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-14 sm:px-8 sm:py-20 lg:px-10 lg:py-28">
        {/* Badge */}
        <div className="mb-6 flex justify-center sm:justify-start">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-sm text-muted-foreground backdrop-blur">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Built for contractors, cleaners, and field crews
          </div>
        </div>

        {/* Content grid: text left, decorative panel right on desktop */}
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          {/* Left: headline + CTAs */}
          <div className="max-w-2xl space-y-6">
            <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
              Professional estimates
              <br />
              <span className="text-[#7FA4F4]">in 5 minutes.</span>
            </h1>
            <p className="max-w-xl text-lg leading-7 text-muted-foreground sm:text-xl">
              Record a site walkthrough, add photos, and let AI draft the scope, pricing, and branded PDF before you leave the driveway.
            </p>

            {/* CTA pair */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="min-h-12 shadow-[0_12px_30px_rgba(64,110,241,0.3)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] sm:min-w-44"
              >
                <Link href="/auth/signup">
                  Start free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-12 border-white/15 bg-white/5 text-foreground hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] sm:min-w-44"
              >
                <Link href="/auth/login">
                  Log in
                  <LogIn className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            {/* Social proof micro-copy */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground/75">
              <span>No credit card required</span>
              <span aria-hidden="true" className="text-white/20">/</span>
              <span>Works on iPhone and Android</span>
              <span aria-hidden="true" className="text-white/20">/</span>
              <span>First estimate in minutes</span>
            </div>
          </div>

          {/* Right: workflow preview panel (hidden on small mobile to keep CTAs above fold) */}
          <div className="hidden w-full max-w-md rounded-2xl border border-white/10 bg-[#13131A] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45),0_0_0_1px_rgba(127,164,244,0.08)] sm:block lg:shrink-0">
            <div className="mb-4 flex items-center gap-2 border-b border-white/8 pb-4">
              <div className="size-2 rounded-full bg-[#406EF1]" aria-hidden="true" />
              <p className="text-sm font-semibold text-[#7FA4F4]">On-site workflow</p>
            </div>
            <div className="space-y-3">
              {[
                { step: '1', label: 'Record', detail: 'Capture dimensions, materials, and scope in your own words.' },
                { step: '2', label: 'Add photos', detail: 'Show access points, surfaces, and job-site conditions.' },
                { step: '3', label: 'Send', detail: 'Deliver a polished estimate as PDF or share link.' },
              ].map(({ step, label, detail }) => (
                <div key={step} className="flex gap-4 rounded-xl border border-white/8 bg-black/30 p-4">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#406EF1]/15 text-xs font-bold text-[#7FA4F4]">
                    {step}
                  </div>
                  <div>
                    <p className="mb-0.5 text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
