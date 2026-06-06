'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'

export function HowItWorksSection({ steps }: { steps: Array<{ eyebrow: string; title: string; description: string }> }) {
  const reduce = useReducedMotion()
  return (
    <section className="relative flex flex-1 flex-col justify-center border-b border-white/5 bg-transparent py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-6 max-w-2xl text-center sm:mx-auto sm:mb-10 lg:mb-16">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">How it works</p>
          <h2 className="mt-2 text-[clamp(22px,5vw,48px)] font-semibold tracking-[-0.02em] sm:mt-3">
            Built around the way <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">estimates happen in the field.</span>
          </h2>
          <p className="mt-2 text-sm leading-[1.5] text-muted-foreground sm:mt-4 sm:text-lg">
            No clipboard rewrite later. Capture the job once and turn that visit into a professional quote package.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-[11px] sm:gap-6 md:grid-cols-3 lg:gap-10">
          {steps.map(({ title, description }, index) => (
            <motion.div
              key={title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: index * 0.12, ease: 'easeOut' }}
              className="group h-full"
            >
              <div className="relative h-full rounded-2xl bg-white/10 p-[5px] transition-all duration-300 group-hover:bg-white/15 group-hover:-translate-y-1 group-hover:shadow-[0_12px_40px_hsl(var(--primary)/0.15)]">
                <Card
                  variant="glass"
                  className="relative flex h-full w-full select-none flex-col rounded-[13px] p-4 sm:p-6 lg:p-8 backdrop-blur-none transition-colors duration-300 group-hover:border-primary/30 md:text-center"
                >
                  <div className="pointer-events-none absolute inset-0 rounded-[13px] bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="mb-3 inline-flex size-7 items-center justify-center rounded-full gradient-brand text-xs font-bold text-white shadow-[inset_0_0_12px_hsl(var(--primary)/0.2)] transition-transform duration-500 group-hover:scale-110 sm:mb-4 sm:size-9 md:mx-auto lg:size-10">
                    {index + 1}
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold tracking-tight text-white sm:mb-2 sm:text-xl lg:text-2xl">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">{description}</p>
                </Card>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
