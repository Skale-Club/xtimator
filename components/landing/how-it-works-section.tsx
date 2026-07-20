'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Ticker } from '@/components/landing/ticker'

type Step = { eyebrow: string; title: string; description: string; imageUrl?: string | null }

function HaloBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{
        background:
          'radial-gradient(ellipse 62% 55% at 50% 45%, hsl(var(--primary)/0.35) 0%, hsl(var(--primary)/0.12) 45%, transparent 75%)',
      }}
    />
  )
}

function StepCard({
  step, fill = false, imageScale = 1, imageOffsetY = 0,
}: {
  step: Step; fill?: boolean; imageScale?: number; imageOffsetY?: number
}) {
  const { title, description, imageUrl } = step
  const hasTransform = imageScale !== 1 || imageOffsetY !== 0
  return (
    <div
      className={[
        'group flex flex-col rounded-2xl overflow-hidden',
        'bg-white/10 border border-white/10',
        'transition-all duration-300 hover:bg-white/15 hover:-translate-y-1',
        'hover:border-primary/30 hover:shadow-[0_12px_40px_hsl(var(--primary)/0.15)]',
        fill ? 'h-full' : '',
      ].join(' ')}
    >
      {/* Image slot */}
      <div className="relative h-44 w-full flex-shrink-0 overflow-hidden bg-[var(--glass-bg)] px-4 pt-4">
        <HaloBackground />
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            draggable={false}
            fill
            // Skip /_next/image — the self-hosted optimizer intermittently fails
            // (no sharp), which made these step images vanish.
            unoptimized
            sizes="(max-width: 719px) 80vw, 280px"
            className="relative z-10 h-full w-full object-contain object-top"
            style={hasTransform ? {
              transform: `translateY(${imageOffsetY}%) scale(${imageScale})`,
              transformOrigin: 'top center',
            } : undefined}
          />
        ) : (
          <div className="relative z-10 flex h-full w-full items-center justify-center">
            <span className="text-xs text-white/20 uppercase tracking-widest">Image</span>
          </div>
        )}
      </div>
      {/* Text content */}
      <div className="flex flex-1 flex-col">
        <Card
          variant="glass"
          className="relative flex flex-1 w-full select-none flex-col rounded-none border-0 border-t border-[var(--glass-border)] backdrop-blur-none transition-colors duration-300 min-[720px]:text-center"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="flex flex-col p-4 sm:p-5 lg:p-7">
            <h3 className="mb-1.5 text-[0.9rem] font-semibold tracking-tight text-white sm:mb-2 sm:text-lg lg:text-[1.35rem]">
              {title}
            </h3>
            <p className="text-[0.8rem] leading-relaxed text-muted-foreground sm:text-sm lg:text-base">
              {description}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function HowItWorksSection({ steps }: { steps: Step[] }) {
  const reduce = useReducedMotion()
  // Duplicate for seamless infinite loop
  const ticker = [...steps, ...steps]

  return (
    <section id="how-it-works" className="relative flex flex-1 flex-col border-b border-white/5 bg-transparent py-6 sm:py-8 lg:py-10">
      {/* Section header — always inside the padded container */}
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">How it works</p>
          <h2 className="mt-2 text-[clamp(24px,4vw,44px)] lg:text-[clamp(24px,3.8vw,42px)] font-semibold tracking-[-0.02em] sm:mt-3">
            Built around the way
            <br />
            estimates{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              happen in the field.
            </span>
          </h2>
          <p className="mt-2 text-sm leading-[1.5] text-muted-foreground sm:mt-4 sm:text-base">
            No clipboard rewrite later. Capture the job once and
            <br />
            turn that visit into a professional quote package.
          </p>
        </div>

        {/* Tablet (≥720px) + desktop: 3-column grid with stagger animation */}
        <div className="hidden min-[720px]:grid min-[720px]:grid-cols-3 gap-6 lg:gap-10">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: i * 0.12, ease: 'easeOut' }}
              className="h-full"
            >
              <StepCard step={step} fill imageScale={i === 1 ? 1.15 : 1} imageOffsetY={i === 1 ? -10 : 0} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Phone (<720px): auto-scrolling ticker */}
      <div className="min-[720px]:hidden">
        {reduce ? (
          /* Reduced-motion: static horizontal scroll */
          <div className="overflow-x-auto px-6">
            <div className="flex gap-4 pb-2">
              {steps.map((step, i) => (
                <div key={i} className="w-[280px] shrink-0">
                  <StepCard step={step} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Infinite ticker — halfWidth = 3 slots × (280+16)px = 888px */
          <Ticker halfWidth={888}>
            {ticker.map((step, i) => (
              <div key={i} className="w-[280px] shrink-0 px-2 py-1">
                <StepCard step={step} fill imageScale={(i % steps.length) === 1 ? 1.15 : 1} imageOffsetY={(i % steps.length) === 1 ? -10 : 0} />
              </div>
            ))}
          </Ticker>
        )}
      </div>
    </section>
  )
}
