'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { NewProjectWizard } from './new-project-wizard'
import { T } from '@/components/i18n/t'
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

/** Build the href that opens the SAME popup in edit mode for an existing project. */
export function editEstimateHref(currentSearch: string | undefined, projectId: string): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  params.set(NEW_PROJECT_EDIT_PARAM, projectId)
  return `?${params.toString()}`
}

function NewProjectDialogInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { language: appLanguage } = useLanguage()
  const [estimateLanguage, setEstimateLanguage] = useState<EstimateLanguage>(
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'
  )

  const isOpen = searchParams.get(NEW_PROJECT_MODAL_PARAM) === NEW_PROJECT_MODAL_VALUE
  const editProjectId = searchParams.get(NEW_PROJECT_EDIT_PARAM) ?? undefined

  function onClose() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(NEW_PROJECT_MODAL_PARAM)
    params.delete(NEW_PROJECT_EDIT_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 sm:max-w-xl max-h-[85dvh] flex flex-col"
      >
        {/* Scope the language to this popup only — selecting a language re-skins
            the popup + the estimate, never the rest of the app. */}
        <ScopedLanguageProvider language={estimateLanguage} setLanguage={setEstimateLanguage}>
          <DialogHeader className="px-4 py-3 border-b shrink-0 flex flex-row items-center justify-between gap-2 text-left">
            <DialogTitle className="text-base font-semibold whitespace-nowrap">
              {editProjectId ? <T>Edit with AI</T> : <T>New Xtimate</T>}
            </DialogTitle>
            {/* Selector + close button share one items-center row so the X is
                vertically aligned with the language selector. */}
            <div className="flex items-center gap-1.5">
              <EstimateLanguageSelector
                value={estimateLanguage}
                onChange={setEstimateLanguage}
                compact
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription className="sr-only">
              <T>Record audio, type, or upload photos to generate an estimate.</T>
            </DialogDescription>
          </DialogHeader>

          {isOpen && (
            <NewProjectWizard
              onComplete={onClose}
              editProjectId={editProjectId}
              estimateLanguage={estimateLanguage}
              setEstimateLanguage={setEstimateLanguage}
            />
          )}
        </ScopedLanguageProvider>
      </DialogContent>
    </Dialog>
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
