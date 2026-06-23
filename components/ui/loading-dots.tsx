import { cn } from '@/lib/utils'

interface LoadingDotsProps {
  /** Wrapper class — control color via text-* (dots use currentColor) + spacing. */
  className?: string
  /** Per-dot size class. Default: h-1.5 w-1.5 (small inline). */
  dotClassName?: string
  /** Accessible label for screen readers. Default: "Loading". */
  label?: string
}

/**
 * Three bouncing dots — the standard small/inline loading indicator. Dots use
 * `currentColor`, so set the color with a `text-*` class on `className`
 * (e.g. inside a button they inherit the button's text color).
 */
export function LoadingDots({ className, dotClassName, label = 'Loading' }: LoadingDotsProps) {
  const dot = cn('rounded-full bg-current animate-bounce', dotClassName ?? 'h-1.5 w-1.5')
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      role="status"
      aria-label={label}
    >
      <span className={dot} style={{ animationDelay: '-0.3s' }} />
      <span className={dot} style={{ animationDelay: '-0.15s' }} />
      <span className={dot} style={{ animationDelay: '0s' }} />
    </span>
  )
}
