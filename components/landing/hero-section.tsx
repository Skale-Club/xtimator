'use client'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

type HeroContent = {
  heroHeadline: string
  heroSubheadline: string
  ctaLabel: string
  /** Optional 1:1 hero image URL. When null, the hero renders as a single centered column. */
  heroImageUrl: string | null
}

export function HeroSection({ content, onOpenAuth }: { content: HeroContent; onOpenAuth?: (mode: 'login' | 'signup') => void }) {
  const hasImage = !!content.heroImageUrl

  return (
    <section className="relative isolate flex flex-1 min-h-0 flex-col overflow-hidden border-b border-white/5 bg-transparent min-h-[420px] sm:min-h-0 sm:max-h-[520px] md:max-h-[620px] lg:max-h-[520px]">
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      <div className="relative mx-auto flex w-full flex-1 min-h-0 flex-col max-w-6xl px-6 sm:px-8 lg:px-10">
        <div
          className={
            hasImage
              ? 'hero-content flex flex-1 min-h-0 flex-col gap-2 pt-16 sm:flex-row sm:items-center sm:gap-6 sm:pt-0'
              : 'flex flex-col items-center justify-center gap-6 py-16 text-center'
          }
        >
          {/* Left: headline + CTAs */}
          <div
            className={
              hasImage
                ? 'hero-left relative z-10 flex min-w-0 flex-col justify-center space-y-4 sm:w-[55%] sm:shrink-0 md:w-[58%] lg:w-[55%]'
                : 'max-w-3xl space-y-4'
            }
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <div className={hasImage ? 'flex justify-start' : 'flex justify-center'}>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-secondary backdrop-blur-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Built for contractors
              </div>
            </div>

            <h1 className="hero-h1 text-[clamp(29px,7.7vw,56px)] sm:text-[clamp(35px,5.5vw,42px)] md:text-[clamp(32px,4.5vw,46px)] lg:text-[clamp(42px,4.5vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em] lg:w-[580px]">
              {/* Break after word 1 below xl; ≥1280px words 1-2 share the top row → 2-line title
                  (nowrap because at 56px the pair sits right at the 580px box limit) */}
              <span className="xl:whitespace-nowrap">
                {content.heroHeadline.split(' ')[0]}
                <br className="xl:hidden" />
                {' '}{content.heroHeadline.split(' ')[1]}
              </span>
              <br className="hidden sm:block" />
              {' '}{content.heroHeadline.split(' ').slice(2).join(' ')}
            </h1>

            <p
              className={
                hasImage
                  // xl 18px pairs with the 2-row desktop subheadline — the iPad media
                  // queries (640-1279px) still tune tablets separately.
                  ? 'sm:max-w-2xl text-[16.8px] leading-[1.5] text-muted-foreground sm:text-[14px] lg:text-base xl:text-[18px]'
                  : 'mx-auto max-w-2xl text-[16.8px] leading-[1.5] text-muted-foreground sm:text-base'
              }
            >
              {(() => {
                const text = content.heroSubheadline
                const b1 = text.indexOf('pricing,')
                const b2 = text.indexOf('you leave')
                if (b1 === -1 || b2 === -1) return text
                // Desktop (≥1280px) collapses to 2 rows split before "and branded";
                // when that anchor is missing, xl falls back to natural wrap.
                const bd = text.indexOf('and branded')
                const mid = bd > b1 && bd < b2 ? bd : b2
                return <>
                  {text.slice(0, b1)}
                  {/* 3-line break shown 768-1279 (tablet); 640-767 stays natural-wrap */}
                  <br className="block sm:hidden md:block xl:hidden" />
                  {text.slice(b1, mid)}
                  {mid < b2 && <br className="hidden xl:block" />}
                  {text.slice(mid, b2)}
                  <br className="block sm:hidden md:block xl:hidden" />
                  {text.slice(b2)}
                </>
              })()}
            </p>

            <div
              className={
                hasImage
                  ? 'flex flex-col gap-2 min-[1280px]:flex-row min-[1280px]:gap-3'
                  : 'flex flex-col gap-2 min-[1280px]:flex-row min-[1280px]:gap-3 min-[1280px]:justify-center'
              }
            >
              <div className="cta-glow max-sm:[box-shadow:none] max-sm:[animation:none] max-[1279px]:self-start min-[1280px]:self-auto min-[1280px]:flex-none">
                {/* xl: bumps both CTAs 15% over size=default (40px/14px) for desktop */}
                <Button variant="primary" size="default" className="min-w-40 xl:h-[46px] xl:min-w-[184px] xl:px-[18px] xl:text-base" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-1.5 size-4 xl:size-[18px]" aria-hidden="true" />
                </Button>
              </div>
              <Button
                asChild
                size="default"
                variant="outline"
                className="w-fit px-6 self-start sm:flex-none border-white/10 bg-white/5 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-fit sm:min-w-36 h-10 text-sm sm:px-4 xl:h-[46px] xl:min-w-[166px] xl:px-[18px] xl:text-base"
              >
                <Link href="/demo">See Demo</Link>
              </Button>
            </div>
          </div>

          {/* Right: image */}
          {hasImage && (
            <div className="hero-image absolute top-[23%] bottom-0 right-[-15px] w-[75%] z-0 sm:h-auto sm:absolute sm:top-[1in] sm:bottom-0 sm:left-[calc(58%_-_100px)] sm:right-[-2rem] sm:w-auto sm:scale-110 sm:origin-bottom md:top-16 lg:top-[36px] lg:left-[calc(35%_+_55px)] lg:right-[-2.5rem] lg:scale-100 xl:top-[65px] xl:left-[calc(35%_+_45px)] xl:right-[-30px]">
              <Image
                src={content.heroImageUrl!}
                alt=""
                fill
                priority
                // Served as-is from Supabase public storage. The /_next/image
                // optimizer is skipped on purpose: on the self-hosted standalone
                // container it intermittently fails (no sharp binary), which made
                // the hero/step images vanish.
                unoptimized
                sizes="(max-width: 639px) 75vw, (max-width: 1279px) 52vw, 640px"
                className="origin-bottom object-contain object-bottom min-[1280px]:scale-110"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
