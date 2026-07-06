'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Clock, Sparkles, MapPin } from 'lucide-react'

// Pre-launch audit fix: this bar previously showed animated counters
// ("50+ Contractors", "500+ Estimates sent") and a 5-star rating with no
// backing data — fabricated social proof. Replaced with true, verifiable
// statements about the product itself (design goal / feature / market
// focus) — none claim a user or review count.
const HIGHLIGHTS = [
  { icon: Clock, label: 'Under 5 min', sub: 'Job site to sent estimate' },
  { icon: Sparkles, label: 'AI-powered', sub: 'Audio + photos → estimate' },
  { icon: MapPin, label: 'US-based', sub: 'Built for service pros' },
]

export function TrustBar() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <div ref={ref} className="trust-bar border-b border-white/5 bg-white/[0.03]">
      <div className="mx-auto flex max-w-6xl flex-row items-center justify-around divide-x divide-white/10 px-4 py-5 sm:py-3 sm:px-8 lg:px-10">
        {HIGHLIGHTS.map(({ icon: Icon, label, sub }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span className="flex items-center gap-1.5 text-[clamp(18px,3vw,22px)] font-bold leading-none tracking-tight text-foreground">
              <Icon className="size-[clamp(16px,2.5vw,20px)] text-primary" aria-hidden="true" />
              {label}
            </span>
            <span className="text-[13px] sm:text-[11px] font-medium text-muted-foreground text-center">{sub}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
