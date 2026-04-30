'use client'

import { BrainCircuit, FileBadge2, Link2, Smartphone } from 'lucide-react'
import { motion } from 'framer-motion'

const features = [
  {
    icon: BrainCircuit,
    title: 'AI-generated estimate draft',
    description:
      'Turns field notes and site photos into a structured scope you can review instead of writing from a blank page.',
    benefit: 'Skip the blank-page struggle',
    className: 'md:col-span-2 md:row-span-1',
  },
  {
    icon: FileBadge2,
    title: 'Branded PDF output',
    description:
      'Send estimates that look polished, consistent, and ready for the customer without extra formatting work.',
    benefit: 'Look professional',
    className: 'md:col-span-1 md:row-span-1',
  },
  {
    icon: Link2,
    title: 'Share link for fast approvals',
    description:
      'Deliver a live estimate link when the customer wants the quote now, not after you get back to the office.',
    benefit: 'Faster response',
    className: 'md:col-span-1 md:row-span-1',
  },
  {
    icon: Smartphone,
    title: 'Mobile-first from the driveway',
    description:
      'Designed for iPhone and Android job-site use, where typing is slow and conditions are rarely perfect.',
    benefit: 'Works where you work',
    className: 'md:col-span-2 md:row-span-1',
  },
] as const

export function FeaturesSection() {
  return (
    <section className="relative border-b border-white/5 bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto sm:text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#406EF1]">Why teams switch</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Four pieces that shorten the gap between <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#406EF1] to-[#7FA4F4]">site visit and signed work.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description, benefit, className }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8 shadow-2xl transition-all hover:bg-white/[0.04] hover:shadow-[0_0_40px_rgba(64,110,241,0.1)] ${className}`}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#406EF1]/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="mb-6 inline-flex size-14 items-center justify-center rounded-2xl bg-[#406EF1]/10 text-[#7FA4F4] shadow-[inset_0_0_20px_rgba(64,110,241,0.1)] transition-transform duration-500 group-hover:scale-110">
                <Icon className="size-6" aria-hidden="true" />
              </div>
              <h3 className="mb-3 text-2xl font-bold tracking-tight text-white">{title}</h3>
              <p className="mb-6 text-base leading-relaxed text-muted-foreground">{description}</p>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#406EF1]/30 bg-[#406EF1]/10 px-3 py-1.5 text-sm font-bold text-[#7FA4F4] shadow-[0_0_10px_rgba(64,110,241,0.1)] transition-colors group-hover:bg-[#406EF1]/20">
                {benefit}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
