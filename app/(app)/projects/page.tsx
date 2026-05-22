import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { getProjects } from '@/lib/queries/dashboard'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/dashboard/empty-state'
import { T } from '@/components/i18n/t'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProjectTableRow } from '@/components/dashboard/project-table-row'
import { ProjectCard } from '@/components/dashboard/project-card'

export default async function ProjectsPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const projects = await getProjects(supabase, company.id)

  return (
    <div className="px-6 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <T text={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`} />
        </p>
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
          title="No projects yet"
          description="Create your first project to get started."
          actionLabel="Create project"
          actionHref="?modal=new-project"
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <ProjectTableRow key={project.id} project={project} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
