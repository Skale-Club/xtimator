import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/custom-domain — mirrors the CustomDomainForm layout:
 * - Domain Configuration card (input + save)
 * - DNS Setup Instructions card (conditionally rendered)
 */
export default function CustomDomainLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Custom Domain"
        description="Serve estimate share links from your own domain instead of xtimator.com."
      >
        <SettingsCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            <div className="rounded-md border p-4">
              <Skeleton className="h-4 w-32" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </SettingsCard>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
