'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FolderOpen, Loader2, Pencil } from 'lucide-react'
import { DataTable, type ActiveFilter, type Column, type DataTableProps } from '@/components/ui/data-table'
import { ClientSheet } from '@/components/clients/client-sheet'
import { ClientPicker } from '@/components/clients/client-picker'
import { formatMoney } from '@/lib/money/currency'
import { formatDate } from '@/lib/utils/format-date'
import { useTranslation } from '@/lib/i18n/use-translation'
import { pausedHref } from '@/components/billing/paused-estimate-sheet'
import { linkProjectToClient } from '@/lib/actions/project'
import type { ClientDetail } from '@/lib/queries/clients'
import { useBackgroundGeneration } from '@/hooks/use-background-generations'

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

/** Extra item the phone card asks the row menu to show (link or change the
 *  client), since the card itself only opens the project. */
export interface ProjectClientMenuAction {
  label: string
  onSelect: () => void
}

interface ProjectTableProps<TProject extends ProjectTableRow> {
  projects: TProject[]
  renderActions: (project: TProject, extra?: { clientAction?: ProjectClientMenuAction }) => ReactNode
  searchPlaceholder?: string
  /** Client-side status tabs; the first one ("All") shows everything. */
  statusTabs?: ReadonlyArray<{ value: string; label: string }>
  /** Server-side view tabs the caller owns (Projects: Active / Archived). */
  viewTabs?: ReadonlyArray<{ value: string; label: string }>
  viewValue?: string
  onViewChange?: (value: string) => void
  filters?: DataTableProps<TProject>['filters']
  activeFilters?: ActiveFilter[]
  onClearFilters?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  noResultsTitle?: string
  noResultsDescription?: string
  fallbackCurrencyCode?: unknown
  headerRight?: ReactNode
  title?: ReactNode
  pageSize?: number
  actionsHeader?: string
  companyId?: string
  editingClients?: ClientDetail[]
}

function ProjectClientCell({
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
  const { t } = useTranslation()
  return (
    // min-w-0 + the picker's truncate: a long client name ellipsizes in the
    // phone card's meta line instead of wrapping under the date.
    <div className="flex min-w-0 items-center">
      <ClientPicker
        projectId={projectId}
        currentClientId={client?.id ?? null}
        clientName={client?.name ?? null}
        variant="cell"
        align="start"
        onCreateNew={onCreateNew}
      />
      {client && companyId && onEditClient && (
        <button
          onClick={(e) => { e.stopPropagation(); onEditClient(client.id) }}
          // The glyph stays 12px; the padded box (with the negative margin) gives
          // a ~32px tap target without growing the row.
          className="-my-2 -mr-1 inline-flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t('Edit client')}
          aria-label={t('Edit client')}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/**
 * 260927: "Generating estimate" pill for a project whose generation the
 * operator left running (lib/estimate/background-generations.ts). It clears on
 * its own when the app-shell watcher reads the outcome from the journal.
 */
function ProjectGeneratingBadge({ projectId }: { projectId: string }) {
  const generation = useBackgroundGeneration(projectId)
  const { t } = useTranslation()
  if (!generation) return null
  return (
    <span
      className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
      data-testid="project-generating-badge"
    >
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      {t('Generating estimate')}
    </span>
  )
}

function ProjectPaidBadge({ project }: { project: ProjectTableRow }) {
  const { t } = useTranslation()
  if (project.payment_status !== 'paid') return null

  return (
    <span
      title={project.paid_at ? `${t('Paid')} ${formatDate(project.paid_at)}` : t('Paid')}
      className="ml-2 inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
    >
      {t('Paid')}
    </span>
  )
}

export function ProjectTable<TProject extends ProjectTableRow>({
  projects,
  renderActions,
  searchPlaceholder,
  statusTabs,
  viewTabs,
  viewValue,
  onViewChange,
  filters,
  activeFilters,
  onClearFilters,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  noResultsTitle,
  noResultsDescription,
  fallbackCurrencyCode,
  headerRight,
  title,
  pageSize,
  actionsHeader,
  companyId,
  editingClients,
}: ProjectTableProps<TProject>) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientDetail | null>(null)
  const [createClientForProjectId, setCreateClientForProjectId] = useState<string | null>(null)

  function handleEditClient(clientId: string) {
    const client = editingClients?.find((entry) => entry.id === clientId)
    if (!client) {
      toast.error(t('Client not found. Please reload the page.'))
      return
    }
    setEditingClient(client)
    setSheetOpen(true)
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
          {project.status === 'awaiting_credits' && <PausedForCreditsBadge project={project} />}
          <ProjectGeneratingBadge projectId={project.id} />
          <ProjectPaidBadge project={project} />
        </div>
      ),
    },
    {
      key: 'client',
      header: t('Client'),
      cell: (project) => (
        <ProjectClientCell
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
      cell: (project) => renderActions(project),
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
        filterTabs={
          viewTabs?.map((tab) => ({ key: tab.value, label: t(tab.label) })) ??
          statusTabs?.map((tab, index) => ({
            key: tab.value,
            label: t(tab.label),
            match: index === 0 ? undefined : (project: TProject) => project.status === tab.value,
          }))
        }
        filterValue={viewTabs ? viewValue : undefined}
        onFilterChange={viewTabs ? onViewChange : undefined}
        filterTabsLabel={viewTabs ? t('View') : t('Status')}
        filters={filters}
        activeFilters={activeFilters}
        onClearFilters={onClearFilters}
        emptyTitle={emptyTitle ?? t('No projects yet')}
        emptyDescription={emptyDescription ?? t('Create your first project to get started')}
        emptyActionLabel={emptyActionLabel}
        emptyActionHref={emptyActionHref}
        noResultsTitle={noResultsTitle ?? t('No projects match your search')}
        noFilterResultsTitle={t('No projects match your filters')}
        noResultsDescription={noResultsDescription ?? ''}
        emptyIcon={FolderOpen}
        headerRight={headerRight}
        title={title}
        pageSize={pageSize}
        renderMobileCard={(project) => (
          <ProjectTableCard
            key={project.id}
            project={project}
            renderActions={renderActions}
            fallbackCurrencyCode={fallbackCurrencyCode}
            onCreateNew={companyId ? () => setCreateClientForProjectId(project.id) : undefined}
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
            const result = await linkProjectToClient(createClientForProjectId, clientId)
            if (result.error) throw new Error(result.error)
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
  onCreateNew,
}: {
  project: TProject
  renderActions: ProjectTableProps<TProject>['renderActions']
  fallbackCurrencyCode?: unknown
  onCreateNew?: () => void
}) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  // The whole card opens the project. Linking or changing the client lives in
  // the row menu: a tappable client link in the meta line used to swallow taps
  // meant for the card (its padded hit area reached into the title line).
  const clientAction: ProjectClientMenuAction = {
    label: project.client ? t('Change client') : t('Add client'),
    // After the menu has closed and handed focus back, or the picker would
    // read that focus move as an outside interaction and close at once.
    onSelect: () => window.setTimeout(() => setPickerOpen(true), 60),
  }
  return (
    <div className="relative flex items-center gap-2 border-b border-border/50 py-3 last:border-0">
      <Link href={`/projects/${project.id}`} className="absolute inset-0" aria-hidden tabIndex={-1} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{project.name}</span>
          {project.status === 'awaiting_credits' && <PausedForCreditsBadge project={project} />}
          <ProjectGeneratingBadge projectId={project.id} />
          <ProjectPaidBadge project={project} />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {/* nowrap: the date must never break across two lines on a 360px phone */}
          <span className="shrink-0 whitespace-nowrap">
            {formatDate(project.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {project.client && (
            <>
              <span className="shrink-0 text-muted-foreground/30">·</span>
              <span className="min-w-0 truncate">{project.client.name}</span>
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
      <div className="shrink-0 relative z-10">{renderActions(project, { clientAction })}</div>
      <ClientPicker
        projectId={project.id}
        currentClientId={project.client?.id ?? null}
        variant="anchor"
        align="start"
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onCreateNew={onCreateNew}
      />
    </div>
  )
}

/** Credits plan 2026-11-20: the project's capture waits for a top-up; opens the paused sheet. */
function PausedForCreditsBadge({ project }: { project: { id: string; paused_attempt_id?: string } }) {
  const { t } = useTranslation()
  const href = project.paused_attempt_id
    ? pausedHref(project.id, project.paused_attempt_id)
    : `/projects/${project.id}`
  return (
    <Link
      href={href}
      data-testid="paused-for-credits-badge"
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 ml-2 inline-flex shrink-0 items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500 hover:bg-amber-500/15"
    >
      {t('Paused: out of credits')}
    </Link>
  )
}
