'use client'

import { useState } from 'react'
import { Eye, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { EngagementPanel } from './engagement-panel'
import { relativeTime } from '@/lib/utils/relative-time'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

interface EngagementButtonProps {
  estimateId: string
  viewCount: number
  lastViewedAt: string | null
  hasPassword: boolean
}

/**
 * Phase 193 (193-03) — header "Insights" entry point. One element serves
 * both roles: the summary chip (eye icon + open count + relative last-view)
 * AND the trigger that opens the engagement Sheet. Placement: header right
 * cluster, left of ViewModeToggle (components/workspace/project-header.tsx)
 * — the user explicitly rejected the bottom floating pill for this.
 *
 * The caller (project-header.tsx) only mounts this when the estimate has
 * been sent (slot.sentAt != null) — "never sent" hides the whole chip, per
 * the 193-03 plan, so there is no not-sent branch to render here.
 */
export function EngagementButton({
  estimateId,
  viewCount,
  lastViewedAt,
  hasPassword,
}: EngagementButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const hasOpens = viewCount > 0 && lastViewedAt != null
  // relativeTime() returns plain English ("2 hours ago") and is used
  // UNtranslated elsewhere too (components/workspace/activity-timeline.tsx)
  // — matching that existing convention rather than routing a
  // numerically-interpolated string through t()'s exact-string cache.
  const summary = hasOpens ? `${viewCount} · ${relativeTime(lastViewedAt!)}` : t('Not opened yet')

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('Estimate engagement')}
          className={cn(
            'gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground hover:bg-accent',
            !hasOpens && 'text-muted-foreground/70'
          )}
        >
          <Eye className="h-4 w-4 shrink-0" />
          <span className="tabular-nums text-xs">{viewCount}</span>
          {/* Mobile (<sm) collapses to icon + count only — the relative-time
              half (and the "Not opened yet" muted label) hide below sm. */}
          <span className="hidden sm:inline text-xs whitespace-nowrap">
            {hasOpens ? `· ${relativeTime(lastViewedAt!)}` : `· ${summary}`}
          </span>
          {hasPassword && (
            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t('Password protected')} />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {/* Lazy-mount: only fetch engagement data while the Sheet is actually open. */}
        {open && <EngagementPanel estimateId={estimateId} />}
      </SheetContent>
    </Sheet>
  )
}
