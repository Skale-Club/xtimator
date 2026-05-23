'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, useReducedMotion } from 'framer-motion'

interface FinalCtaSectionProps {
  onOpenAuth?: (mode: 'login' | 'signup') => void
}

export function FinalCtaSection({ onOpenAuth }: FinalCtaSectionProps) {
  const reduce = useReducedMotion()
  return (
    <section className="relative isolate bg-transparent py-[clamp(40px,7vw,64px)]">
      {/* Phase 71 gradient-hero radial backdrop (NO blur on landing — perf gate) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 px-6 py-10 shadow-[0_0_80px_hsl(var(--primary)/0.15)] sm:px-12 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-8"
        >
          {/* Background glows */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_50%_at_50%_120%,hsl(var(--primary)/0.3),transparent)]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,hsl(var(--secondary)/0.1),transparent)]" aria-hidden="true" />

          <div className="relative z-10 max-w-2xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Ready to try it live?</p>
            <h2 className="text-[clamp(28px,4.5vw,44px)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              Start your next estimate <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">before you leave the property.</span>
            </h2>
            <p className="max-w-xl text-base leading-[1.55] text-muted-foreground sm:text-lg">
              Use the visit you already have to produce a cleaner, faster quote for the customer.
            </p>
          </div>

          <div className="relative z-10 mt-10 flex shrink-0 flex-col gap-4 sm:flex-row lg:mt-0">
            <Button variant="primary" size="lg" className="h-14 text-lg font-semibold sm:min-w-44" onClick={() => onOpenAuth?.('signup')}>
              Start
              <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-lg font-semibold border-white/10 bg-white/5 transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-40"
              onClick={() => onOpenAuth?.('login')}
            >
              See Demo
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
