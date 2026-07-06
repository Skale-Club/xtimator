'use client'

import Link from 'next/link'
import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FolderOpen, Pencil, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/ui/data-table'
import { ProjectStatusBadge } from '@/components/projects/project-status-badge'
import { ClientSheet } from '@/components/clients/client-sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { formatMoney } from '@/lib/money/currency'
import { formatDate } from '@/lib/utils/format-date'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createClient } from '@/lib/supabase/client'
import { linkProjectToClient } from '@/lib/actions/project'
import type { ClientDetail } from '@/lib/queries/clients'

export interface ProjectTableRow {
  id: string
  name: string
  project_type?: string | null
  status: string
  total?: number | null
  currency_code?: unknown
  created_at: string
  client?: { id: string; name: string } | null
  payment_status?: 'unpaid' | 'paid' | 'refunded' | null
  paid_at?: string | null
}

interface ProjectTableProps<TProject extends ProjectTableRow> {
  projects: TProject[]
  renderActions: (project: TProject) => ReactNode
  searchPlaceholder?: string
  statusFilters?: readonly string[]
  defaultStatusFilter?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  noResultsTitle?: string
  noResultsDescription?: string
  fallbackCurrencyCode?: unknown
  headerRight?: ReactNode
  headerLeft?: ReactNode
  title?: ReactNode
  pageSize?: number
  actionsHeader?: string
  companyId?: string
}

interface ClientSearchItem {
  id: string
  name: string
  email: string | null
}

function InlineClientPicker({
  projectId,
  client,
  companyId,
  onEditClient,
  onCreateNew,
}: {
  projectId: string
  client: { id: string; name: string } | null | undefined
  companyId?: string
  onEditClient?: (clientId: string) => void
  onCreateNew?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [clients, setClients] = useState<ClientSearchItem[] | null>(null)
  const [, startTransition] = useTransition()

  function loadClients() {
    if (clients !== null) return
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d) ? d : []))
      .catch(() => setClients([]))
  }

  function handleLink(clientId: string) {
    startTransition(async () => {
      const result = await linkProjectToClient(projectId, clientId)
      if ('error' in result) { toast.error(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (client) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{client.name}</span>
        {companyId && onEditClient && (
          <button
            onClick={(e) => { e.stopPropagation(); onEditClient(client.id) }}
            className="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit client"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  const filtered = (clients ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); loadClients() }}
          className="text-muted-foreground/40 hover:text-primary text-sm transition-colors hover:underline underline-offset-2"
        >
          + Add client
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput
            placeholder="Search clients..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {clients === null && <CommandEmpty>Loading...</CommandEmpty>}
            {clients !== null && filtered.length === 0 && <CommandEmpty>No clients found.</CommandEmpty>}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => handleLink(c.id)}>
                    <div className="flex flex-col">
                      <span>{c.name}</span>
                      {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {onCreateNew && (
            <div className="border-t p-1">
              <button
                onClick={() => { setOpen(false); onCreateNew() }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <UserPlus className="h-3.5 w-3.5" />
                New client
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ProjectPaidBadge({ project }: { project: ProjectTableRow }) {
  if (project.payment_status !== 'paid') return null

  return (
    <span
      title={project.paid_at ? `Paid ${formatDate(project.paid_at)}` : 'Paid'}
      className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
    >
      Paid
    </span>
  )
}

export function ProjectTable<TProject extends ProjectTableRow>({
  projects,
  renderActions,
  searchPlaceholder,
  statusFilters,
  defaultStatusFilter,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  noResultsTitle,
  noResultsDescription,
  fallbackCurrencyCode,
  headerRight,
  headerLeft,
  title,
  pageSize,
  actionsHeader,
  companyId,
}: ProjectTableProps<TProject>) {
  const { t } = useTranslation()
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientDetail | null>(null)
  const [createClientForProjectId, setCreateClientForProjectId] = useState<string | null>(null)

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

  function handleSheetChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      setEditingClient(null)
    }
  }

  const columns: Column<TProject>[] = [
    {
      key: 'name',
      header: t('Name'),
      className: 'pl-4',
      sortDesc: 'z-a',
      sortAsc: 'alphabetical',
      cell: (project) => (
        <div className="relative -m-3 -ml-4 flex items-center p-3 pl-4">
          <Link
            href={`/projects/${project.id}`}
            className="absolute inset-0"
            aria-hidden="true"
            tabIndex={-1}
          />
          <span className="font-medium hover:underline">{project.name}</span>
          <ProjectPaidBadge project={project} />
        </div>
      ),
    },
    {
      key: 'client',
      header: t('Client'),
      cell: (project) => (
        <InlineClientPicker
          projectId={project.id}
          client={project.client}
          companyId={companyId}
          onEditClient={companyId ? handleEditClient : undefined}
          onCreateNew={companyId ? () => setCreateClientForProjectId(project.id) : undefined}
        />
      ),
    },
    {
      key: 'total',
      header: t('Total'),
      sortDesc: 'highest',
      sortAsc: 'lowest',
      cell: (project) =>
        formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
    },
    {
      key: 'date',
      header: t('Date'),
      sortDesc: 'newest',
      sortAsc: 'oldest',
      cell: (project) =>
        formatDate(project.created_at, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
    },
    {
      key: 'actions',
      header: actionsHeader ?? t('Actions'),
      className: 'w-[50px]',
      cell: renderActions,
    },
  ]

  return (
    <>
      <DataTable<TProject>
        data={projects}
        columns={columns}
        getRowKey={(project) => project.id}
        searchPlaceholder={searchPlaceholder ?? t('Search projects...')}
        searchFn={(project, term) =>
          project.name.toLowerCase().includes(term) ||
          (project.client?.name?.toLowerCase().includes(term) ?? false) ||
          (project.project_type?.toLowerCase().includes(term) ?? false)
        }
        sortOptions={[
          {
            value: 'newest',
            label: t('Newest'),
            sort: (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          },
          {
            value: 'oldest',
            label: t('Oldest'),
            sort: (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          },
          {
            value: 'highest',
            label: t('Highest Value'),
            sort: (a, b) => (b.total ?? 0) - (a.total ?? 0),
          },
          {
            value: 'lowest',
            label: t('Lowest Value'),
            sort: (a, b) => (a.total ?? 0) - (b.total ?? 0),
          },
          {
            value: 'alphabetical',
            label: t('Alphabetical'),
            sort: (a, b) => a.name.localeCompare(b.name),
          },
          {
            value: 'z-a',
            label: t('Z → A'),
            sort: (a, b) => b.name.localeCompare(a.name),
          },
        ]}
        defaultSort="newest"
        filterTabs={statusFilters?.map((status) => ({
          key: status,
          label: status,
          match: status === 'all' ? undefined : (project: TProject) => project.status === status,
        }))}
        defaultFilter={defaultStatusFilter}
        emptyTitle={emptyTitle ?? t('No projects yet')}
        emptyDescription={emptyDescription ?? t('Create your first project to get started')}
        emptyActionLabel={emptyActionLabel}
        emptyActionHref={emptyActionHref}
        noResultsTitle={noResultsTitle ?? t('No projects match your search')}
        noResultsDescription={noResultsDescription ?? ''}
        emptyIcon={FolderOpen}
        headerLeft={headerLeft}
        headerRight={headerRight}
        title={title}
        pageSize={pageSize}
        renderMobileCard={(project) => (
          <ProjectTableCard
            key={project.id}
            project={project}
            renderActions={renderActions}
            fallbackCurrencyCode={fallbackCurrencyCode}
            companyId={companyId}
            onEditClient={handleEditClient}
          />
        )}
      />
      {companyId && (
        <ClientSheet
          open={sheetOpen}
          onOpenChange={handleSheetChange}
          client={editingClient}
          companyId={companyId}
        />
      )}
      {companyId && createClientForProjectId && (
        <ClientSheet
          open
          onOpenChange={(open) => { if (!open) setCreateClientForProjectId(null) }}
          client={null}
          companyId={companyId}
          onCreated={async (clientId) => {
            await linkProjectToClient(createClientForProjectId, clientId)
            setCreateClientForProjectId(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function ProjectTableCard<TProject extends ProjectTableRow>({
  project,
  renderActions,
  fallbackCurrencyCode,
  companyId,
  onEditClient,
}: {
  project: TProject
  renderActions: (project: TProject) => ReactNode
  fallbackCurrencyCode?: unknown
  companyId?: string
  onEditClient?: (clientId: string) => void
}) {
  return (
    <div className="relative flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <Link href={`/projects/${project.id}`} className="absolute inset-0" aria-hidden tabIndex={-1} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate">{project.name}</span>
          <ProjectPaidBadge project={project} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {project.client?.name && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="flex items-center gap-1">
                {project.client.name}
                {companyId && onEditClient && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditClient(project.client!.id) }}
                    className="inline-flex items-center justify-center rounded p-0.5 hover:bg-muted hover:text-foreground transition-colors"
                    title="Edit client"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="shrink-0 font-semibold text-sm">
        {formatMoney(project.total, project.currency_code ?? fallbackCurrencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </span>
      <div className="shrink-0 relative z-10">{renderActions(project)}</div>
    </div>
  )
}
