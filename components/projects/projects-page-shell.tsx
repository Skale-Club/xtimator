'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { T } from '@/components/i18n/t'
import { cn } from '@/lib/utils'
import { ProjectRowActions } from '@/components/projects/project-row-actions'
import { ProjectTable } from '@/components/projects/project-table'
import type { ProjectListRow, ProjectListStatus } from '@/lib/queries/project'
import type { ClientWithCount } from '@/lib/queries/clients'

const ALL_CLIENTS = '__all__'

interface Props {
  status: ProjectListStatus
  clientId: string | null
  currencyCode: string
  projects: ProjectListRow[]
  clients: ClientWithCount[]
}

export function ProjectsPageShell({
  status,
  clientId,
  currencyCode,
  projects,
  clients,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function pushQuery(next: { status?: ProjectListStatus; client?: string | null }) {
    const params = new URLSearchParams()
    const s = next.status ?? status
    const c = next.client === undefined ? clientId : next.client
    if (s !== 'active') params.set('status', s)
    if (c) params.set('client', c)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `/projects?${qs}` : '/projects'))
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={status}
            onValueChange={(v) => pushQuery({ status: v as ProjectListStatus })}
          >
            <TabsList>
              <TabsTrigger value="active">
                <T>Active</T>
              </TabsTrigger>
              <TabsTrigger value="archived">
                <T>Archived</T>
              </TabsTrigger>
              <TabsTrigger value="trash">
                <T>Trash</T>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={clientId ?? ALL_CLIENTS}
            onValueChange={(v) => pushQuery({ client: v === ALL_CLIENTS ? null : v })}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}>
                <T>All clients</T>
              </SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            <T text={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`} />
          </p>
        </div>
        <Button variant="primary" asChild>
          <Link href="?modal=new-project">
            <FolderPlus className="mr-2 h-4 w-4" />
            <T>New project</T>
          </Link>
        </Button>
      </header>

      <div aria-busy={isPending} className={cn(isPending && 'opacity-60')}>
        <ProjectTable<ProjectListRow>
          projects={projects}
          fallbackCurrencyCode={currencyCode}
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
