import {
  SettingsPageSkeleton,
  SettingsCard,
  SkeletonFields,
} from '@/components/skeletons/settings-page-skeleton'

// Text-free on purpose: the real page's title is translated, so an English
// placeholder title would flash before it.
export default function McpSettingsLoading() {
  return (
    <SettingsPageSkeleton>
      <SettingsCard title>
        <SkeletonFields count={1} />
      </SettingsCard>
      <SettingsCard title>
        <SkeletonFields count={2} tall />
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
