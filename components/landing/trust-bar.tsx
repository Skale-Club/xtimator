'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import { Star } from 'lucide-react'

const COUNTERS = [
  { value: 500,   suffix: '+', label: 'Contractors' },
  { value: 12000, suffix: '+', label: 'Estimates sent' },
]

function Counter({ value, suffix, inView }: { value: number; suffix: string; inView: boolean }) {
  const isFloat = value % 1 !== 0
  const [display, setDisplay] = useState(isFloat ? '0.0' : '0')

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(0, value, {
      duration: 1.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(isFloat ? v.toFixed(1) : Math.round(v).toLocaleString()),
    })
    return ctrl.stop
  }, [inView, value, isFloat])

  return <>{display}{suffix}</>
}

export function TrustBar() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <div ref={ref} className="trust-bar border-b border-white/5 bg-white/[0.03]">
      <div className="mx-auto flex max-w-6xl flex-row items-center justify-around divide-x divide-white/10 px-4 py-3 sm:px-8 lg:px-10">
        {COUNTERS.map(({ value, suffix, label }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span className="text-[clamp(17px,3.5vw,28px)] font-bold leading-none tracking-tight text-foreground tabular-nums">
              <Counter value={value} suffix={suffix} inView={inView} />
            </span>
            <span className="text-[12px] sm:text-[11px] font-medium text-muted-foreground">{label}</span>
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-1 flex-col items-center gap-1"
        >
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="size-[clamp(12px,2.5vw,18px)] fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <span className="text-[12px] sm:text-[11px] font-medium text-muted-foreground">5 Stars</span>
        </motion.div>
      </div>
    </div>
  )
}
