import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  draft:          'Draft',
  in_progress:    'In progress',
  estimate_ready: 'Estimate ready',
  sent:           'Sent',
  completed:      'Completed',
}

const STATUS_COLOR: Record<string, string> = {
  draft:          'bg-muted-foreground/30 text-muted-foreground',
  in_progress:    'bg-blue-500/15 text-blue-400',
  estimate_ready: 'bg-amber-500/15 text-amber-400',
  sent:           'bg-green-500/15 text-green-400',
  completed:      'bg-green-700/15 text-green-600',
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {list.length} {list.length === 1 ? 'project' : 'projects'}
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <FolderPlus className="h-4 w-4 mr-2" />
            New project
          </Link>
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 gap-4 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/projects/new">Create project</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
          {list.map((project) => {
            const label = STATUS_LABEL[project.status] ?? project.status
            const color = STATUS_COLOR[project.status] ?? STATUS_COLOR.draft
            const clientName = (project.client as { name?: string } | null)?.name

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between px-5 py-4 bg-card hover:bg-accent/50 transition-colors group"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium truncate group-hover:text-foreground">
                    {project.name}
                  </span>
                  {clientName && (
                    <span className="text-xs text-muted-foreground truncate">{clientName}</span>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
