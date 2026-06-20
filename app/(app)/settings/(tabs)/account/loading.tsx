import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsSection,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

export default function AccountSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="Account"
      description="Update login credentials and manage irreversible account actions."
    >
      <SettingsCard>
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <SettingsSection title="Change Password" description="Use a strong password that is not shared with other services." />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <SettingsSection title="Change Email" description="A confirmation message will be sent to the new address." />
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard className="border-destructive/30">
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <SettingsSection title="Danger Zone" description="This permanently removes your company profile, projects, and account access." />
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
