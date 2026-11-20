'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { closeModalParam } from '@/lib/utils/modal-url'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { NewProjectWizard } from './new-project-wizard'
import { T } from '@/components/i18n/t'
import { useTranslation } from '@/lib/i18n/use-translation'
import { EstimateLanguageSelector } from '@/components/estimate/estimate-language-selector'
import { useLanguage, ScopedLanguageProvider } from '@/lib/i18n/language-context'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

import {
  NEW_PROJECT_MODAL_PARAM,
  NEW_PROJECT_MODAL_VALUE,
  NEW_PROJECT_EDIT_PARAM,
  NEW_PROJECT_PREFILL_PARAM,
  NEW_PROJECT_FRESH_PARAM,
} from '@/lib/estimate/creation-href'
export {
  NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE, NEW_PROJECT_CLIENT_PARAM,
  NEW_PROJECT_EDIT_PARAM, NEW_PROJECT_PREFILL_PARAM, newProjectHref, editEstimateHref,
} from '@/lib/estimate/creation-href'

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
      {/* Bottom sheet on phones (drag the handle or header down to close),
          centred 560px dialog from sm up. */}
      <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[560px]">
        {/* Scope the language to this popup only — selecting a language re-skins
            the popup + the estimate, never the rest of the app. */}
        <ScopedLanguageProvider language={estimateLanguage} setLanguage={setEstimateLanguage}>
          <DialogHeader data-sheet-drag="" className="shrink-0 flex flex-row items-start justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left touch-none sm:pt-3">
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
            <BottomSheetCloseButton label={t('Close')} />
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>

          {children}
        </ScopedLanguageProvider>
      </BottomSheetContent>
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
  // "Answer and generate" on a project waiting for details: same project, a
  // fresh estimate (there is nothing to refine yet).
  const fresh = !!editProjectId && searchParams.get(NEW_PROJECT_FRESH_PARAM) === '1'

  function onClose() {
    // History API → closes instantly without re-rendering the page behind it.
    closeModalParam(NEW_PROJECT_EDIT_PARAM, NEW_PROJECT_PREFILL_PARAM, NEW_PROJECT_FRESH_PARAM)
  }

  return (
    <NewXtimateFrame
      open={isOpen}
      onClose={onClose}
      title={editProjectId && !fresh ? <T>Edit with AI</T> : <T>New Xtimate</T>}
      description={
        editProjectId && !fresh ? (
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
          fresh={fresh}
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
