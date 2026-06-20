import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import { SettingsPageSkeleton } from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings — redirects to /settings/company, so this loading.tsx is used
 * briefly while the redirect resolves. It mirrors the real layout with the
 * settings sub-nav skeleton and a generic company/profile shaped content.
 */
export default function SettingsLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Settings"
        description="Loading your settings..."
      />
    </SettingsShellSkeleton>
  )
}
