import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function AppearanceLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Appearance"
      description="Choose how the app looks. System follows your device's preference."
    >
      <SettingsCard>
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-md" />
          ))}
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
