'use client'

import { motion, useReducedMotion } from 'framer-motion'

const STATS = [
  'Used by 500+ contractors',
  '12,000+ estimates sent',
  '4.9/5 average rating',
]

export function TrustBar() {
  const reduce = useReducedMotion()

  return (
    <div className="border-b border-white/5 bg-white/[0.02]">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-6 py-4 sm:flex-row sm:gap-10 sm:px-8 lg:px-10"
      >
        {STATS.map((stat) => (
          <div key={stat} className="flex items-center gap-2 text-xs font-medium text-muted-foreground/90">
            <span className="size-1.5 rounded-full bg-gradient-to-br from-primary to-secondary" />
            {stat}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
