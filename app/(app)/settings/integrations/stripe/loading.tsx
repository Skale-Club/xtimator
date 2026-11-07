import {
  SettingsPageSkeleton,
  SettingsCard,
  SkeletonRows,
} from '@/components/skeletons/settings-page-skeleton'

// Text-free on purpose: the real page's title is translated, so an English
// placeholder title would flash before it.
export default function StripeIntegrationLoading() {
  return (
    <SettingsPageSkeleton>
      <SettingsCard title>
        <SkeletonRows count={2} />
      </SettingsCard>
    </SettingsPageSkeleton>
  )
}
