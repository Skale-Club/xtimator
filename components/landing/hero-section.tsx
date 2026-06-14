'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.cta-glow'))
    els.forEach(el => { el.style.animation = 'none' })
    void document.body.offsetHeight
    els.forEach(el => { el.style.animation = '' })
  }, [])

  return (
    <section className="relative isolate flex flex-1 min-h-0 flex-col overflow-hidden border-b border-white/5 bg-transparent sm:max-h-[560px]">
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto flex w-full flex-1 min-h-0 flex-col max-w-6xl px-6 sm:px-8 lg:px-10">
        <div
          className={
            hasImage
              ? 'flex flex-1 min-h-0 flex-col gap-2 pt-8 sm:flex-row sm:items-stretch sm:gap-6 sm:pt-0'
              : 'flex flex-col items-center justify-center gap-6 py-16 text-center'
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
            className={
              hasImage
                ? 'hero-left relative z-10 flex min-w-0 flex-col justify-center space-y-4 sm:w-[55%] sm:shrink-0 sm:py-10 lg:w-[55%]'
                : 'max-w-3xl space-y-4'
            }
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

            <motion.h1
              variants={FADE_UP_ANIMATION_VARIANTS}
              className="hero-h1 text-[clamp(40px,7vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em] lg:w-[580px]"
            >
              {content.heroHeadline.split(' ')[0]}
              <br />
              {content.heroHeadline.split(' ').slice(1).join(' ')}
            </motion.h1>

            <motion.p
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  ? 'max-w-2xl text-sm leading-[1.5] text-muted-foreground sm:text-base'
                  : 'mx-auto max-w-2xl text-sm leading-[1.5] text-muted-foreground sm:text-base'
              }
            >
              {(() => {
                const breakAt = 'and branded'
                const idx = content.heroSubheadline.indexOf(breakAt)
                if (idx === -1) return content.heroSubheadline
                return <>
                  {content.heroSubheadline.slice(0, idx)}
                  <br />
                  {content.heroSubheadline.slice(idx)}
                </>
              })()}
            </motion.p>

            <motion.div
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  ? 'flex flex-row gap-2 sm:gap-3'
                  : 'flex flex-row gap-2 sm:gap-3 sm:justify-center'
              }
            >
              <div className="cta-glow inline-flex flex-1 sm:flex-none">
                <Button variant="primary" size="default" className="w-full sm:w-auto sm:min-w-40" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                </Button>
              </div>
              <Button
                asChild
                size="default"
                variant="outline"
                className="flex-1 sm:flex-none border-white/10 bg-white/5 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto sm:min-w-36 h-9 text-sm px-1 sm:h-10 sm:px-4"
              >
                <Link href="/demo">See Demo</Link>
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: image */}
          {hasImage && (
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.95, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 1, type: 'spring', delay: 0.3 }}
              className="hero-image relative z-0 flex-1 min-h-0 self-stretch sm:absolute sm:top-[1in] sm:bottom-0 sm:left-[calc(58%_-_100px)] sm:right-[-2rem] sm:scale-110 sm:origin-bottom lg:top-[36px] lg:left-[calc(35%_+_55px)] lg:right-[-2.5rem] lg:scale-100"
            >
              <img
                src={content.heroImageUrl!}
                alt=""
                className="absolute inset-0 h-full w-full object-contain object-bottom"
                loading="eager"
              />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}
