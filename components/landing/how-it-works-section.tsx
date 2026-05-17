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

        <div className="relative mx-auto max-w-4xl">
          {/* Vertical line connecting steps */}
          <div className="absolute left-8 top-8 bottom-8 hidden w-px bg-gradient-to-b from-primary via-primary/20 to-transparent md:block" aria-hidden="true" />

          <div className="space-y-12 md:space-y-20">
            {steps.map(({ eyebrow, title, description }, index) => {
              const Icon = STEP_ICONS[index] ?? Mic
              return (
                <motion.div
                  key={title}
                  initial={reduce ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="relative flex flex-col gap-6 md:flex-row md:items-start md:gap-12"
                >
                  {/* Gradient brand circle that sits on the vertical line */}
                  <div className="relative z-10 inline-flex size-16 shrink-0 items-center justify-center rounded-full gradient-brand text-white shadow-[0_0_24px_hsl(var(--primary)/0.45)]">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>

                  {/* Card Content — glass token, NO blur (landing perf gate) */}
                  <Card
                    variant="glass"
                    className="group relative flex-1 rounded-2xl p-8 backdrop-blur-none transition-colors"
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
