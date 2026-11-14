'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GooglePlayBadge } from '@/components/landing/google-play-badge'
import { motion, useReducedMotion } from 'framer-motion'

interface FinalCtaSectionProps {
  onOpenAuth?: (mode: 'login' | 'signup') => void
  /** Server decision for the Google Play badge (false inside the TWA and on iOS). */
  showStoreBadge?: boolean
}

export function FinalCtaSection({ onOpenAuth, showStoreBadge = true }: FinalCtaSectionProps) {
  const reduce = useReducedMotion()
  return (
    <section className="relative isolate bg-transparent py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 px-[50px] py-[50px] shadow-[0_0_80px_hsl(var(--primary)/0.15)] sm:px-12 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-8"
        >
          {/* Background glows */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_50%_at_50%_120%,hsl(var(--primary)/0.3),transparent)]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,hsl(var(--secondary)/0.1),transparent)]" aria-hidden="true" />

          <div className="relative z-10 max-w-2xl space-y-2 sm:space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">Ready to try it live?</p>
            <h2 className="text-[31px] font-semibold leading-[1.1] tracking-[-0.02em] text-white sm:text-[clamp(28px,4.5vw,44px)] lg:text-[clamp(27px,4.275vw,42px)]">
              Start your next estimate <br />
              before{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">you leave the property.</span>
            </h2>
            <p className="max-w-xl text-[18px] leading-relaxed text-muted-foreground sm:text-lg">
              Use the visit you already have to produce a cleaner, faster quote for the customer.
            </p>
          </div>

          {/* Buttons, then the store badge on its own line under them (the badge PNG
              carries Google's clear space, so it never lines up with the buttons). */}
          <div className="relative z-10 mt-4 flex shrink-0 flex-col items-center gap-3 sm:mt-10 sm:items-start lg:mt-0 lg:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-4">
              <Button variant="primary" size="lg" className="cta-glow h-10 text-sm font-semibold sm:h-14 sm:text-lg sm:min-w-44" onClick={() => onOpenAuth?.('signup')}>
                Start
                <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-9 text-sm px-1 font-semibold sm:h-14 sm:text-lg sm:px-6 border-white/10 bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-40"
              >
                <Link href="/demo/entry">See Demo</Link>
              </Button>
            </div>
            {showStoreBadge && (
              <GooglePlayBadge placement="final_cta" className="h-[60px]" />
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
