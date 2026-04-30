'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

export function FinalCtaSection() {
  return (
    <section className="relative bg-transparent py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/40 px-6 py-16 shadow-[0_0_80px_rgba(64,110,241,0.15)] backdrop-blur-md sm:px-12 sm:py-20 lg:flex lg:items-center lg:justify-between lg:gap-8"
        >
          {/* Background glows */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_50%_at_50%_120%,rgba(64,110,241,0.3),transparent)]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,rgba(127,164,244,0.1),transparent)]" aria-hidden="true" />
          
          <div className="relative z-10 max-w-2xl space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#406EF1]">Ready to try it live?</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Start your next estimate <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#406EF1] to-[#7FA4F4]">before you leave the property.</span>
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Use the visit you already have to produce a cleaner, faster quote for the customer.
            </p>
          </div>

          <div className="relative z-10 mt-10 flex shrink-0 flex-col gap-4 sm:flex-row lg:mt-0">
            <Button
              asChild
              size="lg"
              className="group h-14 bg-[#406EF1] text-lg font-semibold text-white shadow-[0_0_30px_rgba(64,110,241,0.4)] transition-all hover:scale-105 hover:bg-[#406EF1]/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#13131A] sm:min-w-44"
            >
              <Link href="/signup">
                Create account
                <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-14 border-white/10 bg-white/5 text-lg font-semibold text-foreground transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#13131A] sm:min-w-40"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
