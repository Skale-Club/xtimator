'use client'
import { formatDuration } from '@/lib/utils/media-format'

export const AMBER_AT_MS = 8 * 60 * 1000  // 8:00 — D-07
export const RED_AT_MS = 9.5 * 60 * 1000  // 9:30 — D-07

export interface CaptureTimerProps {
  elapsedMs: number
}

export function CaptureTimer({ elapsedMs }: CaptureTimerProps) {
  const seconds = Math.floor(elapsedMs / 1000)
  const colorClass =
    elapsedMs >= RED_AT_MS    ? 'text-red-500'   :
    elapsedMs >= AMBER_AT_MS  ? 'text-amber-500' :
                                'text-primary'
  return (
    <p
      className={`text-6xl sm:text-7xl font-mono font-bold tabular-nums transition-colors duration-300 ${colorClass}`}
      aria-live="polite"
      data-testid="capture-timer"
    >
      {formatDuration(seconds)}
    </p>
  )
}
