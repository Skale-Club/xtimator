import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/appearance — mirrors the AppearanceTabPage layout:
 * - Theme card with radio-like options
 * - Color/theme presets
 */
export default function AppearanceLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton title="Theme" description="Choose how the app looks. System follows your device’s preference.">
        <SettingsCard>
          <div className="space-y-6">
            <div className="space-y-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-md" />
              ))}
            </div>
          </div>
        </SettingsCard>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
