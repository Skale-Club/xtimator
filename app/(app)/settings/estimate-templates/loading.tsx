import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/estimate-templates — mirrors the EstimateTemplatesPage layout:
 * - Template Fields card (greeting, opener, closer, signature textareas + save)
 * - Preview card
 */
export default function EstimateTemplatesLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Estimate Templates"
        description="Customize the greeting, opener, closing, and signature for your plain-text estimates. Changes apply to all future estimates — existing generated text is not affected."
      >
        <SettingsCard className="p-8">
          <div className="space-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-28 w-full rounded-md" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
            <div className="flex justify-end">
              <Skeleton className="h-10 w-40 rounded-md" />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard>
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="mt-4 h-40 w-full rounded-md" />
        </SettingsCard>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
