'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, LogIn, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

type HeroContent = { heroHeadline: string; heroSubheadline: string; ctaLabel: string }

// Trust band copy — placeholder strings, i18n-ready (centralize here so a
// future t() wiring is a 1-line swap per entry).
const TRUST_BAND = {
  contractors: 'Used by 500+ contractors',
  estimates:   '12,000+ estimates sent',
  rating:      '4.9/5 average rating',
}

const FADE_UP_ANIMATION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', duration: 1 } },
}

export function HeroSection({ content }: { content: HeroContent }) {
  const reduce = useReducedMotion()
  const STEPS = [
    { step: '1', label: 'Processing Voice Notes...', detail: '"Remove existing drywall, install 1/2 inch moisture resistant..."' },
    { step: '2', label: 'Analyzing Photos', detail: 'Extracting dimensions and conditions from 4 site photos.' },
    { step: '3', label: 'Drafting PDF', detail: 'Generating line items and standard pricing.' },
  ]

  const [hoveredStep, setHoveredStep] = useState<string | null>(null)

  return (
    <section className="relative isolate overflow-hidden border-b border-white/5 bg-transparent py-[clamp(40px,7vw,72px)]">
      {/* Phase 71 — animated gradient mesh + dot overlay backdrop (motion-gated via CSS). */}
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      {/* Keep original gradient-hero radial for token cascade. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-11 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          {/* Left: headline + CTAs */}
          <motion.div
            initial={reduce ? false : 'hidden'}
            animate="show"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.15 } },
            }}
            className="max-w-2xl space-y-6"
          >
            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-secondary backdrop-blur-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Built for contractors
              </div>
            </motion.div>

            {/* Display headline — clamp(40,7vw,68), tracking -0.03em */}
            <motion.h1
              variants={FADE_UP_ANIMATION_VARIANTS}
              className="text-balance text-[clamp(40px,7vw,68px)] font-semibold leading-[1.02] tracking-[-0.03em]"
            >
              {content.heroHeadline}
            </motion.h1>

            <motion.p
              variants={FADE_UP_ANIMATION_VARIANTS}
              className="max-w-2xl text-base leading-[1.55] text-muted-foreground sm:text-lg"
            >
              {content.heroSubheadline}
            </motion.p>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-col gap-3 sm:flex-row">
              {/* Glow ring on primary CTA — breathing pulse, motion-gated via CSS */}
              <div className="cta-glow inline-flex w-full sm:w-auto">
                <Button asChild variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-40">
                  <Link href="/signup">
                    {content.ctaLabel}
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-white/10 bg-white/5 font-semibold text-foreground transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-36"
              >
                <Link href="/login" className="text-center">
                  See Demo
                </Link>
              </Button>
            </motion.div>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground/80">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> iPhone &amp; Android</span>
            </motion.div>

            {/* Trust band — placeholder stats, i18n-ready via TRUST_BAND constants. */}
            <motion.div
              variants={FADE_UP_ANIMATION_VARIANTS}
              className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:gap-8"
            >
              {[TRUST_BAND.contractors, TRUST_BAND.estimates, TRUST_BAND.rating].map((stat) => (
                <div key={stat} className="flex items-center gap-2 text-xs font-medium text-muted-foreground/90">
                  <span className="size-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
                  {stat}
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right: Mockup Panel */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.95, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, type: 'spring', delay: 0.3 }}
            className="hidden w-full max-w-md lg:block lg:shrink-0"
          >
            <div className="relative rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_0_80px_hsl(var(--primary)/0.25)]">
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-tr from-primary/20 via-transparent to-secondary/20 blur-xl" />
              <div className="rounded-xl border border-white/5 bg-background p-6 shadow-2xl">
                <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                    <p className="text-sm font-semibold text-foreground">AI Estimator Active</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-secondary">On-site</span>
                </div>
                <div
                  className="space-y-4"
                  onMouseLeave={() => setHoveredStep(null)}
                >
                  {STEPS.map(({ step, label, detail }) => {
                    const isActive = hoveredStep === step || (hoveredStep === null && step === '1')
                    return (
                      <div
                        key={step}
                        onMouseEnter={() => setHoveredStep(step)}
                        className={`flex items-center gap-4 rounded-xl border p-4 transition-all ${isActive ? 'border-primary/40 bg-primary/5 shadow-[0_0_20px_hsl(var(--primary)/0.1)]' : 'border-white/5 bg-white/5'}`}
                      >
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none ${isActive ? 'bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)]' : 'bg-white/10 text-muted-foreground'}`}>
                          {step}
                        </div>
                        <div>
                          <p className={`mb-1 text-sm font-bold ${isActive ? 'text-white' : 'text-foreground'}`}>{label}</p>
                          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{detail}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
