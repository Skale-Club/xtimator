'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users, Search, MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { EmptyState } from '@/components/dashboard/empty-state'
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
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientDetail | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState<{
    id: string
    name: string
    projectCount: number
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    )
  }, [clients, search])

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
    setDeletingClient({
      id: client.id,
      name: client.name,
      projectCount: client.project_count,
    })
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

  // Empty state: no clients at all
  if (clients.length === 0) {
    return (
      <>
        <header className="flex items-center justify-between">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
            {t('Clients')}
          </h1>
        </header>
        <EmptyState
          icon={Users}
          title={t('No clients yet')}
          description={t('Add your first client to get started')}
          actionLabel={t('Add Client')}
          onAction={handleAddClient}
        />
        <ClientSheet
          open={sheetOpen}
          onOpenChange={handleSheetChange}
          client={editingClient}
          companyId={companyId}
        />
      </>
    )
  }

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
          {t('Clients')}
        </h1>
        <Button variant="primary" onClick={handleAddClient}>
          <Plus className="h-4 w-4 mr-2" />
          {t('Add Client')}
        </Button>
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('Search clients...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* No search results */}
      {filtered.length === 0 && clients.length > 0 && (
        <EmptyState
          icon={Search}
          title={t('No clients match your search')}
          description={t('Try a different search term')}
          onClearFilter={() => setSearch('')}
        />
      )}

      {/* Desktop table */}
      {filtered.length > 0 && (
        <div className="hidden md:block rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Name')}</TableHead>
                <TableHead>{t('Email')}</TableHead>
                <TableHead>{t('Phone')}</TableHead>
                <TableHead>{t('Projects')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <Avatar className="h-8 w-8">
                        {client.logo_url && (
                          <AvatarImage src={client.logo_url} alt={client.name} />
                        )}
                        <AvatarFallback className="text-xs">
                          {client.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{client.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email || '---'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.phone
                      ? <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>
                      : '---'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{client.project_count}</Badge>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Mobile card list */}
      {filtered.length > 0 && (
        <div className="md:hidden space-y-3">
          {filtered.map((client) => (
            <Card key={client.id}>
              <CardContent className="flex items-center justify-between p-4">
                <Link
                  href={`/clients/${client.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {client.logo_url && (
                      <AvatarImage src={client.logo_url} alt={client.name} />
                    )}
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
          ))}
        </div>
      )}

      {/* Client Sheet (create/edit) */}
      <ClientSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        client={editingClient}
        companyId={companyId}
      />

      {/* Delete Confirmation Dialog */}
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
