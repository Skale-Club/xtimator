'use client'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

type HeroContent = {
  heroHeadline: string
  heroSubheadline: string
  ctaLabel: string
  /** Optional 1:1 hero image URL (foreground subject photo). When null, the hero renders as a single centered column. */
  heroImageUrl: string | null
  /** Admin-set zoom/drag position. Null/undefined = existing untouched behavior. */
  heroImagePosition?: { scale: number; x: number; y: number } | null
  /** Full-bleed backdrop behind the whole section — distinct from heroImageUrl. */
  heroBackgroundType?: 'none' | 'image' | 'video'
  heroBackgroundImageUrl?: string | null
  heroBackgroundPosition?: { scale: number; x: number; y: number } | null
  heroBackgroundVideoUrl?: string | null
}

export function HeroSection({ content, onOpenAuth }: { content: HeroContent; onOpenAuth?: (mode: 'login' | 'signup') => void }) {
  const hasImage = !!content.heroImageUrl
  const bgType = content.heroBackgroundType ?? 'none'

  // quick-260723: min-h-0/overflow-hidden (here and on the two inner flex
  // wrappers below) let a flex item shrink BELOW its content's natural size
  // — harmless for the old absolute-positioned desktop image (it's out of
  // normal flow, doesn't need extra height), but with the image now an
  // in-flow block below the text on phone/iPad, this was clipping it to
  // nothing. Scoped to lg: only, where the original layout/reasoning still applies unchanged.
  return (
    <section className="relative isolate flex flex-1 flex-col border-b border-white/5 bg-transparent min-h-[420px] lg:min-h-0 lg:overflow-hidden lg:max-h-[520px]">
      {/* quick-260723: a real background image/video replaces the abstract
          decorative mesh/dots/gradient — layering both would look wrong (an
          abstract dot pattern over a real photo). 'none' (the default —
          matches every existing row) keeps the original decoration exactly. */}
      {bgType === 'none' ? (
        <>
          <div aria-hidden className="hero-mesh" />
          <div aria-hidden className="hero-dots" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
        </>
      ) : bgType === 'image' && content.heroBackgroundImageUrl ? (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <Image
            src={content.heroBackgroundImageUrl}
            alt=""
            fill
            priority
            unoptimized
            sizes="100vw"
            className="object-cover"
            style={
              content.heroBackgroundPosition
                ? {
                    objectPosition: `${50 + content.heroBackgroundPosition.x}% ${50 + content.heroBackgroundPosition.y}%`,
                    transform: `scale(${content.heroBackgroundPosition.scale})`,
                  }
                : undefined
            }
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      ) : bgType === 'video' && content.heroBackgroundVideoUrl ? (
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={content.heroBackgroundVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            // playsInline is required for iOS Safari — without it, autoplay is
            // blocked entirely and the video would force fullscreen on tap.
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      {/* quick-260723: sm:px-8 removed — it INCREASED side padding right when the
          request was for MORE usable width on iPad; padding now stays flat (24px)
          across the whole stacked range and only grows at true desktop (lg:40px,
          unchanged), maximizing how much of the screen the full-width title/buttons
          actually get to use. */}
      <div className="relative mx-auto flex w-full flex-1 flex-col max-w-6xl px-6 sm:px-8 lg:px-10 lg:min-h-0">
        <div
          className={
            // quick-260723: below lg (phone + all iPad sizes/orientations — the
            // pointer:coarse override in globals.css forces this same stacking
            // even for real touch tablets ≥1024px wide, since lg: alone is a
            // pure width query and can't tell a resized desktop window from an
            // iPad Pro), the image moves from an absolute overlay to an in-flow
            // block below the text, so the section grows to fit both (no more
            // max-height cap below lg) instead of squeezing them side by side.
            hasImage
              ? 'hero-content flex flex-1 flex-col items-center gap-10 pt-16 lg:min-h-0 lg:flex-row lg:items-center lg:gap-6 lg:pt-0'
              : 'flex flex-col items-center justify-center gap-6 py-16 text-center'
          }
        >
          {/* Left: headline + CTAs */}
          <div
            className={
              // quick-260723: full width below lg (stacked layout); lg: restores the
              // exact previous left-aligned 55%-width column.
              // quick-260724-t2r-a: phone (<640) stays centered; tablet/iPad (sm+) is
              // LEFT-aligned so the full-width title/subheadline/badge actually span
              // from the left edge instead of clustering centered in the middle
              // ("grouped in the center") — matches the desktop left-aligned look. The
              // real-tablet pointer:coarse blocks don't force text-align/align-items on
              // .hero-left, so they inherit this automatically.
              hasImage
                ? 'hero-left relative z-10 flex min-w-0 w-full flex-col items-center text-center justify-center space-y-4 sm:items-start sm:text-left lg:w-[55%] lg:shrink-0 lg:items-start lg:text-left'
                : 'max-w-3xl space-y-4'
            }
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            {/* quick-260724-t2r-a: badge left-aligns on tablet+ (sm), matching the
                hero-left text; phone stays centered. */}
            <div className={hasImage ? 'flex justify-center sm:justify-start' : 'flex justify-center'}>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-secondary backdrop-blur-sm">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Built for contractors
              </div>
            </div>

            {/* quick-260723: mobile+tablet (base+sm) scaled ~20% bigger than the
                earlier fix per explicit request; lg restores the EXACT original
                desktop "role model" formula (clamp(42,4.5vw,56)) since sm's new
                ceiling (67) now exceeds it — a size step-down crossing 640->1024
                is the direct, expected consequence of "tablet bigger, desktop
                unchanged," not a regression of the earlier dip-fix (that fix was
                about SAME-tier segments disagreeing at a shared boundary; this is
                a deliberate tier change). max-w-2xl removed — full-width so the
                bigger text still wraps in fewer rows. */}
            <h1 className="hero-h1 w-full text-[clamp(35px,9.24vw,67px)] sm:text-[clamp(59px,5.22vw,67px)] font-semibold leading-[1.05] tracking-[-0.03em] lg:w-[696px] lg:text-[clamp(50px,5.4vw,67px)]">
              {/* quick-260724-t2r-b: below lg the title has NO forced break — it wraps
                  naturally (greedy: fills row 1, drops to row 2 only once row 1 is truly
                  full), so words are no longer stranded at a fixed break spot with a
                  half-empty first row on wider screens. Desktop keeps its deliberate
                  "Professional estimates" / "in seconds." split via the lg-only break +
                  lg:whitespace-nowrap span (byte-identical to before). */}
              <span className="lg:whitespace-nowrap">
                {content.heroHeadline.split(' ')[0]}
                {' '}{content.heroHeadline.split(' ')[1]}
              </span>
              <br className="hidden lg:block" />
              {' '}{content.heroHeadline.split(' ').slice(2).join(' ')}
            </h1>

            <p
              className={
                hasImage
                  // quick-260723: mobile+tablet scaled ~20% bigger (16.8->20, clamp
                  // floor/ceiling *1.2); lg pinned back to the exact original 18px
                  // desktop value now that sm's ceiling (22) exceeds it.
                  // quick-260723 FIX (same bug class as the CTA row): this <p> is a
                  // flex item of .hero-left (items-center) with no explicit width, so
                  // it was shrink-wrapping to its widest manually-<br>-broken segment
                  // instead of spanning the real column width — added w-full so it's
                  // genuinely centered within the same box as the h1/buttons, not an
                  // independently-sized box based on line-break content.
                  // quick-260724-t2r: sm:max-w-2xl → lg:max-w-2xl so the paragraph box
                  // is genuinely full-width across phone + tablet (was capped at 672px
                  // from 640px up); the readability cap is kept only at desktop.
                  ? 'w-full lg:max-w-2xl text-[20px] leading-[1.5] text-muted-foreground sm:text-[clamp(20px,2.4vw,22px)] lg:text-[22px]'
                  : 'mx-auto max-w-2xl text-[16.8px] leading-[1.5] text-muted-foreground sm:text-base'
              }
            >
              {(() => {
                const text = content.heroSubheadline
                const b1 = text.indexOf('pricing,')
                const b2 = text.indexOf('you leave')
                if (b1 === -1 || b2 === -1) return text
                // Desktop (≥1024px) collapses to 2 rows split before "and branded";
                // when that anchor is missing, lg falls back to natural wrap.
                // Quick-260718-h9x: gates moved xl→lg (see h1 comment above).
                const bd = text.indexOf('and branded')
                const mid = bd > b1 && bd < b2 ? bd : b2
                // quick-260724-t2r-b: forced mobile/tablet breaks removed — below lg the
                // subheadline wraps naturally (fills each line before wrapping) instead
                // of breaking at fixed word spots. Only the deliberate desktop 2-row
                // split remains (lg-only).
                return <>
                  {text.slice(0, b1)}
                  {text.slice(b1, mid)}
                  {mid < b2 && <br className="hidden lg:block" />}
                  {text.slice(mid, b2)}
                  {text.slice(b2)}
                </>
              })()}
            </p>

            <div
              className={
                // quick-260723: gap-2->lg:gap-3 was a flat 8px until a sudden jump to
                // 12px at 1024 — one clamp grows smoothly across the whole ≥0 range
                // (its own floor already equals gap-2's 8px below ~684px, so mobile
                // is unaffected) and reaches 12px by 1024, matching lg:gap-3 exactly.
                // quick-260723: items-center added to the no-image path too — the
                // outer wrapper already centers this row as a block, but without
                // items-center here the buttons themselves weren't centered within it.
                // quick-260723 FIX (found via hand-calculation, not just class
                // inspection): this row is the buttons' DIRECT parent, and its own
                // parent (.hero-left) sets items-center — meaning without an
                // explicit width THIS row shrink-wraps to its content instead of
                // stretching, so the buttons' width:100% was resolving against an
                // already-content-sized box, not the real 342px-at-390px-viewport
                // column. w-full here is what actually makes "full width" real.
                hasImage
                  ? 'flex w-full flex-col items-center gap-[clamp(8px,1.17vw,12px)] lg:w-auto lg:flex-row lg:items-center'
                  : 'flex flex-col items-center gap-[clamp(8px,1.17vw,12px)] lg:flex-row lg:justify-center'
              }
            >
              {/* quick-260723: was max-lg:self-start (left-aligned) — removed so this
                  inherits the row's centered alignment below lg; lg:self-auto unchanged.
                  w-full lg:w-auto: full-width across the WHOLE stacked range (phone
                  AND iPad, not just <640) — only true desktop reverts to compact width. */}
              <div className="cta-glow w-full lg:w-auto max-sm:[box-shadow:none] max-sm:[animation:none] lg:self-auto lg:flex-none">
                {/* quick-260723: mobile+tablet scaled ~20% bigger (each clamp *1.2)
                    per explicit request; each property gets an explicit lg: pin back
                    to its exact original desktop "role model" value now that the
                    unprefixed formula's new ceiling exceeds it (min-w-184, h-46,
                    px-18, text-base/16px, icon size-18 — same values the previous
                    dip-fix pass reached by 1024px, restored here as fixed pins). */}
                <Button variant="primary" size="default" className="w-full lg:w-auto min-w-[clamp(192px,21.6vw,221px)] lg:min-w-[221px] h-[clamp(48px,5.4vw,55px)] lg:h-[55px] px-[clamp(14px,2.11vw,22px)] lg:px-[22px] text-[clamp(17px,1.87vw,19px)] lg:text-[19px]" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-1.5 size-[clamp(19px,2.11vw,22px)] lg:size-[22px]" aria-hidden="true" />
                </Button>
              </div>
              <Button
                asChild
                size="default"
                variant="outline"
                // quick-260723: px-6(mobile,24px)->sm:px-4(16px)->lg:px-[18px] DROPPED
                // below the eventual 18px target then climbed back — sm:px-5(20px) is
                // a gentle monotonic step down (24->20->18) instead of a dip. height/
                // font/min-width all GROW toward their lg values (unlike padding here)
                // so those use the same continuous-clamp treatment as the primary button.
                // self-start (was unconditional) removed so this inherits the row's
                // centered alignment below lg, matching the primary button's fix above.
                // quick-260723 FIX: this was still w-full sm:w-fit (reverting to
                // fit-content at 640px) while the primary button next to it was
                // already extended to w-full lg:w-auto — both buttons in the same
                // row need the SAME width behavior or they'd visibly mismatch
                // (primary full-width, secondary shrunk) across the whole tablet
                // range. Now w-full lg:w-fit, matching the primary button exactly.
                // quick-260723: mobile+tablet scaled ~20% bigger — padding keeps its
                // monotonic-decrease shape (29px mobile -> 24px tablet -> 18px desktop,
                // each *1.2 of 24/20/18) rather than a clamp, matching the earlier
                // dip-fix's approach for this one property; height/font get the same
                // *1.2-with-lg-pin treatment as the primary button.
                className="w-full lg:w-fit px-[29px] sm:px-[24px] sm:flex-none lg:self-start border-white/10 bg-white/5 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-[clamp(173px,19.44vw,199px)] lg:min-w-[199px] h-[clamp(48px,5.4vw,55px)] lg:h-[55px] text-[clamp(17px,1.87vw,19px)] lg:text-[19px] lg:px-[22px]"
              >
                <Link href="/demo">See Demo</Link>
              </Button>
            </div>
          </div>

          {/* Right (lg+) / below (< lg, phone + all iPad sizes): image */}
          {/* Quick-260718-h9x: lg right offset is +12px INSIDE the container (was -2.5rem
              overhang) — at full-bleed lg widths the container edge IS the viewport edge,
              so the old negative offset cropped the image flush against the screen.
              quick-260723: below lg this is now a plain in-flow block (aspect-ratio box,
              no absolute positioning) so it sits below the text with room to be its full
              natural size — the pointer:coarse override in globals.css re-applies these same
              "static, full-width, aspect-ratio" rules for real touch tablets ≥1024px wide,
              since lg: alone can't distinguish those from a resized desktop window. */}
          {/* quick-260723 BUGFIX: the original had bottom-0 persisting all the way
              to lg+ (set once, never overridden) — without an explicit bottom value,
              this absolute box (top set, height:auto) had no way to resolve its own
              height (which itself depends on its h-full child), collapsing to zero
              and making the desktop image disappear entirely. Restored as lg:bottom-0. */}
          {hasImage && (
            <div className="hero-image relative w-full aspect-[4/3] z-0 lg:absolute lg:aspect-auto lg:h-auto lg:w-auto lg:top-[36px] lg:bottom-0 lg:left-[calc(35%_+_55px)] lg:right-3 lg:scale-90 lg:origin-bottom lg:translate-x-[10px] xl:top-[65px] xl:left-[calc(35%_+_45px)] xl:right-[-30px]">
              {/* Admin zoom wraps in its own layer (transform) so it multiplies with —
                  rather than overrides — the Tailwind min-[1280px]:scale-110 class below.
                  No-op (plain div, no style) when heroImagePosition is unset. */}
              <div
                className="relative h-full w-full"
                style={
                  content.heroImagePosition && content.heroImagePosition.scale !== 1
                    ? { transform: `scale(${content.heroImagePosition.scale})`, transformOrigin: 'center bottom' }
                    : undefined
                }
              >
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
                  sizes="(max-width: 1023px) 90vw, (max-width: 1279px) 52vw, 640px"
                  // quick-260723: min-[1280px] is width-only (no pointer awareness), same
                  // as before — the new pointer:coarse override in globals.css resets this
                  // scale back to none for real touch tablets ≥1024px wide via !important.
                  className="object-contain object-center lg:origin-bottom lg:object-bottom min-[1280px]:scale-110"
                  style={
                    content.heroImagePosition
                      ? { objectPosition: `${50 + content.heroImagePosition.x}% ${100 + content.heroImagePosition.y}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
