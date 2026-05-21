'use client'

import { useEffect, useState, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useTourContext } from './tour-provider'
import { useTour } from './use-tour'
import { TOUR_STEPS } from './tour-step'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8 // px padding around the target element

// Pick the first VISIBLE match for `selector`. Fixes the dual-mount bug at
// `[data-tour="language-toggle"]` which exists in both topbar.tsx and
// bottom-nav.tsx — `document.querySelector` returned the first DOM match
// regardless of CSS visibility, so on mobile the spotlight could target a
// display:none element.
//
//   - `offsetParent === null` catches `display: none` chains (fast path).
//   - `getComputedStyle(el).display === 'none'` catches nested visibility-hidden/opacity elements missed by offsetParent.
//   - `getBoundingClientRect()` zero-size catches `visibility: hidden` and
//     collapsed elements.
//
// Falls back to the first candidate if none are visible (better than null —
// keeps the spotlight from disappearing entirely on a transient layout glitch).
function findVisibleTarget(selector: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
  for (const el of candidates) {
    if (el.offsetParent === null) continue                            // display:none chain (fast path)
    if (getComputedStyle(el).display === 'none') continue            // belt-and-suspenders for nested hidden
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue                     // visibility:hidden / collapsed
    return el
  }
  // TOUR-QA-02: hardened with getComputedStyle guard 2026-05-21
  return candidates[0] ?? null
}

export function TourSpotlight() {
  const { showSpotlight, setShowSpotlight } = useTourContext()
  const { completeTour, clearSpotlightPending } = useTour()
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const frameRef = useRef<number | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const currentStep = TOUR_STEPS[stepIndex]
  const isLast = stepIndex === TOUR_STEPS.length - 1

  // framer-motion's hook reads `prefers-reduced-motion` and live-updates if
  // the user toggles it mid-session. Returns `true` when the user opted out.
  const reducedMotion = useReducedMotion()

  // `prefers-reduced-transparency` does not yet have a framer-motion helper —
  // sample it once per render via matchMedia. Browsers that don't recognize
  // the query return `matches: false`, which is the safe default
  // (keep the translucent glass surface).
  const reducedTransparency =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches

  // Track target element position via rAF for scroll/resize resilience.
  // findVisibleTarget() runs every frame so a viewport breakpoint change
  // (e.g. topbar hide/show at md breakpoint) re-picks the correct anchor.
  useEffect(() => {
    if (!showSpotlight) return
    let cancelled = false

    function update() {
      if (cancelled) return
      const el = findVisibleTarget(currentStep.target)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else {
        setRect(null)
      }
      frameRef.current = requestAnimationFrame(update)
    }

    frameRef.current = requestAnimationFrame(update)
    return () => {
      cancelled = true
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [showSpotlight, currentStep.target])

  // ESC dismiss + focus capture/restore. Lives in its own effect keyed on
  // `showSpotlight` so it tears down cleanly when the spotlight closes.
  useEffect(() => {
    if (!showSpotlight) return

    // Capture whatever had focus before the spotlight opened so we can return
    // it on close. Not a full focus trap — CONTEXT.md asks for "focus trap
    // released on close" which is really "don't leave focus on an unmounted
    // element". Capture + restore covers that without a new dep.
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      // Restore focus to whatever element had it before the spotlight opened.
      // Guarded by `?.focus?.()` in case the element was unmounted in the
      // meantime (e.g. nav-link removed during the tour).
      previousFocusRef.current?.focus?.()
    }
    // handleClose is stable enough — recreating the listener on every step
    // change would be wasteful and is unnecessary because handleClose only
    // calls setState dispatchers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSpotlight])

  function handleNext() {
    if (isLast) {
      handleClose()
    } else {
      setStepIndex(i => i + 1)
    }
  }

  function handleBack() {
    setStepIndex(i => Math.max(0, i - 1))
  }

  function handleClose() {
    clearSpotlightPending()
    completeTour()
    setShowSpotlight(false)
    setStepIndex(0)
  }

  if (!showSpotlight) return null

  const spotlightTransition = reducedMotion
    ? 'none'
    : 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease'

  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        borderRadius: 8,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
        zIndex: 9998,
        pointerEvents: 'none',
        transition: spotlightTransition,
      }
    : { display: 'none' }

  // Position tooltip card below the spotlight (or above if near bottom)
  const tooltipTop = rect ? rect.top + rect.height + PADDING + PADDING + 8 : 0
  const tooltipLeft = rect
    ? Math.max(16, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 320) - 320 - 16))
    : 0

  const tooltipStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: tooltipTop,
        left: tooltipLeft,
        width: 300,
        zIndex: 9999,
      }
    : { display: 'none' }

  // Under `prefers-reduced-transparency: reduce`, fall back to a solid
  // surface. `glass-strong` applies backdrop-filter: blur(...) (see
  // app/globals.css:388) which the user has explicitly asked the OS to
  // suppress.
  const cardSurfaceClass = reducedTransparency
    ? 'bg-background border border-border shadow-xl'
    : 'glass-strong border border-[var(--glass-border)] shadow-glass'

  return (
    <>
      {/* Spotlight hole */}
      <div style={spotlightStyle} aria-hidden="true" />

      {/* Tooltip card */}
      <div
        style={tooltipStyle}
        className={`${cardSurfaceClass} rounded-xl p-4`}
        role="dialog"
        aria-label={t(currentStep.title)}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xs text-muted-foreground font-medium">
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
            <h3 className="font-semibold text-sm mt-0.5">{t(currentStep.title)}</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('Skip tour')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{t(currentStep.description)}</p>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <Button variant="outline" size="sm" onClick={handleBack} className="flex-1">
              {t('Back')}
            </Button>
          )}
          <Button
            size="sm"
            className={isLast ? 'flex-1 gradient-brand text-white' : 'flex-1'}
            onClick={handleNext}
          >
            {isLast ? t('Done') : t('Next') + ' →'}
          </Button>
        </div>
      </div>
    </>
  )
}
