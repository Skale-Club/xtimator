import { Skeleton } from '@/components/ui/skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
  SettingsSection,
} from '@/components/skeletons/settings-page-skeleton'

export default function GeneralSettingsLoading() {
  return (
    <SettingsPageSkeleton
      noPadding
      title="General"
      description="Your personal profile: name, phone, and the photo shown on sign-in."
    >
      <SettingsCard>
        <div className="space-y-8">
          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <SettingsSection
              title="Profile Photo"
              description="Shown as your avatar on sign-in and in the app navbar."
            />
            <div className="flex items-center gap-5">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-9 w-32 rounded-md" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <SettingsSection
              title="Account Name"
              description="Your name on this Xtimator account."
            />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
            <SettingsSection
              title="Phone Number"
              description="Used for account recovery and WhatsApp notifications."
            />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
