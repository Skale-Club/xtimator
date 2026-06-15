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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            <T>New Xtimate</T>
          </DialogTitle>
          <DialogDescription>
            <T>Pick how you want to describe the job | audio, text, or photos.</T>
          </DialogDescription>
        </DialogHeader>

        {isOpen && <NewProjectWizard onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mount in the app-shell layout — renders the new-project dialog controlled
 * by the `?modal=new-project` search param. Any page in the app can open it
 * by setting that param without navigating away.
 */
export function NewProjectDialog() {
  return (
    <Suspense>
      <NewProjectDialogInner />
    </Suspense>
  )
}
