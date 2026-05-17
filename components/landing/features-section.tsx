'use client'

import { BrainCircuit, FileBadge2, Link2, Smartphone, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'

const ICON_MAP: Record<string, LucideIcon> = { BrainCircuit, FileBadge2, Link2, Smartphone }

const BENTO_CLASSES = [
  'md:col-span-2 md:row-span-1',
  'md:col-span-1 md:row-span-1',
  'md:col-span-1 md:row-span-1',
  'md:col-span-2 md:row-span-1',
] as const

export function FeaturesSection({ features }: { features: Array<{ icon: string; title: string; description: string; benefit: string }> }) {
  const reduce = useReducedMotion()
  return (
    <section className="relative border-b border-white/5 bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto sm:text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Why teams switch</p>
          <h2 className="mt-3 text-[clamp(28px,5vw,48px)] font-semibold tracking-[-0.02em]">
            Four pieces that shorten the gap between <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">site visit and signed work.</span>
          </h2>
          <p className="mt-6 text-lg leading-[1.55] text-muted-foreground">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map(({ icon, title, description, benefit }, index) => {
            const Icon = ICON_MAP[icon] ?? BrainCircuit
            const bentoClass = BENTO_CLASSES[index] ?? ''
            return (
              <motion.div
                key={title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.55, delay: index * 0.12, ease: 'easeOut' }}
                className={bentoClass}
              >
                {/*
                  Glass surface tokens WITHOUT backdrop-blur (perf gate for landing scroll).
                  Polish: hover lift 2px + glow intensifies + border tints brand.
                */}
                <Card
                  variant="glass"
                  className="group relative h-full overflow-hidden rounded-3xl p-8 backdrop-blur-none transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_60px_hsl(var(--primary)/0.22)]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <span className="mb-6 inline-flex size-12 items-center justify-center rounded-full gradient-brand text-white shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)] transition-transform duration-500 group-hover:scale-110">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mb-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
                  <p className="mb-6 text-base leading-relaxed text-muted-foreground">{description}</p>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-bold text-secondary shadow-[0_0_10px_hsl(var(--primary)/0.1)] transition-colors group-hover:bg-primary/20">
                    {benefit}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
