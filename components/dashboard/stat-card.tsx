import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  delta?: string
  className?: string
}

/**
 * Phase 71 — Stat card using <Card variant="stat">.
 * 3px gradient-brand top edge + glass surface + 16px blur.
 * Value typography is mono per UI-SPEC for numeric clarity.
 */
export function StatCard({ icon: Icon, label, value, delta, className }: StatCardProps) {
  return (
    <Card variant="stat" className={cn('p-6 min-h-[120px]', className)}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs uppercase tracking-[0.01em] text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-3 font-mono text-3xl tabular-nums leading-none">{value}</p>
      {delta && (
        <p className="mt-2 text-sm text-emerald-500">{delta}</p>
      )}
    </Card>
  )
}
