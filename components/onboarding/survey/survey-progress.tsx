import { useTranslation } from '@/lib/i18n/use-translation'

interface SurveyProgressProps {
  current: number
  total: number
}

export function SurveyProgress({ current, total }: SurveyProgressProps) {
  const { t } = useTranslation()
  const safeTotal = Math.max(total, 1)
  const oneBased = current + 1
  const pct = Math.round((oneBased / safeTotal) * 100)
  return (
    <div
      className="flex flex-col gap-2"
      aria-label={`${t('Step')} ${oneBased} ${t('of')} ${safeTotal}`}
    >
      <div
        className="flex justify-between text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {t('Step')} {oneBased} {t('of')} {safeTotal}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--glass-bg-light)]">
        <div
          className="h-full rounded-full gradient-brand transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
