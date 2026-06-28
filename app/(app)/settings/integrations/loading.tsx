import { Skeleton } from '@/components/ui/skeleton'
import { SettingsShellSkeleton } from '@/components/skeletons/settings-shell-skeleton'
import {
  SettingsPageSkeleton,
  SettingsCard,
} from '@/components/skeletons/settings-page-skeleton'

/**
 * /settings/integrations — mirrors the SettingsIntegrationsPage layout:
 * - AI transparency card
 * - Assistants (MCP Server) link-card
 */
export default function SettingsIntegrationsLoading() {
  return (
    <SettingsShellSkeleton>
      <SettingsPageSkeleton
        title="Integrations"
        description="Connect outbound channels and AI assistants."
      >
        <section className="space-y-3">
          <Skeleton className="h-3 w-8" />
          <SettingsCard>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="mt-2 h-3 w-full max-w-md" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          </SettingsCard>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <SettingsCard className="transition hover:border-primary/40 hover:shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="mt-2 h-3 w-full max-w-md" />
            <Skeleton className="mt-4 h-3 w-48" />
          </SettingsCard>
        </section>
      </SettingsPageSkeleton>
    </SettingsShellSkeleton>
  )
}
