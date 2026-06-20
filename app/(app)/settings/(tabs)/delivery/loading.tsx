import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/delivery — mirrors the DeliverySettingsForm layout:
 * - Signature / Email / SMS toggle cards
 * - Save button
 */
export default function DeliverySettingsLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Estimate Delivery \u0026 Signature"
        description="Choose how estimates are delivered and whether clients must sign before accepting."
      >
        <SettingsCard>
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4"
              >
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            ))}
          </div>
        </SettingsCard>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
