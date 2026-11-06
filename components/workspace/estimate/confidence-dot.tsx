'use client'

import { useTranslation } from '@/lib/i18n/use-translation'

// SEED-057 Phase G: the per-line AI confidence dot. OWNER-FACING ONLY - it is
// rendered by the editable document row, never by the page view, the public
// share page, the PDFs or any message. A line the owner has edited by hand is
// no longer the AI's, so the caller does not render a dot for it.

export type ConfidenceLevel = 'low' | 'medium' | 'high'

const DOT_COLOR: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
}

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function ConfidenceDot({
  confidence,
  basis,
}: {
  confidence: ConfidenceLevel | null | undefined
  basis?: string | null
}) {
  const { t } = useTranslation()
  if (!isConfidenceLevel(confidence)) return null

  const label =
    confidence === 'high'
      ? t('AI confidence: high')
      : confidence === 'medium'
        ? t('AI confidence: medium')
        : t('AI confidence: low, check this line')
  const detail = basis && basis.trim() ? `${label}. ${basis.trim()}` : label

  return (
    <span
      role="img"
      aria-label={detail}
      title={detail}
      data-testid="confidence-dot"
      data-confidence={confidence}
      className={`pointer-events-auto absolute right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${DOT_COLOR[confidence]}`}
    />
  )
}
