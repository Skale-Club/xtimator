'use client'

import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Must be a child of Link so Next owns its pending/completed/cancelled state. */
export function NavigationPending({ label, className }: { label: string; className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span
      role="status"
      aria-label={label}
      data-navigation-pending=""
      className={cn('pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-primary', className)}
    >
      <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
    </span>
  )
}
