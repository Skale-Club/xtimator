'use client'

import { forwardRef, type ReactNode, type Ref } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bug, Camera, Settings, Share2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import type { EstimateViewMode } from '@/components/workspace/estimate/estimate-floating-actions'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

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
}

interface DockButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  tone?: 'default' | 'ai'
  children: ReactNode
}

const DockButton = forwardRef<HTMLButtonElement, DockButtonProps>(function DockButton(
  { icon, tone = 'default', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-[52px] min-w-[54px] flex-none flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 md:h-[42px] md:flex-row md:gap-2 md:rounded-full md:bg-muted md:px-3.5 md:text-[13.5px] md:text-foreground',
        tone === 'ai' && 'text-primary md:bg-primary/10 md:text-primary',
        className,
      )}
      {...rest}
    >
      <span aria-hidden className="grid size-5 place-items-center">
        {icon}
      </span>
      <span className="leading-none">{children}</span>
    </button>
  )
})

function EditWithAiButton({ projectId, locked }: { projectId: string; locked: boolean }) {
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
}: EditorDockProps) {
  const { t } = useTranslation()

  const modeButton = (mode: EstimateViewMode, label: string, ariaLabel: string) => (
    <button
      type="button"
      aria-pressed={viewMode === mode}
      aria-label={ariaLabel}
      onClick={() => onViewModeChange(mode)}
      className={cn(
        'h-[34px] rounded-full px-3.5 text-[13px] font-medium transition-colors',
        viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  )

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
        {modeButton('width', t('Width'), 'Full width view')}
        {modeButton('page', t('Page'), 'Paginated view')}
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
      <EditWithAiButton projectId={projectId} locked={locked} />

      <Button
        onClick={onShare}
        disabled={saving}
        className="ml-1.5 h-[50px] min-w-0 flex-1 gap-2 rounded-full px-3 text-[15px] font-semibold md:h-[42px] md:flex-none md:px-5 md:text-sm"
      >
        <Share2 size={18} aria-hidden />
        {t('Share')}
      </Button>
    </div>
  )
}
