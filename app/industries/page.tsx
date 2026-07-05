import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { createPublicMetadata } from '@/lib/seo/metadata'
import { SEO_INDUSTRIES } from '@/lib/seo/industries'

export const metadata: Metadata = createPublicMetadata({
  title: 'AI Estimating Software by Industry',
  description: 'See how contractors and service businesses use voice, photos, and AI to create professional estimates faster.',
  pathname: '/industries',
})

export default function IndustriesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-white/5 px-6 py-24">
        <div aria-hidden className="gradient-hero absolute inset-0 -z-10" />
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Built for field work</p>
          <h1 className="mt-4 max-w-4xl text-[clamp(42px,7vw,76px)] font-semibold leading-[0.98] tracking-[-0.04em]">
            Estimating that speaks your trade.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Xtimator turns the details you capture on site into a structured estimate draft—without forcing every trade into the same generic form.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-16 sm:grid-cols-2">
        {SEO_INDUSTRIES.map((industry, index) => (
          <Link
            key={industry.slug}
            href={`/industries/${industry.slug}`}
            className="group rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.06]"
          >
            <span className="text-xs font-semibold tabular-nums text-primary/80">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h2 className="mt-8 text-2xl font-semibold tracking-tight">{industry.name}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{industry.description}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Explore the workflow <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </section>
    </main>
  )
}
