'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users, Plus, MoreHorizontal } from 'lucide-react'
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
import { Card, CardContent } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
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

  const columns: Column<ClientWithCount>[] = [
    {
      key: 'name',
      header: t('Name'),
      cell: (client) => (
        <Link href={`/clients/${client.id}`} className="flex items-center gap-3 hover:underline">
          <Avatar className="h-8 w-8 shrink-0">
            {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
            <AvatarFallback className="text-xs">
              {client.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{client.name}</span>
        </Link>
      ),
    },
    {
      key: 'email',
      header: t('Email'),
      cell: (client) => (
        <span className="text-muted-foreground">{client.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: t('Phone'),
      cell: (client) =>
        client.phone ? (
          <a href={`tel:${client.phone}`} className="text-muted-foreground hover:underline">
            {client.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">{'—'}</span>
        ),
    },
    {
      key: 'projects',
      header: t('Projects'),
      cell: (client) => <Badge variant="secondary">{client.project_count}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-[50px]',
      cell: (client) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
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
      ),
    },
  ]

  return (
    <>
      <DataTable<ClientWithCount>
        data={clients}
        columns={columns}
        getRowKey={(c) => c.id}
        searchPlaceholder={t('Search clients...')}
        searchFn={(c, term) =>
          c.name.toLowerCase().includes(term) ||
          (c.email?.toLowerCase().includes(term) ?? false) ||
          (c.phone?.toLowerCase().includes(term) ?? false)
        }
        sortOptions={[
          { value: 'az', label: t('A → Z'), sort: (a, b) => a.name.localeCompare(b.name) },
          { value: 'za', label: t('Z → A'), sort: (a, b) => b.name.localeCompare(a.name) },
          {
            value: 'most',
            label: t('Most projects'),
            sort: (a, b) => b.project_count - a.project_count,
          },
        ]}
        defaultSort="az"
        emptyIcon={Users}
        emptyTitle={t('No clients yet')}
        emptyDescription={t('Add your first client to get started')}
        headerRight={
          <Button variant="primary" onClick={handleAddClient}>
            <Plus className="h-4 w-4 mr-2" />
            {t('Add Client')}
          </Button>
        }
        renderMobileCard={(client) => (
          <Card key={client.id}>
            <CardContent className="flex items-center justify-between p-4">
              <Link
                href={`/clients/${client.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  {client.logo_url && <AvatarImage src={client.logo_url} alt={client.name} />}
                  <AvatarFallback className="text-sm">
                    {client.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">{client.name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {client.email || '---'}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary">{client.project_count}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
            </CardContent>
          </Card>
        )}
      />

      {/* Client Sheet (create / edit) */}
      <ClientSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        client={editingClient}
        companyId={companyId}
      />

      {/* Delete confirmation */}
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
