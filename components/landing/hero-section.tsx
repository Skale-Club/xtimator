import Link from 'next/link'
import { ArrowRight, LogIn, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-transparent">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsla(var(--primary),0.28),transparent_38%),radial-gradient(circle_at_80%_20%,rgba(127,164,244,0.14),transparent_24%),linear-gradient(180deg,rgba(9,12,24,0.96),rgba(8,10,18,0.98))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(127,164,244,0.55),transparent)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-10 lg:py-24">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-sm text-muted-foreground shadow-[var(--shadow-sm)] backdrop-blur">
            <Sparkles className="size-4 text-primary" />
            Built for contractors, cleaners, and field crews who quote on site
          </div>
          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-bold tracking-[var(--tracking-tighter)] text-balance sm:text-5xl lg:text-6xl">
              Turn a job-site walkthrough into a client-ready estimate in minutes.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Record what you see, add a few photos, and let Xtimator draft the scope,
              pricing language, branded PDF, and share link before you leave the driveway.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-12 sm:min-w-44 shadow-[0_12px_30px_rgba(64,110,241,0.28)]">
              <Link href="/auth/signup">
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 border-white/15 bg-white/6 text-foreground hover:bg-white/10 sm:min-w-44"
            >
              <Link href="/auth/login">
                Log in
                <LogIn className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Voice notes from the truck</span>
            <span className="text-white/20">/</span>
            <span>Photos from the site</span>
            <span className="text-white/20">/</span>
            <span>Professional estimate output</span>
          </div>
        </div>

        <div className="w-full max-w-xl rounded-[var(--radius-xl)] border border-white/12 bg-white/6 p-5 shadow-[var(--shadow-lg)] backdrop-blur sm:p-6">
          <div className="space-y-5">
            <div className="space-y-2 border-b border-white/10 pb-5">
              <p className="text-sm font-medium text-primary">On-site workflow</p>
              <h2 className="text-2xl font-semibold tracking-[var(--tracking-tight)]">
                Quote while the job is still fresh.
              </h2>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-white/10 bg-black/25 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">1. Record</p>
                <p>Capture dimensions, materials, and scope changes in your own words.</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-white/10 bg-black/25 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">2. Add photos</p>
                <p>Show access points, surfaces, fixtures, and any job-site constraints.</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-white/10 bg-black/25 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">3. Send</p>
                <p>Leave with a polished estimate ready as a PDF or share link.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
