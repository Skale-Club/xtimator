'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { ClientSheet } from '@/components/clients/client-sheet'
import { deleteClientAction } from '@/lib/actions/client'
import type { ClientDetail } from '@/lib/queries/clients'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientDetailActionsProps {
  client: ClientDetail
  companyId: string
}

export function ClientDetailActions({ client, companyId }: ClientDetailActionsProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSheetChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      router.refresh()
    }
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deleteClientAction(client.id)
      if (result.error) {
        toast.error(result.error)
        setDeleteDialogOpen(false)
        return
      }
      toast.success(`"${client.name}" deleted`)
      router.push('/clients')
    })
  }

  return (
    <>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" />
          {t('Edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {t('Delete')}
        </Button>
      </div>

      <ClientSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        client={client}
        companyId={companyId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Client')}</AlertDialogTitle>
            <AlertDialogDescription>
              {client.project_count > 0
                ? `"${client.name}" has ${client.project_count} project(s). Deleting will remove the client association from those projects. ${t('This action cannot be undone')}.`
                : `${t('Are you sure?')} ${t('This action cannot be undone')}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
