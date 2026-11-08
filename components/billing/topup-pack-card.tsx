import { cn } from '@/lib/utils'
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
    <div
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-[var(--radius-md)] border px-2 pb-3 pt-5 text-center sm:gap-4 sm:p-5 sm:pt-6',
        recommended
          ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/5'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg-light)]'
      )}
    >
      {recommended && (
        <Badge variant="brand" className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <T>Best value</T>
        </Badge>
      )}
      <span className="text-2xl font-semibold tracking-tight [font-variant-numeric:tabular-nums] sm:text-3xl">{amount}</span>
      <TopUpButton
        isOwner={isOwner}
        showOwnerHint={false}
        packIndex={packIndex}
        label="Buy"
        variant={recommended ? 'primary' : 'outline'}
        className="w-full"
      />
    </div>
  )
}
