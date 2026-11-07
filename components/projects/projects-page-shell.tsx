'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
import { ListPage } from '@/components/ui/list-page'
import { ProjectRowActions } from '@/components/projects/project-row-actions'
import { ProjectTable } from '@/components/projects/project-table'
import type { ProjectListRow, ProjectListStatus } from '@/lib/queries/project'
import type { ClientDetail, ClientWithCount } from '@/lib/queries/clients'

const ALL_CLIENTS = '__all__'

// Server-side views (?status=): they pick which projects load, so they are
// controlled tabs, not filters, and "Clear filters" leaves them alone.
const VIEW_TABS: ReadonlyArray<{ value: ProjectListStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'trash', label: 'Trash' },
]

interface Props {
  status: ProjectListStatus
  clientId: string | null
  currencyCode: string
  companyId: string
  projects: ProjectListRow[]
  clients: ClientDetail[]
}

/** "All clients ▾" picker. One instance per placement, each with its own open state. */
function ClientFilter({ clients, clientId, onChange, fullWidth }: {
  clients: ClientWithCount[]
  clientId: string | null
  onChange: (clientId: string | null) => void
  fullWidth?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = clientId ? clients.find((c) => c.id === clientId) : null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            TOOLBAR_CONTROL,
            'justify-between font-normal',
            fullWidth ? 'w-full' : 'max-w-[200px]',
            selected && 'border-primary/40 text-primary',
          )}
        >
          <UserRound className="size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{selected?.name ?? t('All clients')}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(260px,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('Search clients...')} />
          <CommandList>
            <CommandEmpty>{t('No clients found.')}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={ALL_CLIENTS} onSelect={() => { onChange(null); setOpen(false) }}>
                <Check className={cn('mr-2 size-3.5', !clientId ? 'opacity-100' : 'opacity-0')} />
                {t('All clients')}
              </CommandItem>
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.id}`}
                  onSelect={() => { onChange(client.id); setOpen(false) }}
                >
                  <Check className={cn('mr-2 size-3.5', clientId === client.id ? 'opacity-100' : 'opacity-0')} />
                  {client.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ProjectsPageShell({
  status,
  clientId,
  currencyCode,
  companyId,
  projects,
  clients,
}: Props) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()

  function pushQuery(next: { status?: ProjectListStatus; client?: string | null }) {
    // Start from the live URL so the list's own params (q, sort) survive a
    // view or client change; the page goes back to 1 because the rows change.
    const params = new URLSearchParams(window.location.search)
    const s = next.status ?? status
    const c = next.client === undefined ? clientId : next.client
    if (s !== 'active') params.set('status', s)
    else params.delete('status')
    if (c) params.set('client', c)
    else params.delete('client')
    params.delete('page')
    const qs = params.toString()
    startTransition(() => router.push(qs ? `/projects?${qs}` : '/projects'))
  }

  const selectedClient = clientId ? clients.find((c) => c.id === clientId) : null
  // A client id that no longer exists (deleted client, old link) still filters
  // the server query, so it must still show as a removable filter.
  const clientChipLabel = clientId ? selectedClient?.name ?? t('Unknown client') : null

  return (
    <ListPage>
      <div aria-busy={isPending} className={cn('transition-opacity', isPending && 'opacity-60')}>
        <ProjectTable<ProjectListRow>
          viewTabs={VIEW_TABS}
          viewValue={status}
          onViewChange={(value) => pushQuery({ status: value as ProjectListStatus })}
          filters={(placement) => (
            placement === 'sheet' ? (
              <>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Client')}</h3>
                <ClientFilter clients={clients} clientId={clientId} onChange={(id) => pushQuery({ client: id })} fullWidth />
              </>
            ) : (
              <ClientFilter clients={clients} clientId={clientId} onChange={(id) => pushQuery({ client: id })} />
            )
          )}
          activeFilters={clientChipLabel ? [{ key: 'client', label: clientChipLabel, onRemove: () => pushQuery({ client: null }) }] : []}
          onClearFilters={() => { if (clientId) pushQuery({ client: null }) }}
          pageSize={20}
          projects={projects}
          fallbackCurrencyCode={currencyCode}
          companyId={companyId}
          editingClients={clients}
          emptyTitle={
            clientId
              ? 'No projects for this client here'
              : status === 'active'
                ? 'No projects yet'
                : status === 'archived'
                  ? 'No archived projects'
                  : 'Trash is empty'
          }
          emptyDescription={
            clientId
              ? 'Pick another client or clear the filter.'
              : status === 'active'
                ? 'Create your first project to get started.'
                : status === 'archived'
                  ? 'Archived projects appear here.'
                  : 'Soft-deleted projects appear here for 30 days before being permanently removed.'
          }
          emptyActionLabel={status === 'active' && !clientId ? 'Create project' : undefined}
          emptyActionHref={status === 'active' && !clientId ? '?modal=new-project' : undefined}
          renderActions={(project) => (
            <ProjectRowActions
              projectId={project.id}
              projectName={project.name}
              status={status}
            />
          )}
        />
      </div>
    </ListPage>
  )
}
