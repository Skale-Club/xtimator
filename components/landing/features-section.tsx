'use client'

import Image from 'next/image'
import { BrainCircuit, FileBadge2, Link2, Smartphone, type LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Ticker } from '@/components/landing/ticker'

const ICON_MAP: Record<string, LucideIcon> = { BrainCircuit, FileBadge2, Link2, Smartphone }

type ImagePosition = { scale: number; x: number; y: number }
type Feature = { icon: string; title: string; description: string; benefit: string; imageUrl?: string | null; imagePosition?: ImagePosition | null }

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = ICON_MAP[feature.icon] ?? BrainCircuit
  return (
    <Card
      variant="glass"
      className="group relative h-full overflow-hidden rounded-2xl p-5 backdrop-blur-none transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_60px_hsl(var(--primary)/0.22)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {/* Full-bleed 3:1 landscape header — always reserved; shows image when set, subtle placeholder otherwise */}
      <div className="relative aspect-[3/1] -mx-5 -mt-5 mb-4 w-[calc(100%+2.5rem)] overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        {feature.imageUrl && (
          // Admin zoom wraps in its own layer so it multiplies with — rather than
          // overrides — the hover scale-105 on the Image itself. No-op when unset.
          <div
            className="h-full w-full"
            style={
              feature.imagePosition && feature.imagePosition.scale !== 1
                ? { transform: `scale(${feature.imagePosition.scale})`, transformOrigin: 'center center' }
                : undefined
            }
          >
            <Image
              src={feature.imageUrl}
              alt=""
              fill
              // Skip /_next/image — the self-hosted optimizer intermittently fails
              // (no sharp), which made these feature images vanish.
              unoptimized
              sizes="(max-width: 719px) 80vw, (max-width: 1023px) 45vw, 360px"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={
                feature.imagePosition
                  ? { objectPosition: `${50 + feature.imagePosition.x}% ${50 + feature.imagePosition.y}%` }
                  : undefined
              }
            />
          </div>
        )}
      </div>
      {/* Icon badge — floats over the top-right corner of the image */}
      <span className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-full gradient-brand [filter:saturate(.5)] text-white shadow-[0_4px_14px_rgba(0,0,0,0.45),inset_0_0_20px_hsl(var(--primary)/0.1)] transition-transform duration-500 group-hover:scale-110">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mb-2 text-base font-semibold tracking-tight text-white">{feature.title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
      <div className="mt-auto flex w-fit mx-auto items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-secondary shadow-[0_0_10px_hsl(var(--primary)/0.1)] transition-colors group-hover:bg-primary/20">
        {feature.benefit}
      </div>
    </Card>
  )
}

export function FeaturesSection({ features }: { features: Feature[] }) {
  const reduce = useReducedMotion()
  // Duplicate cards for a seamless loop. The track uses inline-flex so its CSS
  // computed width = sum of all slots. Translating -50% moves exactly one set
  // of cards, landing perfectly at the start of the duplicate → no jump.
  const ticker = [...features, ...features]

  return (
    <section id="features" className="relative flex flex-1 flex-col lg:justify-center border-b border-white/5 bg-transparent py-16">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-10">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="mb-16 max-w-2xl lg:max-w-3xl text-center sm:mx-auto"
        >
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary sm:text-sm">Why teams switch</p>
          <h2 className="mt-2 text-[clamp(24px,4vw,44px)] lg:text-[clamp(24px,3.8vw,42px)] font-semibold tracking-[-0.02em] sm:mt-3">
            Four pieces that shorten the gap
            <br />
            between{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              site visit and signed work.
            </span>
          </h2>
          <p className="mt-2 text-sm leading-[1.5] text-muted-foreground sm:mt-4 sm:text-base">
            Keep the quoting flow simple, fast, and consistent without giving up professionalism.
          </p>
        </motion.div>

        {/* Desktop (≥1024px): static 4-col grid with stagger */}
        <div className="hidden lg:grid grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
              className="h-full"
            >
              <FeatureCard feature={f} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Phone + iPad (<1024px): ticker, or static grid for reduced-motion */}
      <div className="lg:hidden">
        {reduce ? (
          <div className="mx-auto max-w-2xl px-6 sm:px-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {features.map((f, i) => <FeatureCard key={i} feature={f} />)}
            </div>
          </div>
        ) : (
          /* Ticker — halfWidth = N slots × (288 + 16)px, N = features.length (was hardcoded for 4) */
          <Ticker halfWidth={features.length * 304}>
            {ticker.map((f, i) => (
              <div key={i} className="w-72 shrink-0 px-2 py-1">
                <FeatureCard feature={f} />
              </div>
            ))}
          </Ticker>
        )}
      </div>
    </section>
  )
}
