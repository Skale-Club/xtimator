'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Ticker } from '@/components/landing/ticker'

type ImagePosition = { scale: number; x: number; y: number }
type Step = { eyebrow: string; title: string; description: string; imageUrl?: string | null; imagePosition?: ImagePosition | null }

// Card 2 ("Write it down") has always rendered slightly zoomed/shifted up —
// a hand-tuned default from the original design, kept as the fallback for
// any step without an explicit admin-set position.
function defaultStepPosition(index: number): ImagePosition {
  return index === 1 ? { scale: 1.15, x: 0, y: -10 } : { scale: 1, x: 0, y: 0 }
}

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

// Vignette over the halo/animation layer only — sits below the z-10 photo
// (no z-index of its own, same convention as the other background layers
// above, so the foreground image always paints on top and stays unaffected).
function BackgroundShadowOverlay() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{ boxShadow: 'inset 0 0 46px 14px rgba(0,0,0,0.55)' }}
    />
  )
}

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

function CameraBackground() {
  const reduce = useReducedMotion()
  const dur = '2.5s'

  return (
    <>
      {/*
       * Single animated parent drives BOTH the glow and the flash unit.
       * CSS opacity cascades to all children → perfect sync, zero drift.
       */}
      {!reduce && (
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{ animation: `cam-flash-unit ${dur} ease-out infinite` }}
        >
          {/* Glow */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 20% 20%, hsl(var(--primary)) 0%, transparent 60%)',
              opacity: 0.65,
            }}
          />
          {/* Flash unit — inside small left bump */}
          <div className="absolute top-[10px] right-[20px] bottom-[30px] left-[20px] flex items-center justify-center">
            <svg viewBox="0 0 260 190" className="w-full h-full" fill="none" preserveAspectRatio="xMidYMid meet">
              <rect x="18" y="38" width="22" height="10" rx="2" fill="hsl(var(--primary))" />
            </svg>
          </div>
        </div>
      )}
      {/* Camera outline — always visible */}
      <div className="absolute top-[10px] right-[20px] bottom-[30px] left-[20px] flex items-center justify-center pointer-events-none" aria-hidden>
        <svg
          viewBox="0 0 260 190"
          className="w-full h-full"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          preserveAspectRatio="xMidYMid meet"
        >
          <g stroke="hsl(var(--primary))" opacity="0.4" strokeWidth="4">
            {/*
             * Two-bump silhouette: small flash bump flush-left (x=5-55, y=36-50),
             * large viewfinder bump centered (x=75-185, y=22-50), body below.
             * Single continuous path — no overlapping strokes.
             */}
            <path d="M 13 36 H 47 A 8 8 0 0 1 55 44 V 50 H 75 V 34 A 12 12 0 0 1 87 22 H 173 A 12 12 0 0 1 185 34 V 50 H 237 A 18 18 0 0 1 255 68 V 165 A 18 18 0 0 1 237 183 H 23 A 18 18 0 0 1 5 165 V 44 A 8 8 0 0 1 13 36 Z" />
            {/* Horizontal stripes — just outside lens vertical extent */}
            <line x1="5" y1="63" x2="255" y2="63" />
            <line x1="5" y1="170" x2="255" y2="170" />
            {/* Lens rings — centered on camera body: (5+255)/2 = 130 */}
            <circle cx="130" cy="117" r="50" />
            <circle cx="130" cy="117" r="37" />
          </g>
          {/* Lens inner — filled glass element */}
          <circle cx="130" cy="117" r="22" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.4" />
        </svg>
      </div>
    </>
  )
}

function SpeechBubbleBackground() {
  const reduce = useReducedMotion()
  const dur = '3.6s'
  return (
    <div className="absolute top-[25px] right-[20px] bottom-[15px] left-[20px] flex items-center justify-center pointer-events-none" aria-hidden>
      <svg
        viewBox="0 0 260 190"
        className="w-full h-full"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Speech bubble outline — rounded rect body + bottom-left tail */}
        <path
          d="M 34 12 H 226 A 24 24 0 0 1 250 36 V 132 A 24 24 0 0 1 226 156 H 62 L 26 178 L 50 156 H 34 A 24 24 0 0 1 10 132 V 36 A 24 24 0 0 1 34 12 Z"
          stroke="hsl(var(--primary))"
          strokeWidth="4"
          strokeLinejoin="round"
          opacity="0.4"
        />
        {/* Six typing dots — appear 1→2→3→4→5→6, all disappear together, repeat */}
        {([45, 79, 113, 147, 181, 215] as const).map((cx, i) => (
          <circle
            key={i}
            cx={cx} cy="84" r="11.7"
            fill="hsl(var(--primary))"
            style={reduce ? { opacity: 0.25 } : {
              animation: `bubble-dot-${i + 1} ${dur} ease-in-out infinite`,
              transformBox: 'fill-box',
              transformOrigin: 'center',
            }}
          />
        ))}
      </svg>
    </div>
  )
}

function StepCard({
  step, fill = false, imageScale = 1, imageOffsetX = 0, imageOffsetY = 0, showWave = false, showPhotos = false, showCursor = false,
}: {
  step: Step; fill?: boolean; imageScale?: number; imageOffsetX?: number; imageOffsetY?: number; showWave?: boolean; showPhotos?: boolean; showCursor?: boolean
}) {
  const { title, description, imageUrl } = step
  const hasTransform = imageScale !== 1 || imageOffsetX !== 0 || imageOffsetY !== 0
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
      {/* Image slot — halo glow always renders; the animated background (when
          enabled) layers on top of the halo but still behind the z-10 image. */}
      <div className="relative h-44 w-full flex-shrink-0 overflow-hidden bg-[var(--glass-bg)] px-4 pt-4">
        <HaloBackground />
        {showWave && <SoundWaveBackground />}
        {showCursor && <SpeechBubbleBackground />}
        {showPhotos && <CameraBackground />}
        <BackgroundShadowOverlay />
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
              transform: `translate(${imageOffsetX}%, ${imageOffsetY}%) scale(${imageScale})`,
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
            <h3 className="mb-1.5 text-[1.17rem] font-semibold tracking-tight text-white sm:mb-2 sm:text-lg lg:text-[1.35rem]">
              {title}
            </h3>
            <p className="text-[1.04rem] leading-relaxed text-muted-foreground sm:text-sm lg:text-base">
              {description}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function HowItWorksSection({
  steps,
  animationsEnabled = true,
}: {
  steps: Step[]
  /** When false, cards show the halo glow only (admin toggle at /admin/landing). */
  animationsEnabled?: boolean
}) {
  const reduce = useReducedMotion()
  // Duplicate for seamless infinite loop
  const ticker = [...steps, ...steps]

  return (
    <section id="how-it-works" className="relative flex flex-1 flex-col border-b border-white/5 bg-transparent py-16 lg:py-10">
      {/* Section header — always inside the padded container */}
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <div className="mb-16 max-w-2xl text-center sm:mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">How it works</p>
          <h2 className="mt-2 text-[clamp(31px,4vw,44px)] sm:text-[clamp(24px,4vw,44px)] lg:text-[clamp(24px,3.8vw,42px)] font-semibold tracking-[-0.02em] sm:mt-3">
            Built around the way
            <br />
            estimates{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              happen in the field.
            </span>
          </h2>
          <p className="mt-2 text-[18px] leading-[1.5] text-muted-foreground sm:mt-4 sm:text-base">
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
              <StepCard
                step={step}
                fill
                imageScale={(step.imagePosition ?? defaultStepPosition(i)).scale}
                imageOffsetX={(step.imagePosition ?? defaultStepPosition(i)).x}
                imageOffsetY={(step.imagePosition ?? defaultStepPosition(i)).y}
                showWave={animationsEnabled && i === 0}
                showCursor={animationsEnabled && i === 1}
                showPhotos={animationsEnabled && i === 2}
              />
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
          /* Infinite ticker — halfWidth = N slots × (280+16)px, N = steps.length (was hardcoded for 3) */
          <Ticker halfWidth={steps.length * 296}>
            {ticker.map((step, i) => (
              <div key={i} className="w-[280px] shrink-0 px-2 py-1">
                <StepCard
                  step={step}
                  fill
                  imageScale={(step.imagePosition ?? defaultStepPosition(i % steps.length)).scale}
                  imageOffsetX={(step.imagePosition ?? defaultStepPosition(i % steps.length)).x}
                  imageOffsetY={(step.imagePosition ?? defaultStepPosition(i % steps.length)).y}
                  showWave={animationsEnabled && (i % steps.length) === 0}
                  showCursor={animationsEnabled && (i % steps.length) === 1}
                  showPhotos={animationsEnabled && (i % steps.length) === 2}
                />
              </div>
            ))}
          </Ticker>
        )}
      </div>
    </section>
  )
}
