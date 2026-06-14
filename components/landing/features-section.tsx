'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BrainCircuit, FileBadge2, Link2, Smartphone, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'

const ICON_MAP: Record<string, LucideIcon> = { BrainCircuit, FileBadge2, Link2, Smartphone }

const SLIDE_VARIANTS = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
}

const AUTO_ADVANCE_MS = 4000
const DRAG_THRESHOLD = 50

export function FeaturesSection({ features }: { features: Array<{ icon: string; title: string; description: string; benefit: string }> }) {
  const reduce = useReducedMotion()
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  const pausedRef = useRef(false)
  const total = features.length

  const go = useCallback((next: number) => {
    setDirection(next > current ? 1 : -1)
    setCurrent(next)
  }, [current])

  const goPrev = useCallback(() => go(current === 0 ? total - 1 : current - 1), [go, current, total])
  const goNext = useCallback(() => go(current === total - 1 ? 0 : current + 1), [go, current, total])

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => {
      if (!pausedRef.current) {
        setCurrent(c => (c === total - 1 ? 0 : c + 1))
        setDirection(1)
      }
    }, AUTO_ADVANCE_MS)
    return () => clearInterval(id)
  }, [reduce, total])

  const feature = features[current]

  return (
    <section className="relative border-b border-white/5 bg-transparent py-8 sm:py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">

        {/* Section header */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="mb-8 max-w-2xl text-center sm:mx-auto sm:mb-12 lg:mb-16"
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">Why teams switch</p>
          <h2 className="mt-2 text-[clamp(20px,5vw,48px)] font-semibold tracking-[-0.02em] sm:mt-3">
            Four pieces that shorten the gap between <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">site visit and signed work.</span>
          </h2>
          <p className="mt-2 text-sm leading-[1.5] text-muted-foreground sm:mt-4 sm:text-lg">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </motion.div>

        {/* Carousel */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="flex flex-col items-center gap-6"
          onMouseEnter={() => { pausedRef.current = true }}
          onMouseLeave={() => { pausedRef.current = false }}
        >
          {/* Slide viewport */}
          <div className="relative w-full max-w-xl mx-auto">
            {/* Prev arrow */}
            <button
              aria-label="Previous feature"
              onClick={goPrev}
              className="absolute left-0 top-1/2 z-10 -translate-x-[calc(100%+12px)] -translate-y-1/2 hidden sm:flex items-center justify-center size-9 rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>

            {/* Animated slide */}
            <div className="overflow-hidden rounded-2xl">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={current}
                  custom={direction}
                  variants={reduce ? undefined : SLIDE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  drag={reduce ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -DRAG_THRESHOLD) goNext()
                    else if (info.offset.x > DRAG_THRESHOLD) goPrev()
                  }}
                  className="cursor-grab active:cursor-grabbing select-none"
                >
                  <Card
                    variant="glass"
                    className="group relative overflow-hidden rounded-2xl p-6 sm:p-8 lg:p-10 backdrop-blur-none transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_60px_hsl(var(--primary)/0.22)]"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    <span className="mb-4 inline-flex size-11 items-center justify-center rounded-full gradient-brand text-white shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)] transition-transform duration-500 group-hover:scale-110 lg:mb-6 lg:size-12">
                      {(() => { const Icon = ICON_MAP[feature.icon] ?? BrainCircuit; return <Icon className="size-5 lg:size-6" aria-hidden="true" /> })()}
                    </span>
                    <h3 className="mb-2 text-xl font-semibold tracking-tight text-white sm:mb-3 sm:text-2xl lg:text-3xl">{feature.title}</h3>
                    <p className="mb-4 text-sm leading-relaxed text-muted-foreground sm:mb-6 sm:text-base lg:text-lg">{feature.description}</p>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-bold text-secondary shadow-[0_0_10px_hsl(var(--primary)/0.1)] transition-colors group-hover:bg-primary/20">
                      {feature.benefit}
                    </div>
                  </Card>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Next arrow */}
            <button
              aria-label="Next feature"
              onClick={goNext}
              className="absolute right-0 top-1/2 z-10 translate-x-[calc(100%+12px)] -translate-y-1/2 hidden sm:flex items-center justify-center size-9 rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          {/* Dot indicators + mobile arrows */}
          <div className="flex items-center gap-4">
            {/* Mobile prev */}
            <button
              aria-label="Previous feature"
              onClick={goPrev}
              className="sm:hidden flex items-center justify-center size-8 rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2" role="tablist" aria-label="Feature slides">
              {features.map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === current}
                  aria-label={`Go to feature ${i + 1}`}
                  onClick={() => go(i)}
                  className={[
                    'rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    i === current
                      ? 'w-5 h-2 bg-primary'
                      : 'w-2 h-2 bg-white/20 hover:bg-white/40',
                  ].join(' ')}
                />
              ))}
            </div>

            {/* Mobile next */}
            <button
              aria-label="Next feature"
              onClick={goNext}
              className="sm:hidden flex items-center justify-center size-8 rounded-full border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Progress counter */}
          <p className="text-xs text-muted-foreground/60 tabular-nums" aria-live="polite" aria-atomic>
            {current + 1} / {total}
          </p>
        </motion.div>

      </div>
    </section>
  )
}
