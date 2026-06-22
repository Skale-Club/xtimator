'use client'

import { Suspense } from 'react'
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

export const NEW_PROJECT_MODAL_PARAM = 'modal'
export const NEW_PROJECT_MODAL_VALUE = 'new-project'
/** Optional: pre-link the new project to a client (used by the client page). */
export const NEW_PROJECT_CLIENT_PARAM = 'clientId'

/** Build the href that opens the new-project modal from any page. */
export function newProjectHref(currentSearch?: string, clientId?: string): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  if (clientId) params.set(NEW_PROJECT_CLIENT_PARAM, clientId)
  return `?${params.toString()}`
}

function NewProjectDialogInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get(NEW_PROJECT_MODAL_PARAM) === NEW_PROJECT_MODAL_VALUE

  function onClose() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(NEW_PROJECT_MODAL_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="p-0 gap-0 sm:max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0 text-left">
          <DialogTitle className="text-base font-semibold">
            <T>New Xtimate</T>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <T>Record audio, type, or upload photos to generate an estimate.</T>
          </DialogDescription>
        </DialogHeader>

        {isOpen && (
          <NewProjectWizard onComplete={onClose} />
        )}
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
