'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { closeModalParam } from '@/lib/utils/modal-url'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { NewProjectWizard } from './new-project-wizard'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { EstimateLanguageSelector } from '@/components/estimate/estimate-language-selector'
import { useLanguage, ScopedLanguageProvider } from '@/lib/i18n/language-context'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export const NEW_PROJECT_MODAL_PARAM = 'modal'
export const NEW_PROJECT_MODAL_VALUE = 'new-project'
/** Optional: pre-link the new project to a client (used by the client page). */
export const NEW_PROJECT_CLIENT_PARAM = 'clientId'
/** Optional: when set, the popup edits an EXISTING project's estimate (Edit with
 * AI) instead of creating a new project. Same popup, shared between new + edit. */
export const NEW_PROJECT_EDIT_PARAM = 'editProjectId'

/** Build the href that opens the new-project modal from any page. */
export function newProjectHref(currentSearch?: string, clientId?: string): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  if (clientId) params.set(NEW_PROJECT_CLIENT_PARAM, clientId)
  return `?${params.toString()}`
}

/** Optional, edit mode only: text the popup seeds into its text box once on open
 * (read and removed from the URL by the wizard). Used by "Answer with AI". */
export const NEW_PROJECT_PREFILL_PARAM = 'refinePrefill'

/** Build the href that opens the SAME popup in edit mode for an existing project. */
export function editEstimateHref(
  currentSearch: string | undefined,
  projectId: string,
  prefill?: string,
): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  params.set(NEW_PROJECT_EDIT_PARAM, projectId)
  if (prefill) params.set(NEW_PROJECT_PREFILL_PARAM, prefill)
  return `?${params.toString()}`
}

interface NewXtimateFrameProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description: React.ReactNode
  estimateLanguage: EstimateLanguage
  setEstimateLanguage: (l: EstimateLanguage) => void
  children: React.ReactNode
}

/**
 * Presentational shell of the New Xtimate / Edit with AI popup: bottom sheet on
 * phones, 560px dialog from sm up. Exported so a dev fixture can render it
 * without the wizard.
 *
 * - `nx-surface` re-tints the theme tokens inside the popup only (globals.css).
 * - No backdrop blur / glass on the surface: blur inside a tall scrolling
 *   surface froze phones. The soft top glow is a plain background-image.
 * - Keyboard: the primitive's visual-viewport rules (globals.css, keyed on
 *   html[data-keyboard]) keep dialogs centred in the visible area; the
 *   `nx-surface` override there anchors the phone sheet on top of the keyboard.
 */
export function NewXtimateFrame({
  open,
  onClose,
  title,
  description,
  estimateLanguage,
  setEstimateLanguage,
  children,
}: NewXtimateFrameProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'nx-surface flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none',
          // Phones: bottom sheet (full width, square bottom, safe-area padding).
          'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)]',
          // sm and up: centred 560px dialog.
          'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:max-w-[560px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0',
        )}
      >
        {/* Decorative grab handle (phones only); the sheet has no drag gesture. */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
        {/* Scope the language to this popup only — selecting a language re-skins
            the popup + the estimate, never the rest of the app. */}
        <ScopedLanguageProvider language={estimateLanguage} setLanguage={setEstimateLanguage}>
          <DialogHeader className="shrink-0 flex flex-row items-start justify-between gap-3 pl-5 pr-3 pt-3 pb-1 text-left">
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">
                {title}
              </DialogTitle>
              <EstimateLanguageSelector
                value={estimateLanguage}
                onChange={setEstimateLanguage}
                variant="sentence"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Close')}
              // 40px hit area around a 36px round visual.
              className="group flex size-10 shrink-0 items-center justify-center rounded-full focus:outline-none"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <X className="h-4 w-4" />
              </span>
            </button>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>

          {children}
        </ScopedLanguageProvider>
      </DialogContent>
    </Dialog>
  )
}

function NewProjectDialogInner() {
  const searchParams = useSearchParams()
  const { language: appLanguage } = useLanguage()
  const [estimateLanguage, setEstimateLanguage] = useState<EstimateLanguage>(
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'
  )

  const isOpen = searchParams.get(NEW_PROJECT_MODAL_PARAM) === NEW_PROJECT_MODAL_VALUE
  const editProjectId = searchParams.get(NEW_PROJECT_EDIT_PARAM) ?? undefined

  function onClose() {
    // History API → closes instantly without re-rendering the page behind it.
    closeModalParam(NEW_PROJECT_EDIT_PARAM, NEW_PROJECT_PREFILL_PARAM)
  }

  return (
    <NewXtimateFrame
      open={isOpen}
      onClose={onClose}
      title={editProjectId ? <T>Edit with AI</T> : <T>New Xtimate</T>}
      description={
        editProjectId ? (
          <T>Record audio, type, or upload photos to update the current estimate.</T>
        ) : (
          <T>Record audio, type, or upload photos to generate an estimate.</T>
        )
      }
      estimateLanguage={estimateLanguage}
      setEstimateLanguage={setEstimateLanguage}
    >
      {isOpen && (
        <NewProjectWizard
          onComplete={onClose}
          editProjectId={editProjectId}
          estimateLanguage={estimateLanguage}
          setEstimateLanguage={setEstimateLanguage}
        />
      )}
    </NewXtimateFrame>
  )
}

/**
 * Mount in the app-shell layout — renders the new-project dialog controlled
 * by the `?modal=new-project` search param. Any page in the app can open it
 * by setting that param without navigating away from the current page.
 */
export function NewProjectDialog() {
  return (
    <Suspense>
      <NewProjectDialogInner />
    </Suspense>
  )
}
