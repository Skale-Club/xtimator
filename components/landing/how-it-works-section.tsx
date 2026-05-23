'use client'

import { Mic, Camera, FileText } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'

const STEP_ICONS = [Mic, Camera, FileText] as const

export function HowItWorksSection({ steps }: { steps: Array<{ eyebrow: string; title: string; description: string }> }) {
  const reduce = useReducedMotion()
  return (
    <section className="relative border-b border-white/5 bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto sm:text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">How it works</p>
          <h2 className="mt-3 text-[clamp(28px,5vw,48px)] font-semibold tracking-[-0.02em]">
            Built around the way <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">estimates happen in the field.</span>
          </h2>
          <p className="mt-6 text-lg leading-[1.55] text-muted-foreground">
            No clipboard rewrite later. Capture the job once and turn that visit into a professional quote package.
          </p>
        </div>

        <div className="relative mx-auto max-w-5xl">
          {/* Horizontal line connecting steps on desktop (aligned with badge centers at top-8) */}
          <div className="absolute left-[16.7%] right-[16.7%] top-8 hidden h-0.5 bg-gradient-to-r from-primary/10 via-primary/30 to-primary/10 md:block" aria-hidden="true" />

          {/* Vertical line connecting steps on mobile */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-primary via-primary/20 to-transparent md:hidden" aria-hidden="true" />

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8 lg:gap-10">
            {steps.map(({ eyebrow, title, description }, index) => {
              const Icon = STEP_ICONS[index] ?? Mic
              const stepNumber = String(index + 1).padStart(2, '0')
              return (
                <motion.div
                  key={title}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.55, delay: index * 0.12, ease: 'easeOut' }}
                  className="group relative flex flex-col items-start gap-4 md:items-center md:gap-0"
                >
                  {/* Number badge — gradient-brand fill with glow ring */}
                  <div className="relative z-10 inline-flex size-16 shrink-0 flex-col items-center justify-center rounded-full gradient-brand text-white shadow-[0_0_32px_hsl(var(--primary)/0.55)] ring-1 ring-white/15 md:mb-6 transition-all duration-300 group-hover:shadow-[0_0_40px_hsl(var(--primary)/0.75)] group-hover:scale-105">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75 leading-none">Step</span>
                    <span className="mt-0.5 text-xl font-semibold leading-none tracking-tight">{stepNumber}</span>
                    <Icon className="absolute -right-1 -bottom-1 size-5 rounded-full bg-background/90 p-0.5 text-primary ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" aria-hidden="true" />
                  </div>

                  {/* Card Content — glass token, hover lift + glow intensify */}
                  <Card
                    variant="glass"
                    className="relative w-full rounded-2xl p-8 backdrop-blur-none transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-primary/30 group-hover:shadow-[0_12px_40px_hsl(var(--primary)/0.15)] md:text-center"
                  >
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <p className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>
                    <h3 className="mb-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
                    <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
