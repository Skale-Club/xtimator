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

interface Props {
  projectId: string
  projectName: string
  status: ProjectListStatus
}

export function ProjectRowActions({ projectId, projectName, status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

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
            className="h-8 w-8"
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
                  run(() => archiveProjectAction(projectId), `"${projectName}" archived`)
                }
              >
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => softDeleteProjectAction(projectId),
                    `"${projectName}" moved to Trash`
                  )
                }
              >
                Delete
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
                    `"${projectName}" unarchived`
                  )
                }
              >
                Unarchive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => softDeleteProjectAction(projectId),
                    `"${projectName}" moved to Trash`
                  )
                }
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
          {status === 'trash' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() =>
                  run(() => restoreProjectAction(projectId), `"${projectName}" restored`)
                }
              >
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() => setConfirmOpen(true)}
              >
                Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${projectName}" will be permanently deleted along with all its recordings, photos, estimates, and activity. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                run(
                  () => hardDeleteProjectAction(projectId),
                  `"${projectName}" permanently deleted`
                )
                setConfirmOpen(false)
              }}
            >
              {isPending ? 'Deleting...' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
