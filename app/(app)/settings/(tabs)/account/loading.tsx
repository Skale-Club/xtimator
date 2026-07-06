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
      description="Manage your profile and security settings."
    >
      {/* Profile Card */}
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
              title="Phone"
              description="Your contact phone for your account and recovery."
            />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </SettingsCard>

      {/* Security Card */}
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
    </SettingsPageSkeleton>
  )
}
