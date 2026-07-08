'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { T } from '@/components/i18n/t'
import { cn } from '@/lib/utils'
import { ProjectRowActions } from '@/components/projects/project-row-actions'
import { ProjectStatusTabs } from '@/components/projects/project-status-tabs'
import { ProjectTable } from '@/components/projects/project-table'
import type { ProjectListRow, ProjectListStatus } from '@/lib/queries/project'
import type { ClientWithCount } from '@/lib/queries/clients'

const ALL_CLIENTS = '__all__'

const STATUS_OPTIONS: ReadonlyArray<{ value: ProjectListStatus; label: ReactNode }> = [
  { value: 'active', label: <T>Active</T> },
  { value: 'archived', label: <T>Archived</T> },
  { value: 'trash', label: <T>Trash</T> },
]

interface Props {
  status: ProjectListStatus
  clientId: string | null
  currencyCode: string
  companyId: string
  projects: ProjectListRow[]
  clients: ClientWithCount[]
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
  const [isPending, startTransition] = useTransition()
  const [clientOpen, setClientOpen] = useState(false)

  function pushQuery(next: { status?: ProjectListStatus; client?: string | null }) {
    const params = new URLSearchParams()
    const s = next.status ?? status
    const c = next.client === undefined ? clientId : next.client
    if (s !== 'active') params.set('status', s)
    if (c) params.set('client', c)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `/projects?${qs}` : '/projects'))
  }

  const filterBar = (
    <>
      {/* Status tabs — transparent so the outer container border shows */}
      <ProjectStatusTabs
        value={status}
        options={STATUS_OPTIONS}
        onValueChange={(nextStatus) => pushQuery({ status: nextStatus })}
      />
      {/* Divider */}
      <div className="w-px bg-border self-stretch shrink-0" />
      {/* Client filter — ghost button, no individual border */}
      <Popover open={clientOpen} onOpenChange={setClientOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-full rounded-none px-3 gap-1.5 text-xs font-normal max-w-[160px]"
          >
            <span className="truncate">
              {clientId
                ? (clients.find((c) => c.id === clientId)?.name ?? 'All clients')
                : 'All clients'}
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search clients..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No clients found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={ALL_CLIENTS}
                  onSelect={() => { pushQuery({ client: null }); setClientOpen(false) }}
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5', !clientId ? 'opacity-100' : 'opacity-0')} />
                  All clients
                </CommandItem>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={client.name}
                    onSelect={() => { pushQuery({ client: client.id }); setClientOpen(false) }}
                  >
                    <Check className={cn('mr-2 h-3.5 w-3.5', clientId === client.id ? 'opacity-100' : 'opacity-0')} />
                    {client.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {/* Divider before search (search lives in DataTable's shared container) */}
      <div className="w-px bg-border self-stretch shrink-0" />
    </>
  )

  return (
    <div className="p-6">
      <div aria-busy={isPending} className={cn(isPending && 'opacity-60')}>
        <ProjectTable<ProjectListRow>
          headerLeft={filterBar}
          pageSize={20}
          projects={projects}
          fallbackCurrencyCode={currencyCode}
          companyId={companyId}
          emptyTitle={
            status === 'active'
              ? 'No projects yet'
              : status === 'archived'
                ? 'No archived projects'
                : 'Trash is empty'
          }
          emptyDescription={
            status === 'active'
              ? 'Create your first project to get started.'
              : status === 'archived'
                ? 'Archived projects appear here.'
                : 'Soft-deleted projects appear here for 30 days before being permanently removed.'
          }
          emptyActionLabel={status === 'active' ? 'Create project' : undefined}
          emptyActionHref={status === 'active' ? '?modal=new-project' : undefined}
          renderActions={(project) => (
            <ProjectRowActions
              projectId={project.id}
              projectName={project.name}
              status={status}
            />
          )}
        />
      </div>
    </div>
  )
}
