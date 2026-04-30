'use client'

import Link from 'next/link'
import { ArrowRight, LogIn, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

const FADE_UP_ANIMATION_VARIANTS = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', duration: 1 } },
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-transparent pt-12 md:pt-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(64,110,241,0.5),transparent)]" />
      
      <div className="relative mx-auto max-w-6xl px-6 py-14 sm:px-8 sm:py-20 lg:px-10 lg:py-28">
        <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          {/* Left: headline + CTAs */}
          <motion.div 
            initial="hidden"
            animate="show"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.15 } },
            }}
            className="max-w-2xl space-y-8"
          >
            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#406EF1]/30 bg-[#406EF1]/10 px-3 py-1.5 text-sm font-medium text-[#7FA4F4] shadow-[0_0_20px_rgba(64,110,241,0.15)]">
                <Sparkles className="size-4" aria-hidden="true" />
                Built for contractors & field crews
              </div>
            </motion.div>

            <motion.h1 variants={FADE_UP_ANIMATION_VARIANTS} className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Professional estimates <br />
              <span className="bg-gradient-to-r from-[#406EF1] to-[#7FA4F4] bg-clip-text text-transparent drop-shadow-sm">
                in 5 minutes.
              </span>
            </motion.h1>

            <motion.p variants={FADE_UP_ANIMATION_VARIANTS} className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Record a site walkthrough, add photos, and let AI draft the scope, pricing, and branded PDF before you leave the driveway.
            </motion.p>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-14 bg-[#406EF1] text-lg font-semibold text-white shadow-[0_0_30px_rgba(64,110,241,0.4)] transition-all hover:scale-105 hover:bg-[#406EF1]/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] sm:min-w-44"
              >
                <Link href="/signup">
                  Start free
                  <ArrowRight className="ml-2 size-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 border-white/10 bg-white/5 text-lg font-semibold text-foreground transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f] sm:min-w-44"
              >
                <Link href="/login">
                  Log in
                  <LogIn className="ml-2 size-5" aria-hidden="true" />
                </Link>
              </Button>
            </motion.div>

            <motion.div variants={FADE_UP_ANIMATION_VARIANTS} className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground/80">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#406EF1]" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#406EF1]" /> iPhone & Android</span>
            </motion.div>
          </motion.div>

          {/* Right: Mockup Panel */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1, type: "spring", delay: 0.3 }}
            className="hidden w-full max-w-md lg:block lg:shrink-0"
          >
            <div className="relative rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_0_60px_rgba(64,110,241,0.15)] backdrop-blur-md">
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-tr from-[#406EF1]/20 via-transparent to-[#7FA4F4]/20 blur-xl" />
              <div className="rounded-xl border border-white/5 bg-[#0a0a0f] p-6 shadow-2xl">
                <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 animate-pulse rounded-full bg-[#406EF1]" aria-hidden="true" />
                    <p className="text-sm font-semibold text-foreground">AI Estimator Active</p>
                  </div>
                  <span className="rounded-full bg-[#406EF1]/10 px-2 py-1 text-xs font-bold text-[#7FA4F4]">On-site</span>
                </div>
                <div className="space-y-4">
                  {[
                    { step: '1', label: 'Processing Voice Notes...', detail: '"Remove existing drywall, install 1/2 inch moisture resistant..."', active: true },
                    { step: '2', label: 'Analyzing Photos', detail: 'Extracting dimensions and conditions from 4 site photos.', active: false },
                    { step: '3', label: 'Drafting PDF', detail: 'Generating line items and standard pricing.', active: false },
                  ].map(({ step, label, detail, active }) => (
                    <div key={step} className={`flex gap-4 rounded-xl border p-4 transition-all ${active ? 'border-[#406EF1]/40 bg-[#406EF1]/5 shadow-[0_0_20px_rgba(64,110,241,0.1)]' : 'border-white/5 bg-white/5'}`}>
                      <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-[#406EF1] text-white shadow-[0_0_10px_rgba(64,110,241,0.5)]' : 'bg-white/10 text-muted-foreground'}`}>
                        {step}
                      </div>
                      <div>
                        <p className={`mb-1 text-sm font-bold ${active ? 'text-white' : 'text-foreground'}`}>{label}</p>
                        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
