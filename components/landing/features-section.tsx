'use client'

import { BrainCircuit, FileBadge2, Link2, Smartphone, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

const ICON_MAP: Record<string, LucideIcon> = { BrainCircuit, FileBadge2, Link2, Smartphone }

const BENTO_CLASSES = [
  'md:col-span-2 md:row-span-1',
  'md:col-span-1 md:row-span-1',
  'md:col-span-1 md:row-span-1',
  'md:col-span-2 md:row-span-1',
] as const

export function FeaturesSection({ features }: { features: Array<{ icon: string; title: string; description: string; benefit: string }> }) {
  return (
    <section className="relative border-b border-white/5 bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto sm:text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">Why teams switch</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Four pieces that shorten the gap between <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">site visit and signed work.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
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
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8 shadow-2xl transition-all hover:bg-white/[0.04] hover:shadow-[0_0_40px_hsl(var(--primary)/0.1)] ${bentoClass}`}
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="mb-6 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-secondary shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)] transition-transform duration-500 group-hover:scale-110">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="mb-3 text-2xl font-bold tracking-tight text-white">{title}</h3>
                <p className="mb-6 text-base leading-relaxed text-muted-foreground">{description}</p>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-bold text-secondary shadow-[0_0_10px_hsl(var(--primary)/0.1)] transition-colors group-hover:bg-primary/20">
                  {benefit}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
