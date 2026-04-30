'use client'

import { Mic, Camera, FileText } from 'lucide-react'
import { motion } from 'framer-motion'

const steps = [
  {
    icon: Mic,
    eyebrow: 'Step 1',
    title: 'Record audio',
    description:
      'Walk the property and talk through measurements, materials, and special requests while your hands stay free.',
  },
  {
    icon: Camera,
    eyebrow: 'Step 2',
    title: 'Add photos',
    description:
      'Drop in site photos so the AI can anchor line items to the real condition of the work.',
  },
  {
    icon: FileText,
    eyebrow: 'Step 3',
    title: 'Get estimate',
    description:
      'Review the draft estimate, then send a branded PDF or live link without rebuilding the job from scratch.',
  },
] as const

export function HowItWorksSection() {
  return (
    <section className="relative border-b border-white/5 bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto sm:text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#406EF1]">How it works</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Built around the way <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">estimates happen in the field.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            No clipboard rewrite later. Capture the job once and turn that visit into a professional quote package.
          </p>
        </div>

        <div className="relative mx-auto max-w-4xl">
          {/* Vertical line connecting steps */}
          <div className="absolute left-8 top-8 bottom-8 hidden w-px bg-gradient-to-b from-[#406EF1] via-[#406EF1]/20 to-transparent md:block" aria-hidden="true" />
          
          <div className="space-y-12 md:space-y-20">
            {steps.map(({ icon: Icon, eyebrow, title, description }, index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative flex flex-col gap-6 md:flex-row md:items-start md:gap-12"
              >
                {/* Icon Circle that sits on the vertical line */}
                <div className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0f] shadow-[0_0_20px_rgba(64,110,241,0.2)] md:h-16 md:w-16">
                  <div className="absolute inset-0 rounded-full bg-[#406EF1]/10 blur-md" />
                  <Icon className="relative z-10 size-6 text-[#7FA4F4]" aria-hidden="true" />
                </div>
                
                {/* Card Content */}
                <div className="group relative flex-1 rounded-2xl border border-white/5 bg-white/[0.02] p-8 shadow-2xl transition-colors hover:bg-white/[0.04]">
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-[#406EF1]/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <p className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-[#406EF1]">{eyebrow}</p>
                  <h3 className="mb-3 text-2xl font-bold tracking-tight text-white">{title}</h3>
                  <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
