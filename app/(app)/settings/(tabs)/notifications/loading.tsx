import {
  SettingsPageSkeleton,
  SettingsCard,
  SkeletonRows,
} from '@/components/skeletons/settings-page-skeleton'

// Text-free on purpose: the real page's title is translated, so an English
// placeholder title would flash before it.
export default function NotificationsSettingsLoading() {
  return (
    <SettingsPageSkeleton>
      <SettingsCard title>
        <SkeletonRows count={1} />
      </SettingsCard>
      <SettingsCard title>
        <SkeletonRows count={5} />
      </SettingsCard>
      <SettingsCard title>
        <SkeletonRows count={1} />
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
