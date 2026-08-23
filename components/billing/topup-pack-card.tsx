import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'
import { TopUpButton } from '@/components/billing/top-up-button'
import { formatUsd } from '@/lib/billing/format-usd'

/**
 * Phase 153-01 (CREDITUI-06) — a single dollar-denominated top-up pack card.
 *
 * Mirrors tier-card.tsx's visual pattern, simplified (no annual toggle, no
 * "current plan" state, no features list — packs are not mutually exclusive).
 * The dollar amount is ALWAYS derived from `priceCents` (never a hardcoded
 * dollar-amount string literal) so the card stays correct if pricing changes
 * in the admin panel.
 */
export function TopUpPackCard({
  packIndex,
  priceCents,
  credits,
  recommended,
  // Threaded from the page: a non-owner gets a disabled button with a reason
  // instead of a 403 they cannot interpret.
  isOwner = true,
}: {
  packIndex: number
  priceCents: number
  credits: number
  recommended?: boolean
  isOwner?: boolean
}) {
  const amount = formatUsd(priceCents)
  return (
    <Card
      variant="glass"
      className={cn(
        'relative flex flex-col gap-4 p-6',
        recommended &&
          "overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-[var(--radius-lg)] before:bg-[image:var(--gradient-brand)] before:content-['']"
      )}
    >
      {recommended && (
        <Badge
          variant="brand"
          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          <T>Best value</T>
        </Badge>
      )}
      <CardHeader className="p-0">
        <CardTitle className="text-xl">
          <span className="font-mono text-3xl font-semibold tracking-tight">{amount}</span>
        </CardTitle>
      </CardHeader>
      <TopUpButton
        isOwner={isOwner}
        packIndex={packIndex}
        label={`Top up ${amount}`}
        variant={recommended ? 'primary' : 'outline'}
      />
    </Card>
  )
}
