'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  archiveProjectAction,
  unarchiveProjectAction,
  softDeleteProjectAction,
  restoreProjectAction,
  hardDeleteProjectAction,
} from '@/lib/actions/project'
import type { ProjectListStatus } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'

interface Props {
  projectId: string
  projectName: string
  status: ProjectListStatus
}

export function ProjectRowActions({ projectId, projectName, status }: Props) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [softConfirmOpen, setSoftConfirmOpen] = useState(false)

  function run(
    action: () => Promise<{ data?: unknown; error?: string }>,
    successMsg: string
  ) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        toast.success(successMsg)
        router.refresh()
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            // 40px tap target on touch screens, the compact 32px from md up.
            className="h-10 w-10 md:h-8 md:w-8"
            aria-label={t('Actions')}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {status === 'active' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() =>
                  run(() => archiveProjectAction(projectId), `"${projectName}" ${t('archived')}`)
                }
              >
                {t('Archive')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => setSoftConfirmOpen(true)}
              >
                {t('Delete')}
              </DropdownMenuItem>
            </>
          )}
          {status === 'archived' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() =>
                  run(
                    () => unarchiveProjectAction(projectId),
                    `"${projectName}" ${t('unarchived')}`
                  )
                }
              >
                {t('Unarchive')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => setSoftConfirmOpen(true)}
              >
                {t('Delete')}
              </DropdownMenuItem>
            </>
          )}
          {status === 'trash' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() =>
                  run(() => restoreProjectAction(projectId), `"${projectName}" ${t('restored')}`)
                }
              >
                {t('Restore')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {t('Delete permanently')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Permanently delete project?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${projectName}" ${t('will be permanently deleted along with all its recordings, photos, estimates, and activity. This action cannot be undone.')}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                run(
                  () => hardDeleteProjectAction(projectId),
                  `"${projectName}" ${t('permanently deleted')}`
                )
                setConfirmOpen(false)
              }}
            >
              {isPending ? t('Deleting...') : t('Delete permanently')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={softConfirmOpen} onOpenChange={setSoftConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Move project to Trash?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${projectName}" ${t('will be moved to Trash. You can restore it from the Trash view within 30 days before it is permanently deleted.')}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                run(
                  () => softDeleteProjectAction(projectId),
                  `"${projectName}" ${t('moved to Trash')}`
                )
                setSoftConfirmOpen(false)
              }}
            >
              {isPending ? t('Moving...') : t('Move to Trash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
