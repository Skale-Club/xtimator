import {
  SettingsPageSkeleton,
  SettingsCard,
  SkeletonFields,
  SkeletonRows,
} from '@/components/skeletons/settings-page-skeleton'

// Text-free on purpose: the real page's title is translated, so an English
// placeholder title would flash before it.
export default function DefaultsSettingsLoading() {
  return (
    <SettingsPageSkeleton>
      <SettingsCard title>
        <SkeletonFields count={2} />
      </SettingsCard>
      <SettingsCard title>
        <SkeletonFields count={2} tall />
      </SettingsCard>
      <SettingsCard title>
        <SkeletonRows count={3} />
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
