'use client'

import Link from 'next/link'
import { ArrowRight, LogIn, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, type Variants } from 'framer-motion'

type HeroContent = { heroHeadline: string; heroSubheadline: string; ctaLabel: string }

const FADE_UP_ANIMATION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', duration: 1 } },
}

export function HeroSection({ content }: { content: HeroContent }) {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-transparent pt-8 md:pt-11">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-11">
        <div className="flex flex-col gap-11 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          {/* Left: headline + CTAs */}
          <motion.div
            initial="hidden"
            animate="show"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.15 } },
            }}
            className="max-w-2xl space-y-5"
          >
            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-secondary">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Built for contractors &amp; field crews
              </div>
            </motion.div>

            <motion.h1 variants={FADE_UP_ANIMATION_VARIANTS} className="text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
              {content.heroHeadline}
            </motion.h1>

            <motion.p variants={FADE_UP_ANIMATION_VARIANTS} className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {content.heroSubheadline}
            </motion.p>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-10 bg-primary text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-36"
              >
                <Link href="/signup">
                  {content.ctaLabel}
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-10 border-white/10 bg-white/5 text-sm font-semibold text-foreground transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-36"
              >
                <Link href="/login">
                  Log in
                  <LogIn className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
            </motion.div>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground/80">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" /> iPhone &amp; Android</span>
            </motion.div>
          </motion.div>

          {/* Right: Mockup Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, type: "spring", delay: 0.3 }}
            className="hidden w-full max-w-md lg:block lg:shrink-0"
          >
            <div className="relative rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_0_60px_hsl(var(--primary)/0.15)] backdrop-blur-md">
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-tr from-primary/20 via-transparent to-secondary/20 blur-xl" />
              <div className="rounded-xl border border-white/5 bg-background p-6 shadow-2xl">
                <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                    <p className="text-sm font-semibold text-foreground">AI Estimator Active</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-secondary">On-site</span>
                </div>
                <div className="space-y-4">
                  {[
                    { step: '1', label: 'Processing Voice Notes...', detail: '"Remove existing drywall, install 1/2 inch moisture resistant..."', active: true },
                    { step: '2', label: 'Analyzing Photos', detail: 'Extracting dimensions and conditions from 4 site photos.', active: false },
                    { step: '3', label: 'Drafting PDF', detail: 'Generating line items and standard pricing.', active: false },
                  ].map(({ step, label, detail, active }) => (
                    <div key={step} className={`flex gap-4 rounded-xl border p-4 transition-all ${active ? 'border-primary/40 bg-primary/5 shadow-[0_0_20px_hsl(var(--primary)/0.1)]' : 'border-white/5 bg-white/5'}`}>
                      <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-primary text-primary-foreground shadow-[0_0_10px_hsl(var(--primary)/0.5)]' : 'bg-white/10 text-muted-foreground'}`}>
                        {step}
                      </div>
                      <div>
                        <p className={`mb-1 text-sm font-bold ${active ? 'text-white' : 'text-foreground'}`}>{label}</p>
                        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
