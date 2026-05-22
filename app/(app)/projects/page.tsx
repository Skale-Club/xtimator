import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/dashboard/empty-state'
import { cn } from '@/lib/utils'
import { T } from '@/components/i18n/t'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_COLOR =
  'bg-transparent text-blue-400 border border-blue-500/60'

const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
}

const STATUS_COLOR: Record<string, string> = {
  estimate_ready:
    'bg-green-500/15 text-green-400 border border-green-500/50',
}

export default async function ProjectsPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, created_at, client:clients(name)')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })

  const list = projects ?? []

  return (
    <div className="px-6 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <T text={`${list.length} ${list.length === 1 ? 'project' : 'projects'}`} />
        </p>
        <Button variant="primary" asChild>
          <Link href="?modal=new-project">
            <FolderPlus className="h-4 w-4 mr-2" />
            <T>New project</T>
          </Link>
        </Button>
      </header>

      {list.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first project to get started."
          actionLabel="Create project"
          actionHref="?modal=new-project"
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
          {list.map((project) => {
            const label = STATUS_LABEL[project.status] ?? IN_PROGRESS_LABEL
            const color = STATUS_COLOR[project.status] ?? IN_PROGRESS_COLOR
            const clientName = (project.client as { name?: string } | null)?.name

            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between h-10 px-4 hover:bg-[var(--glass-bg-light)] transition-colors group"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate group-hover:text-foreground">
                      {project.name}
                    </span>
                    {clientName && (
                      <span className="text-xs text-muted-foreground truncate">
                        {clientName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground">
                      {new Date(project.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', color)}>
                      {label}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
