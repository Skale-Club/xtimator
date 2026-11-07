import {
  SettingsPageSkeleton,
  SettingsCard,
  SkeletonFields,
} from '@/components/skeletons/settings-page-skeleton'

// Text-free on purpose: the real page's title is translated, so an English
// placeholder title would flash before it.
export default function SettingsTabsLoading() {
  return (
    <SettingsPageSkeleton>
      <SettingsCard title>
        <SkeletonFields count={4} />
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
