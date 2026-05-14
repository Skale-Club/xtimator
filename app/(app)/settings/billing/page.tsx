import { redirect } from 'next/navigation'
import { CreditCard, TrendingUp, AlertCircle } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getBillingData } from '@/lib/queries/billing'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'

export const metadata = { title: 'Billing' }

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free',
  trial: 'Trial',
  pro: 'Pro',
  business: 'Business',
}

export default async function BillingPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const data = await getBillingData(claims.sub as string)

  if (!data) {
    redirect('/onboarding')
  }

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>

      {/* Plan card */}
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>{tierDisplay} Plan</CardTitle>
              <CardDescription>Current subscription plan</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-2 text-sm">
          {data.tier === 'trial' && data.tierTrialEndsAt && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Trial ends:</span>{' '}
              {formatDate(data.tierTrialEndsAt)}
            </p>
          )}
          {(data.tier === 'pro' || data.tier === 'business') && data.tierRenewsAt && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Renews:</span>{' '}
              {formatDate(data.tierRenewsAt)}
            </p>
          )}
          {data.tier === 'free' && !data.tierTrialEndsAt && (
            <p className="text-muted-foreground">No active trial</p>
          )}
        </CardContent>
      </Card>

      {/* Usage meters */}
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Usage This Month</CardTitle>
              <CardDescription>
                Counts reset at the start of each UTC calendar month.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Estimates</span>
            <span className="font-medium">
              {data.estimatesThisMonth}
              {' / '}
              {data.entitlements.maxEstimatesPerMonth !== null
                ? data.entitlements.maxEstimatesPerMonth
                : 'Unlimited'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Photos analyzed
            </span>
            <span className="font-medium">
              {data.photosThisMonth}
              {' / '}
              {data.entitlements.maxPhotosPerEstimate !== null
                ? `${data.entitlements.maxPhotosPerEstimate} per estimate`
                : 'Unlimited'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Action area — interactive buttons added in Plan 02 */}
      <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {data.tier === 'pro' || data.tier === 'business'
              ? 'Subscription management available below.'
              : 'Upgrade your plan to unlock higher limits and premium features.'}
          </p>
        </div>
      </div>
    </div>
  )
}
