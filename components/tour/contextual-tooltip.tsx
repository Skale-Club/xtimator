'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

export const TOOLTIP_KEYS = {
  priceBook:      'tooltip_seen_price_book',
  clients:        'tooltip_seen_clients',
  estimateTotal:  'tooltip_seen_estimate_total',
  whatsapp:       'tooltip_seen_whatsapp',
  languageToggle: 'tooltip_seen_language_toggle',
} as const

export type TooltipKey = (typeof TOOLTIP_KEYS)[keyof typeof TOOLTIP_KEYS]

type TooltipSide = 'right' | 'bottom' | 'top' | 'left'

interface ContextualTooltipProps {
  tooltipKey: TooltipKey
  text: string
  side?: TooltipSide
  className?: string
  children?: React.ReactNode
}

export function ContextualTooltip({
  tooltipKey,
  text,
  side = 'right',
  className,
  children,
}: ContextualTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setMounted(true)
    const seen = localStorage.getItem(tooltipKey) === 'seen'
    if (!seen) {
      setVisible(true)
    }
  }, [tooltipKey])

  function dismiss() {
    localStorage.setItem(tooltipKey, 'seen')
    setVisible(false)
  }

  if (!mounted || !visible) {
    return children ? <>{children}</> : null
  }

  const positionClasses: Record<TooltipSide, string> = {
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  }

  return (
    <span className={`relative inline-flex items-center ${className ?? ''}`}>
      {children}
      <span
        role="tooltip"
        className={`absolute z-50 w-52 glass-strong border border-[var(--glass-border)] rounded-lg shadow-glass p-3 text-xs text-foreground ${positionClasses[side]}`}
      >
        <button
          onClick={dismiss}
          aria-label={t('Dismiss tooltip')}
          className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
        <span className="pr-4 leading-snug">{t(text)}</span>
      </span>
    </span>
  )
}
