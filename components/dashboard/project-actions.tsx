'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { deleteProjectAction, duplicateProjectAction } from '@/lib/actions/project'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ProjectActionsProps {
  projectId: string
  projectName: string
}

export function ProjectActions({ projectId, projectName }: ProjectActionsProps) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isDuplicating, startDuplicateTransition] = useTransition()

  function handleDuplicate() {
    startDuplicateTransition(async () => {
      const result = await duplicateProjectAction(projectId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Project duplicated')
      }
    })
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteProjectAction(projectId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Project deleted')
        setShowDeleteDialog(false)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/projects/${projectId}`}>{t('View')}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/projects/${projectId}`}>{t('Edit')}</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDuplicate} disabled={isDuplicating}>
            {isDuplicating ? t('Duplicating...') : t('Duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            {t('Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Project')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure?')} {t('This action cannot be undone')}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
