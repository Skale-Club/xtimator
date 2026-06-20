import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import { SettingsPageSkeleton } from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/(tabs) — redirect target for the tabbed settings routes.
 * This fallback skeleton is shown only during layout hydration; the tab
 * content replaces it almost immediately.
 */
export default function SettingsTabsLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton />
    </SettingsShellSkeleton>
  )
}
