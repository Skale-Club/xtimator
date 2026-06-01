'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

type HeroContent = {
  heroHeadline: string
  heroSubheadline: string
  ctaLabel: string
  /** Optional 1:1 hero image URL. When null, the hero renders as a single centered column. */
  heroImageUrl: string | null
}


const FADE_UP_ANIMATION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', duration: 1 } },
}

export function HeroSection({ content, onOpenAuth }: { content: HeroContent; onOpenAuth?: (mode: 'login' | 'signup') => void }) {
  const reduce = useReducedMotion()
  const hasImage = !!content.heroImageUrl

  return (
    <section className="relative isolate flex flex-1 flex-col justify-center overflow-hidden border-b border-white/5 bg-transparent py-6 lg:py-8">
      {/* Phase 71 — animated gradient mesh + dot overlay backdrop (motion-gated via CSS). */}
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      {/* Keep original gradient-hero radial for token cascade. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div
          className={
            hasImage
              ? 'flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-8'
              : 'flex flex-col items-center gap-6 text-center'
          }
        >
          {/* Left: headline + CTAs */}
          <motion.div
            initial={reduce ? false : 'hidden'}
            animate="show"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.15 } },
            }}
            className={hasImage ? 'relative z-10 min-w-0 space-y-4 lg:w-[58%] lg:shrink-0 lg:self-center' : 'max-w-3xl space-y-4'}
          >
            <motion.div
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={hasImage ? 'flex justify-start' : 'flex justify-center'}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-secondary backdrop-blur-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Built for contractors
              </div>
            </motion.div>

            {/* Display headline — clamp(40,7vw,68), tracking -0.03em */}
            <motion.h1
              variants={FADE_UP_ANIMATION_VARIANTS}
              className="text-balance text-[clamp(40px,7vw,56px)] font-semibold leading-[1.02] tracking-[-0.03em]"
            >
              {content.heroHeadline}
            </motion.h1>

            <motion.p
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  ? 'max-w-2xl text-base leading-[1.55] text-muted-foreground sm:text-lg'
                  : 'mx-auto max-w-2xl text-base leading-[1.55] text-muted-foreground sm:text-lg'
              }
            >
              {content.heroSubheadline}
            </motion.p>

            <motion.div
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  ? 'flex flex-col gap-3 sm:flex-row'
                  : 'flex flex-col gap-3 sm:flex-row sm:justify-center'
              }
            >
              {/* Glow ring on primary CTA — breathing pulse, motion-gated via CSS */}
              <div className="cta-glow inline-flex w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-40" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Button>
              </div>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-white/10 bg-white/5 font-semibold text-foreground transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-36"
              >
                <Link href="/demo">See Demo</Link>
              </Button>
            </motion.div>


          </motion.div>

          {/* Right: 1:1 photo (hidden on mobile to keep CTA above the fold). */}
          {hasImage && (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.95, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 1, type: 'spring', delay: 0.3 }}
              className="relative z-0 flex w-[calc(100%+4rem)] -mx-8 sm:w-[calc(100%+6rem)] sm:-mx-12 -mb-[clamp(8px,1.5vw,16px)] lg:w-[50%] lg:mx-0 lg:shrink-0 lg:items-end lg:self-stretch lg:-mr-[clamp(16px,1.5vw,28px)] lg:-ml-[clamp(48px,6vw,96px)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={content.heroImageUrl!}
                alt=""
                className="w-full object-contain object-bottom drop-shadow-[0_0_60px_hsl(var(--primary)/0.25)]"
                loading="eager"
              />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}
