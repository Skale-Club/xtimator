'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'

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

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-3 lg:gap-10">
          {steps.map(({ title, description }, index) => (
            <motion.div
              key={title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.55, delay: index * 0.12, ease: 'easeOut' }}
              className="group h-full"
            >
              {/* Outer halo wrapper — translucent white frame inset */}
              <div className="relative h-full rounded-3xl bg-white/10 p-[5px] transition-all duration-300 group-hover:bg-white/15 group-hover:-translate-y-1.5 group-hover:shadow-[0_12px_40px_hsl(var(--primary)/0.15)]">
                <Card
                  variant="glass"
                  className="relative flex h-full w-full select-none flex-col rounded-[19px] p-8 backdrop-blur-none transition-colors duration-300 group-hover:border-primary/30 md:text-center"
                >
                  <div className="pointer-events-none absolute inset-0 rounded-[19px] bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <h3 className="mb-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
                  <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
                </Card>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
