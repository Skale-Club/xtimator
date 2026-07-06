import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export type Tier = 'free' | 'pro' | 'business'

interface TierCardProps {
  tier: Tier
  name: string
  price: string
  period: string
  features: string[]
  ctaLabel: string
  currentLabel?: string
  popularLabel?: string
  onSelect?: () => void
  current?: boolean
  popular?: boolean
  showAnnual?: boolean
  annualPrice?: string | null
  annualPerMonth?: string | null
  savePct?: number | null
}

/**
 * Phase 71-10 — Tier card with per-tier gradient escalation.
 *
 * - Free → <Card variant="glass"> outline CTA, no top accent
 * - Pro → <Card variant="stat"> (3px gradient-brand top edge), primary gradient CTA
 * - Business → <Card variant="glass"> + 3px gradient-premium top edge, premium tri-gradient CTA
 *
 * Status mapping matches UI-SPEC: "Most popular" pill renders as <Badge variant="brand">.
 *
 * Phase 145 — Annual pricing display:
 * - showAnnual=true + annualPrice → shows annual total + per-month equivalent + save badge
 * - showAnnual=true + no annualPrice → falls back to monthly display (annual not configured)
 */
export function TierCard({
  tier,
  name,
  price,
  period,
  features,
  ctaLabel,
  currentLabel = 'Current plan',
  popularLabel = 'Most popular',
  onSelect,
  current,
  popular,
  showAnnual,
  annualPrice,
  annualPerMonth,
  savePct,
}: TierCardProps) {
  const variant = tier === 'pro' ? 'stat' : 'glass'
  const buttonVariant =
    tier === 'free' ? 'outline' : tier === 'pro' ? 'primary' : 'premium'

  const displayAnnual = showAnnual && !!annualPrice

  return (
    <Card
      variant={variant}
      className={cn(
        'relative flex flex-col gap-5 p-6',
        tier === 'business' &&
          "overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:rounded-t-[var(--radius-lg)] before:bg-[image:var(--gradient-premium)] before:content-['']"
      )}
      data-tier={tier}
    >
      {popular && (
        <Badge
          variant="brand"
          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap"
        >
          <T text={popularLabel} />
        </Badge>
      )}
      <CardHeader className="p-0">
        <CardTitle className="text-xl"><T text={name} /></CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-semibold tracking-tight">
            {displayAnnual ? annualPrice : price}
          </span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            / <T text={displayAnnual ? 'year' : period} />
          </span>
        </div>
        {displayAnnual && annualPerMonth && (
          <p className="text-xs text-muted-foreground">
            {annualPerMonth} <T text="/ mo · billed annually" />
          </p>
        )}
        {displayAnnual && savePct != null && (
          <Badge variant="brand" className="self-start text-xs">
            <T text={`Save ${savePct}%`} />
          </Badge>
        )}
      </div>

      <ul className="flex-1 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-[hsl(var(--primary))]">
              ✓
            </span>
            <span><T text={f} /></span>
          </li>
        ))}
      </ul>
      <Button
        variant={buttonVariant}
        onClick={onSelect}
        disabled={current}
        className="h-auto min-h-10 w-full whitespace-normal py-2 text-center leading-tight"
      >
        <T text={current ? currentLabel : ctaLabel} />
      </Button>
    </Card>
  )
}
