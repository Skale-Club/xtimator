'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/dashboard/empty-state'
import { T } from '@/components/i18n/t'
import { cn } from '@/lib/utils'
import { ProjectRowActions } from '@/components/projects/project-row-actions'
import type { ProjectListRow, ProjectListStatus } from '@/lib/queries/project'
import type { ClientWithCount } from '@/lib/queries/clients'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_COLOR =
  'bg-transparent text-blue-400 border border-blue-500/60'
const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
}
const STATUS_COLOR: Record<string, string> = {
  estimate_ready: 'bg-green-500/15 text-green-400 border border-green-500/50',
}
const ALL_CLIENTS = '__all__'

interface Props {
  status: ProjectListStatus
  clientId: string | null
  projects: ProjectListRow[]
  clients: ClientWithCount[]
}

export function ProjectsPageShell({ status, clientId, projects, clients }: Props) {
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
    <div className="px-6 py-8 space-y-6">
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
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
            <FolderPlus className="h-4 w-4 mr-2" />
            <T>New project</T>
          </Link>
        </Button>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={
            status === 'active'
              ? 'No projects yet'
              : status === 'archived'
                ? 'No archived projects'
                : 'Trash is empty'
          }
          description={
            status === 'active'
              ? 'Create your first project to get started.'
              : status === 'archived'
                ? 'Archived projects appear here.'
                : 'Soft-deleted projects appear here for 30 days before being permanently removed.'
          }
          actionLabel={status === 'active' ? 'Create project' : undefined}
          actionHref={status === 'active' ? '?modal=new-project' : undefined}
        />
      ) : (
        <ul
          aria-busy={isPending}
          className={cn(
            'divide-y divide-border rounded-lg border border-border bg-card overflow-hidden',
            isPending && 'opacity-60'
          )}
        >
          {projects.map((project) => {
            const label = STATUS_LABEL[project.status] ?? IN_PROGRESS_LABEL
            const color = STATUS_COLOR[project.status] ?? IN_PROGRESS_COLOR
            const clientName = project.client?.name
            return (
              <li
                key={project.id}
                className="flex items-center justify-between h-10 px-4 hover:bg-[var(--glass-bg-light)] transition-colors group"
              >
                <Link
                  href={`/projects/${project.id}`}
                  className="flex flex-col min-w-0 flex-1"
                >
                  <span className="text-sm font-medium truncate group-hover:text-foreground">
                    {project.name}
                  </span>
                  {clientName && (
                    <span className="text-xs text-muted-foreground truncate">
                      {clientName}
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      color
                    )}
                  >
                    {label}
                  </span>
                  <ProjectRowActions
                    projectId={project.id}
                    projectName={project.name}
                    status={status}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
