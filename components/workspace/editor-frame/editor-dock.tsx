'use client'

import type { ReactNode, Ref } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bug, Camera, Loader2, Settings, Share2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import type { EstimateViewMode } from '@/components/workspace/estimate/estimate-floating-actions'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { DockButton } from './dock-button'

export interface EditorDockProps {
  projectId: string
  /** Save in flight: Share waits for it. */
  saving: boolean
  /** Content locked or not editable: "Edit with AI" is disabled. */
  locked: boolean
  onShare: () => void
  onOpenPhotos?: () => void
  /** Omitted -> no Options button. */
  onOpenSettings?: () => void
  /** The settings popover anchors to this button. */
  settingsButtonRef?: Ref<HTMLButtonElement>
  /** Platform admins only. */
  onOpenDebug?: () => void
  viewMode: EstimateViewMode
  onViewModeChange: (mode: EstimateViewMode) => void
  /**
   * Replaces Share as the big primary button (an accepted estimate offers "New
   * change order"). Share then moves to a secondary dock button labelled "Send".
   * Absent: today's layout.
   */
  /** Notices review stage 1: unanswered AI questions, shown as a small counter on "Edit with AI". */
  aiBadge?: number
  /** Notices review stage 1, part 2: a dot on the "Page" toggle with this tooltip
   *  (the Modern template is only drawn in Page view). Absent: no dot. */
  pageHint?: string
  primary?: {
    label: string
    icon: ReactNode
    onClick: () => void
    /** Spinner and disabled while the action runs. */
    busy?: boolean
    testId?: string
  }
}

function EditWithAiButton({ projectId, locked, badge = 0 }: { projectId: string; locked: boolean; badge?: number }) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  return (
    <DockButton
      tone="ai"
      icon={<Sparkles size={20} />}
      data-testid="edit-with-ai-btn"
      disabled={locked}
      onClick={() => router.push(editEstimateHref(searchParams.toString(), projectId), { scroll: false })}
    >
      <span className="md:hidden">{t('AI edit')}</span>
      <span className="hidden md:inline">{t('Edit with AI')}</span>
      {badge > 0 && !locked && (
        <span
          className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500/20 px-[5px] text-[11px] font-bold leading-none tabular-nums text-amber-600 dark:text-amber-400"
          aria-label={t('{count} AI questions to answer').replace('{count}', String(badge))}
          data-testid="edit-with-ai-badge"
        >
          {badge}
        </span>
      )}
    </DockButton>
  )
}

/**
 * Editor frame v2 docked action bar. Phones: icon-over-label buttons with
 * Share filling the rest of the row. Desktop: pill buttons, with the document
 * view-mode switch (lg+) on the left.
 */
export function EditorDock({
  projectId,
  saving,
  locked,
  onShare,
  onOpenPhotos,
  onOpenSettings,
  settingsButtonRef,
  onOpenDebug,
  viewMode,
  onViewModeChange,
  primary,
  aiBadge = 0,
  pageHint,
}: EditorDockProps) {
  const { t } = useTranslation()

  const modeButton = (mode: EstimateViewMode, label: string, ariaLabel: string, hint?: string) => {
    const button = (
      <button
        type="button"
        aria-pressed={viewMode === mode}
        aria-label={ariaLabel}
        aria-description={hint}
        onClick={() => onViewModeChange(mode)}
        className={cn(
          'relative h-[34px] rounded-full px-3.5 text-[13px] font-medium transition-colors',
          viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
        )}
      >
        {label}
        {hint && (
          <span
            aria-hidden
            data-testid="page-view-hint-dot"
            className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
          />
        )}
      </button>
    )
    if (!hint) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px]" data-testid="page-view-hint">
          {hint}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      data-testid="editor-dock"
      data-hide-on-keyboard
      className="flex items-center gap-1 border-t border-border bg-background/95 px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] backdrop-blur md:gap-2 md:px-5 md:py-2.5"
    >
      <div
        role="group"
        aria-label="Document view mode"
        className="hidden gap-0.5 rounded-full bg-muted p-[3px] lg:inline-flex"
      >
        <TooltipProvider delayDuration={150}>
          {modeButton('width', t('Width'), 'Full width view')}
          {/* Modern template: the editable width view is drawn in the standard
              layout; the dot says Page view shows what the client sees. */}
          {modeButton('page', t('Page'), 'Paginated view', viewMode === 'width' ? pageHint : undefined)}
        </TooltipProvider>
      </div>

      <div className="hidden flex-1 md:block" />

      {onOpenDebug && (
        <button
          type="button"
          onClick={onOpenDebug}
          aria-label={t('Estimate debug')}
          title={t('Estimate debug')}
          data-testid="estimate-debug-trigger"
          className="grid size-10 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <Bug size={18} aria-hidden />
        </button>
      )}
      {onOpenSettings && (
        <DockButton ref={settingsButtonRef} icon={<Settings size={20} />} onClick={onOpenSettings}>
          {t('Options')}
        </DockButton>
      )}
      {onOpenPhotos && (
        <DockButton icon={<Camera size={20} />} onClick={onOpenPhotos}>
          {t('Photos')}
        </DockButton>
      )}
      {/* With a primary override (accepted estimate) the content is locked and
          "Edit with AI" could only be disabled: leave it out so the phone row fits. */}
      {!primary && <EditWithAiButton projectId={projectId} locked={locked} badge={aiBadge} />}

      {primary ? (
        <>
          <DockButton icon={<Share2 size={20} />} onClick={onShare} disabled={saving}>
            {t('Send')}
          </DockButton>
          <Button
            onClick={primary.onClick}
            disabled={primary.busy}
            data-testid={primary.testId}
            // Phones: the label may wrap to two lines and the icon steps aside.
            className="ml-1.5 h-[50px] min-w-0 flex-1 gap-2 whitespace-normal rounded-full px-3 text-[15px] font-semibold max-sm:text-[13px] max-sm:leading-tight md:h-[42px] md:flex-none md:px-5 md:text-sm"
          >
            <span aria-hidden className="max-sm:hidden">
              {primary.busy ? <Loader2 size={18} className="animate-spin" /> : primary.icon}
            </span>
            {primary.busy && <Loader2 size={16} className="animate-spin sm:hidden" aria-hidden />}
            {primary.label}
          </Button>
        </>
      ) : (
        <Button
          onClick={onShare}
          disabled={saving}
          className="ml-1.5 h-[50px] min-w-0 flex-1 gap-2 rounded-full px-3 text-[15px] font-semibold md:h-[42px] md:flex-none md:px-5 md:text-sm"
        >
          <Share2 size={18} aria-hidden />
          {t('Share')}
        </Button>
      )}
    </div>
  )
}
