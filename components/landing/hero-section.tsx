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
  /** Admin-set zoom/drag position. Null/undefined = existing untouched behavior. */
  heroImagePosition?: { scale: number; x: number; y: number } | null
}

export function HeroSection({ content, onOpenAuth }: { content: HeroContent; onOpenAuth?: (mode: 'login' | 'signup') => void }) {
  const hasImage = !!content.heroImageUrl

  // quick-260723: min-h-0/overflow-hidden (here and on the two inner flex
  // wrappers below) let a flex item shrink BELOW its content's natural size
  // — harmless for the old absolute-positioned desktop image (it's out of
  // normal flow, doesn't need extra height), but with the image now an
  // in-flow block below the text on phone/iPad, this was clipping it to
  // nothing. Scoped to lg: only, where the original layout/reasoning still applies unchanged.
  return (
    <section className="relative isolate flex flex-1 flex-col border-b border-white/5 bg-transparent min-h-[420px] lg:min-h-0 lg:overflow-hidden lg:max-h-[520px]">
      <div aria-hidden className="hero-mesh" />
      <div aria-hidden className="hero-dots" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 gradient-hero" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)]" />

      {/* quick-260723: sm:px-8 removed — it INCREASED side padding right when the
          request was for MORE usable width on iPad; padding now stays flat (24px)
          across the whole stacked range and only grows at true desktop (lg:40px,
          unchanged), maximizing how much of the screen the full-width title/buttons
          actually get to use. */}
      <div className="relative mx-auto flex w-full flex-1 flex-col max-w-6xl px-6 lg:px-10 lg:min-h-0">
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
              // quick-260723: full width + centered below lg (stacked layout);
              // lg: restores the exact previous left-aligned 55%-width column.
              hasImage
                ? 'hero-left relative z-10 flex min-w-0 w-full flex-col items-center text-center justify-center space-y-4 lg:w-[55%] lg:shrink-0 lg:items-start lg:text-left'
                : 'max-w-3xl space-y-4'
            }
            style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
          >
            <div className={hasImage ? 'flex justify-center lg:justify-start' : 'flex justify-center'}>
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
            <h1 className="hero-h1 w-full text-[clamp(35px,9.24vw,67px)] sm:text-[clamp(59px,5.22vw,67px)] font-semibold leading-[1.05] tracking-[-0.03em] lg:w-[580px] lg:text-[clamp(42px,4.5vw,56px)]">
              {/* Break after word 1 at sm-lg (tablet-stacked); ≥1024px words 1-2 share
                  the top row → 2-line title (nowrap because at 56px the pair sits right
                  at the 580px box limit). quick-260723: no longer forced at true mobile
                  (<640) — the bigger, full-width text wraps on its own more efficiently
                  than a fixed break point can predict.
                  Quick-260718-h9x: gate moved xl→lg — desktop windows under 1280px CSS
                  (common with Windows display scaling) must get the 2-row title too;
                  the 3-row layout is reserved for real tablets + sub-lg widths. */}
              <span className="lg:whitespace-nowrap">
                {content.heroHeadline.split(' ')[0]}
                <br className="hidden sm:block lg:hidden" />
                {' '}{content.heroHeadline.split(' ')[1]}
              </span>
              <br className="hidden sm:block" />
              {' '}{content.heroHeadline.split(' ').slice(2).join(' ')}
            </h1>

            <p
              className={
                hasImage
                  // quick-260723: mobile+tablet scaled ~20% bigger (16.8->20, clamp
                  // floor/ceiling *1.2); lg pinned back to the exact original 18px
                  // desktop value now that sm's ceiling (22) exceeds it.
                  ? 'sm:max-w-2xl text-[20px] leading-[1.5] text-muted-foreground sm:text-[clamp(20px,2.4vw,22px)] lg:text-[18px]'
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
                return <>
                  {text.slice(0, b1)}
                  {/* 3-line break shown 768-1023 (tablet); 640-767 stays natural-wrap */}
                  <br className="block sm:hidden md:block lg:hidden" />
                  {text.slice(b1, mid)}
                  {mid < b2 && <br className="hidden lg:block" />}
                  {text.slice(mid, b2)}
                  <br className="block sm:hidden md:block lg:hidden" />
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
                hasImage
                  ? 'flex flex-col items-center gap-[clamp(8px,1.17vw,12px)] lg:flex-row lg:items-center'
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
                <Button variant="primary" size="default" className="w-full lg:w-auto min-w-[clamp(192px,21.6vw,221px)] lg:min-w-[184px] h-[clamp(48px,5.4vw,55px)] lg:h-[46px] px-[clamp(14px,2.11vw,22px)] lg:px-[18px] text-[clamp(17px,1.87vw,19px)] lg:text-base" onClick={() => onOpenAuth?.('signup')}>
                  {content.ctaLabel}
                  <ArrowRight className="ml-1.5 size-[clamp(19px,2.11vw,22px)] lg:size-[18px]" aria-hidden="true" />
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
                // w-full sm:w-fit: full-width on true mobile phone layout only (was w-fit everywhere).
                // quick-260723: mobile+tablet scaled ~20% bigger — padding keeps its
                // monotonic-decrease shape (29px mobile -> 24px tablet -> 18px desktop,
                // each *1.2 of 24/20/18) rather than a clamp, matching the earlier
                // dip-fix's approach for this one property; height/font get the same
                // *1.2-with-lg-pin treatment as the primary button.
                className="w-full sm:w-fit px-[29px] sm:px-[24px] sm:flex-none lg:self-start border-white/10 bg-white/5 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-[clamp(173px,19.44vw,199px)] lg:min-w-[166px] h-[clamp(48px,5.4vw,55px)] lg:h-[46px] text-[clamp(17px,1.87vw,19px)] lg:text-base lg:px-[18px]"
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
            <div className="hero-image relative w-full aspect-[4/3] z-0 lg:absolute lg:aspect-auto lg:h-auto lg:w-auto lg:top-[36px] lg:bottom-0 lg:left-[calc(35%_+_55px)] lg:right-3 lg:scale-100 xl:top-[65px] xl:left-[calc(35%_+_45px)] xl:right-[-30px]">
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
