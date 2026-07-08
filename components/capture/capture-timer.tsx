'use client'
import { formatDuration } from '@/lib/utils/media-format'
import { cn } from '@/lib/utils'

export const AMBER_AT_MS = 8 * 60 * 1000  // 8:00 — D-07
export const RED_AT_MS = 9.5 * 60 * 1000  // 9:30 — D-07

export interface CaptureTimerProps {
  elapsedMs: number
  // 260707-ru5: optional override for the base size/weight classes (e.g. the
  // popup recording overlay uses a lighter, smaller scale). Merged via cn()
  // AFTER the base classes so twMerge resolves conflicting size utilities.
  className?: string
}

export function CaptureTimer({ elapsedMs, className }: CaptureTimerProps) {
  const seconds = Math.floor(elapsedMs / 1000)
  const colorClass =
    elapsedMs >= RED_AT_MS    ? 'text-red-500'   :
    elapsedMs >= AMBER_AT_MS  ? 'text-amber-500' :
                                'text-primary'
  return (
    <p
      className={cn('text-6xl sm:text-7xl font-mono font-bold tabular-nums transition-colors duration-300', colorClass, className)}
      aria-live="polite"
      data-testid="capture-timer"
    >
      {formatDuration(seconds)}
    </p>
  )
}
