'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { ProjectSummary } from '@/lib/queries/project'
import { SidebarProjectItem } from './sidebar-project-item'
import { getMoreProjects } from '@/lib/actions/project'

interface SidebarProps {
  branding: {
    appName: string
    faviconUrl: string | null
  }
  company: {
    id: string
    name: string
    logo_url: string | null
    owner_name: string | null
  }
  projects: ProjectSummary[]
  hasMore: boolean
}

export function Sidebar({ branding, company, projects, hasMore }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const faviconUrl = branding.faviconUrl ?? '/favicon.ico'
  const [projectList, setProjectList] = useState<ProjectSummary[]>(projects)
  const [moreAvailable, setMoreAvailable] = useState(hasMore)
  const [page, setPage] = useState(1)
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    startTransition(async () => {
      const nextPage = page + 1
      const result = await getMoreProjects(company.id, nextPage)
      setProjectList((prev) => [...prev, ...result.projects])
      setMoreAvailable(result.hasMore)
      setPage(nextPage)
    })
  }

  return (
    <aside className="hidden md:flex flex-col border-r border-border bg-background w-16 lg:w-64 transition-all">
      {/* Product branding */}
      <div className="flex items-center gap-3 border-b border-border px-3 h-16">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={faviconUrl} alt={branding.appName} />
          <AvatarFallback className="text-sm font-semibold">
            {branding.appName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="hidden lg:block truncate text-sm font-semibold">
          {branding.appName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-[var(--font-weight-medium)] transition-colors duration-150',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                item.primary && !isActive && 'text-primary',
                item.primary && 'border border-primary/20 bg-primary/5 hover:bg-primary/10'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">{t(item.label)}</span>
            </Link>
          )
        })}
      </nav>

      {/* Projects section — hidden in collapsed (w-16) sidebar, visible in expanded (lg:w-64) */}
      <div className="hidden lg:flex flex-col border-t border-border mt-auto">
        {/* Section header */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Projects
          </span>
          <Link
            href="/projects/new"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="New project"
          >
            <Plus className="h-4 w-4" />
          </Link>
        </div>

        {/* Project list or empty state */}
        <div className="flex flex-col gap-0.5 px-2 pb-2 overflow-y-auto max-h-[40vh]">
          {projectList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-xs text-muted-foreground">No projects yet</p>
              <Link
                href="/projects/new"
                className="text-xs text-primary hover:underline"
              >
                Create your first project →
              </Link>
            </div>
          ) : (
            <>
              {projectList.map((project) => (
                <SidebarProjectItem
                  key={project.id}
                  project={project}
                  isActive={
                    pathname === `/projects/${project.id}` ||
                    pathname.startsWith(`/projects/${project.id}/`)
                  }
                />
              ))}
              {moreAvailable && (
                <button
                  onClick={handleLoadMore}
                  disabled={isPending}
                  className="mt-1 w-full rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
