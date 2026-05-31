'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MoreHorizontal, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { ClientSheet } from '@/components/clients/client-sheet'
import { deleteClientAction } from '@/lib/actions/client'
import { createClient } from '@/lib/supabase/client'
import type { ClientWithCount, ClientDetail } from '@/lib/queries/clients'
import { useTranslation } from '@/lib/i18n/use-translation'

interface ClientListProps {
  clients: ClientWithCount[]
  companyId: string
}

export function ClientList({ clients, companyId }: ClientListProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientDetail | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState<{
    id: string
    name: string
    projectCount: number
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAddClient() {
    setEditingClient(null)
    setSheetOpen(true)
  }

  async function handleEditClient(clientId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()
    if (data) {
      setEditingClient({ ...data, project_count: 0 })
      setSheetOpen(true)
    }
  }

  function handleDeletePrompt(client: ClientWithCount) {
    setDeletingClient({ id: client.id, name: client.name, projectCount: client.project_count })
    setDeleteDialogOpen(true)
  }

  function handleConfirmDelete() {
    if (!deletingClient) return
    startTransition(async () => {
      const result = await deleteClientAction(deletingClient.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${deletingClient.name}" deleted`)
        router.refresh()
      }
      setDeleteDialogOpen(false)
      setDeletingClient(null)
    })
  }

  function handleSheetChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      setEditingClient(null)
      router.refresh()
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <div
            key={client.id}
            className="relative rounded-xl border bg-card p-4 flex flex-col gap-4"
          >
            {/* Header row: avatar + name + menu */}
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/clients/${client.id}`}
                className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
                  <AvatarFallback className="text-sm font-semibold">
                    {client.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold leading-snug truncate">{client.name}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {client.project_count}{' '}
                    {client.project_count === 1 ? t('project') : t('projects')}
                  </Badge>
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/clients/${client.id}`}>{t('View')}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleEditClient(client.id)}>
                    {t('Edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDeletePrompt(client)}
                  >
                    {t('Delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Contact details */}
            {(client.email || client.phone) && (
              <div className="space-y-1 text-sm text-muted-foreground">
                {client.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a href={`tel:${client.phone}`} className="hover:underline">
                      {client.phone}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add client card — always trailing */}
        <button
          onClick={handleAddClient}
          className="rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/20 transition-colors flex flex-col items-center justify-center gap-3 min-h-[140px] p-6 text-muted-foreground group"
        >
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full gradient-brand shadow-glow-brand group-hover:scale-105 transition-transform">
            <Plus className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-medium">
            {clients.length === 0 ? t('Add your first client') : t('Add client')}
          </span>
        </button>
      </div>

      <ClientSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        client={editingClient}
        companyId={companyId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Client')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingClient && deletingClient.projectCount > 0
                ? `"${deletingClient.name}" has ${deletingClient.projectCount} project(s). Deleting will remove the client association from those projects. ${t('This action cannot be undone')}.`
                : deletingClient
                  ? `${t('Are you sure?')} ${t('This action cannot be undone')}.`
                  : ''}
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
