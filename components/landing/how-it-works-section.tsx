'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Ticker } from '@/components/landing/ticker'

type Step = { eyebrow: string; title: string; description: string; imageUrl?: string | null }

// 52 bars × 7px (3.5 bar + 3.5 gap) + 2×18px padding = 400px viewBox
const WAVEFORM_BARS = (() => {
  const count = 52
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1)
    // Bell-curve envelope so bars taper at the edges
    const env = Math.sin(Math.PI * t)
    // Multi-frequency variation simulates real audio content
    const detail = 0.52
      + 0.28 * Math.sin(t * 13 + 0.2)
      + 0.13 * Math.sin(t * 29 + 1.5)
      + 0.07 * Math.sin(t * 47 + 2.8)
    const h = Math.max(0.06, env * Math.abs(detail))
    // Stagger animation speed + phase so bars pulse independently
    const dur = (0.65 + 0.7 * Math.abs(Math.sin(i * 1.9 + 0.3))).toFixed(2)
    const delay = (-Math.abs(Math.sin(i * 0.7 + 1.2)) * 1.4).toFixed(2)
    return { h, dur, delay }
  })
})()

function SoundWaveBackground() {
  const reduce = useReducedMotion()
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
      <svg viewBox="0 0 400 150" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {WAVEFORM_BARS.map(({ h, dur, delay }, i) => {
          const x = 18 + i * 7
          // Round to 3dp so server and client floating-point serialization matches
          const halfH = Math.round(h * 62 * 1000) / 1000
          return (
            <rect
              key={i}
              x={x}
              y={75 - halfH}
              width={3.5}
              height={halfH * 2}
              rx={1.75}
              fill="hsl(var(--primary))"
              fillOpacity={Math.round(Math.min(0.85, 0.22 + h * 0.7) * 10000) / 10000}
              style={reduce ? undefined : {
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: `bar-pulse ${dur}s ease-in-out infinite ${delay}s`,
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}

function PhotoIcon() {
  return (
    <>
      <rect x="0" y="0" width="70" height="56" rx="6" />
      <circle cx="54" cy="13" r="6.5" />
      <polyline points="0,38 20,20 32,30 45,20 70,38" />
    </>
  )
}

function PhotosBackground() {
  const reduce = useReducedMotion()
  // Four groups manage z-order swap via opacity:
  // SVG paint order (back→front): A-back, B-back, A-front, B-front
  // ph-show = opacity 1 during phase 1 | ph-hide = opacity 1 during phase 2
  // Phase 1: A-back(ph-show) visible behind A-front(ph-show) → A at front, B at back
  // Phase 2: B-back(ph-hide) visible behind B-front(ph-hide) → B at front, A at back
  const backTx = 'translate(5,8) rotate(-13,35,28)'
  const frontTx = 'translate(50,22)'
  const dur = '5s'
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
      <svg
        viewBox="0 0 130 95"
        className="w-[65%] opacity-[0.13]"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g transform={backTx}  style={reduce ? undefined : { animation: `ph-show ${dur} ease-in-out infinite` }}><PhotoIcon /></g>
        <g transform={backTx}  style={reduce ? undefined : { animation: `ph-hide ${dur} ease-in-out infinite` }}><PhotoIcon /></g>
        <g transform={frontTx} style={reduce ? undefined : { animation: `ph-show ${dur} ease-in-out infinite` }}><PhotoIcon /></g>
        <g transform={frontTx} style={reduce ? undefined : { animation: `ph-hide ${dur} ease-in-out infinite` }}><PhotoIcon /></g>
      </svg>
    </div>
  )
}

function TextCursorBackground() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
      <svg
        viewBox="0 0 120 80"
        className="w-[60%] opacity-[0.13]"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Text input field */}
        <rect x="4" y="26" width="88" height="28" rx="5" />
        {/* I-beam: top serif */}
        <line x1="100" y1="10" x2="116" y2="10" />
        {/* I-beam: vertical stem */}
        <line x1="108" y1="10" x2="108" y2="70" />
        {/* I-beam: bottom serif */}
        <line x1="100" y1="70" x2="116" y2="70" />
      </svg>
    </div>
  )
}

function StepCard({
  step, fill = false, imageScale = 1, imageOffsetY = 0, showWave = false, showPhotos = false, showCursor = false,
}: {
  step: Step; fill?: boolean; imageScale?: number; imageOffsetY?: number; showWave?: boolean; showPhotos?: boolean; showCursor?: boolean
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
      {/* Image slot — overflow-hidden clips the transform so it never bleeds into text */}
      <div className="relative h-52 w-full flex-shrink-0 overflow-hidden bg-[var(--glass-bg)] px-4 pt-4">
        {showWave && <SoundWaveBackground />}
        {showPhotos && <PhotosBackground />}
        {showCursor && <TextCursorBackground />}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            draggable={false}
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
      {/* Text content — flush to card edges, border on outer card handles the outline */}
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
    <section className="relative flex flex-1 flex-col min-[720px]:justify-center border-b border-white/5 bg-transparent py-8 sm:py-16 lg:py-24">
      {/* Section header — always inside the padded container */}
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-8 max-w-2xl text-center sm:mx-auto sm:mb-16 lg:mb-24">
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
              <StepCard step={step} fill imageScale={i === 1 ? 1.15 : 1} imageOffsetY={i === 1 ? -10 : 0} showWave={i === 0} showCursor={i === 1} showPhotos={i === 2} />
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
                <StepCard step={step} fill imageScale={(i % steps.length) === 1 ? 1.15 : 1} imageOffsetY={(i % steps.length) === 1 ? -10 : 0} showWave={(i % steps.length) === 0} showCursor={(i % steps.length) === 1} showPhotos={(i % steps.length) === 2} />
              </div>
            ))}
          </Ticker>
        )}
      </div>
    </section>
  )
}
