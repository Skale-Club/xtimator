'use client'

import { useEffect, useState, useRef } from 'react'
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

export function TourSpotlight() {
  const { showSpotlight, setShowSpotlight } = useTourContext()
  const { completeTour, clearSpotlightPending } = useTour()
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const frameRef = useRef<number | null>(null)

  const currentStep = TOUR_STEPS[stepIndex]
  const isLast = stepIndex === TOUR_STEPS.length - 1

  // Track target element position via rAF for scroll/resize resilience
  useEffect(() => {
    if (!showSpotlight) return
    let cancelled = false

    function update() {
      if (cancelled) return
      const el = document.querySelector(currentStep.target) as HTMLElement | null
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
        transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
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

  return (
    <>
      {/* Spotlight hole */}
      <div style={spotlightStyle} aria-hidden="true" />

      {/* Tooltip card */}
      <div
        style={tooltipStyle}
        className="glass-strong border border-[var(--glass-border)] rounded-xl shadow-glass p-4"
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
