import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/payments — mirrors the PaymentsSettingsPage + StripeConnectCard layout:
 * - Optional status banner
 * - Stripe payments glass card with icon, description, status, CTA
 */
export default function PaymentsSettingsLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Payments"
        description="Connect Stripe to let customers pay estimates online."
      >
        <SettingsCard>
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>

            <div className="space-y-3 border-t border-border pt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>

            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </SettingsCard>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
