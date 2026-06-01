'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, animate } from 'framer-motion'

const STATS = [
  { value: 500,  suffix: '+', label: 'Contractors' },
  { value: 12000, suffix: '+', label: 'Estimates sent' },
  { value: 4.9,  suffix: '/5', label: 'Average rating' },
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
    <div ref={ref} className="border-b border-white/5 bg-white/[0.03]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-around gap-8 px-6 py-8 sm:flex-row sm:gap-0 sm:divide-x sm:divide-white/10 sm:px-8 lg:px-10">
        {STATS.map(({ value, suffix, label }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="flex flex-col items-center gap-1.5 sm:flex-1"
          >
            <span className="text-[clamp(28px,3vw,36px)] font-bold leading-none tracking-tight text-foreground tabular-nums">
              <Counter value={value} suffix={suffix} inView={inView} />
            </span>
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
