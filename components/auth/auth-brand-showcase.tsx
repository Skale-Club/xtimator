import { Sparkles, FileText, Mic } from 'lucide-react'

interface AuthBrandShowcaseProps {
  appName: string
}

/**
 * Phase 71 polish — right-column brand showcase on auth pages (desktop only).
 * Hidden on mobile via layout (lg:block). Uses gradient-brand surface +
 * Xtimator wordmark + product testimonial copy. All strings are placeholders
 * grouped at the top so a future t() wiring is a single sweep.
 */
const SHOWCASE_COPY = {
  eyebrow: 'On every job site',
  quote:
    '"From audio walkthrough to a signed estimate in under five minutes. Xtimator pays for itself by the second job."',
  attribution: 'Daniel R.',
  attributionRole: 'Owner, Northstar Renovations',
  featureA: 'AI-drafted line items',
  featureB: 'Audio + photo capture',
  featureC: 'Branded PDFs',
}

export function AuthBrandShowcase({ appName }: AuthBrandShowcaseProps) {
  return (
    <div className="brand-showcase relative flex h-full flex-col justify-between overflow-hidden p-12 text-white xl:p-16">
      {/* Decorative dot pattern overlay */}
      <div aria-hidden className="hero-dots opacity-60" />

      {/* Top — wordmark */}
      <div className="relative z-10 flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">{appName}</span>
      </div>

      {/* Middle — pull quote */}
      <div className="relative z-10 max-w-md space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
          {SHOWCASE_COPY.eyebrow}
        </p>
        <blockquote className="text-balance text-[clamp(22px,2.4vw,32px)] font-semibold leading-[1.18] tracking-[-0.02em]">
          {SHOWCASE_COPY.quote}
        </blockquote>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{SHOWCASE_COPY.attribution}</span>
          <span className="text-sm text-white/75">{SHOWCASE_COPY.attributionRole}</span>
        </div>
      </div>

      {/* Bottom — feature pills */}
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        {[
          { icon: Mic, label: SHOWCASE_COPY.featureB },
          { icon: Sparkles, label: SHOWCASE_COPY.featureA },
          { icon: FileText, label: SHOWCASE_COPY.featureC },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
