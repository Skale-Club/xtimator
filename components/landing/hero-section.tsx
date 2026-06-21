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
    <section className="relative isolate flex flex-1 min-h-0 flex-col overflow-hidden border-b border-white/5 bg-transparent min-h-[420px] sm:min-h-0 sm:max-h-[520px] md:max-h-[620px] lg:max-h-[520px]">
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto flex w-full flex-1 min-h-0 flex-col max-w-6xl px-6 sm:px-8 lg:px-10">
        <div
          className={
            hasImage
              ? 'hero-content flex flex-1 min-h-0 flex-col gap-2 pt-16 sm:flex-row sm:items-center sm:gap-6 sm:pt-0'
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
                ? 'hero-left relative z-10 flex min-w-0 flex-col justify-center space-y-4 sm:w-[55%] sm:shrink-0 md:w-[58%] lg:w-[55%]'
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
              className="hero-h1 text-[clamp(29px,7.7vw,56px)] sm:text-[clamp(35px,5.5vw,42px)] md:text-[clamp(32px,4.5vw,46px)] lg:text-[clamp(42px,4.5vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em] lg:w-[580px]"
            >
              {content.heroHeadline.split(' ')[0]}
              {/* Always break after word 1 — keeps the title 3 lines on desktop too */}
              <br />
              {' '}{content.heroHeadline.split(' ')[1]}
              <br className="hidden sm:block" />
              {' '}{content.heroHeadline.split(' ').slice(2).join(' ')}
            </motion.h1>

            <motion.p
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  // xl:text-[20px] keeps the title:subheadline ratio (~2.8) harmonic on
                  // wide desktop — the iPad media queries already tune it for tablets.
                  ? 'sm:max-w-2xl text-[16.8px] leading-[1.5] text-muted-foreground sm:text-[14px] lg:text-base xl:text-[20px]'
                  : 'mx-auto max-w-2xl text-[16.8px] leading-[1.5] text-muted-foreground sm:text-base'
              }
            >
              {(() => {
                const text = content.heroSubheadline
                const b1 = text.indexOf('pricing,')
                const b2 = text.indexOf('you leave')
                if (b1 === -1 || b2 === -1) return text
                return <>
                  {text.slice(0, b1)}
                  {/* 3-line break shown ≥768 (tablet + desktop); 640-767 stays natural-wrap */}
                  <br className="block sm:hidden md:block" />
                  {text.slice(b1, b2)}
                  <br className="block sm:hidden md:block" />
                  {text.slice(b2)}
                </>
              })()}
            </motion.p>

            <motion.div
              variants={FADE_UP_ANIMATION_VARIANTS}
              className={
                hasImage
                  ? 'flex flex-col gap-2 min-[1280px]:flex-row min-[1280px]:gap-3'
                  : 'flex flex-col gap-2 min-[1280px]:flex-row min-[1280px]:gap-3 min-[1280px]:justify-center'
              }
            >
              <div className="cta-glow max-sm:[box-shadow:none] max-sm:[animation:none] max-[1279px]:self-start min-[1280px]:self-auto min-[1280px]:flex-none">
                <Button variant="primary" size="default" className="min-w-40" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                </Button>
              </div>
              <Button
                asChild
                size="default"
                variant="outline"
                className="w-fit px-6 self-start sm:flex-none border-white/10 bg-white/5 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-fit sm:min-w-36 h-10 text-sm sm:px-4"
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
              className="hero-image absolute top-[23%] bottom-0 right-[-15px] w-[75%] z-0 sm:h-auto sm:absolute sm:top-[1in] sm:bottom-0 sm:left-[calc(58%_-_100px)] sm:right-[-2rem] sm:w-auto sm:scale-110 sm:origin-bottom md:top-16 lg:top-[36px] lg:left-[calc(35%_+_55px)] lg:right-[-2.5rem] lg:scale-100 xl:top-[65px] xl:left-[calc(35%_+_45px)] xl:right-[-30px]"
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
