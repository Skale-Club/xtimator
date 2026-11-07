import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The frame every list screen sits in (Projects, Clients, Price Book): page
 * padding, then the glass card the Price Book introduced. One component so the
 * screens can't drift apart in background or spacing again.
 *
 * `above` renders outside the card (e.g. the Price Book's undo-import banner).
 */
export function ListPage({ children, above, className }: {
  children: ReactNode
  above?: ReactNode
  className?: string
}) {
  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      {above}
      <ListCard className={className}>{children}</ListCard>
    </div>
  )
}

/** Just the card, for a list that lives inside another page (dashboard "Recent projects"). */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card variant="glass" className={cn('p-4 sm:p-6', className)}>
      {children}
    </Card>
  )
}
