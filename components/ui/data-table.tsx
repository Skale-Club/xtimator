'use client'

/**
 * The shared list: header (title + actions), one toolbar (see list-toolbar.tsx),
 * a table on desktop and cards on the phone, and pagination.
 *
 * Robustness rules, each one a bug the previous version had:
 *  - search, tab, sort and page live in the URL (list-url-state.ts), so Back,
 *    reload and shared links restore the view;
 *  - the page is clamped to what exists, so deleting the last row of the last
 *    page lands on the new last page instead of an empty table;
 *  - the toolbar stays visible in every state (it used to disappear, search
 *    box included, when a status tab matched nothing);
 *  - one "Clear filters" resets everything that narrows the list (search, the
 *    tab, and the caller's own filters through onClearFilters);
 *  - the search is trimmed, so a stray space no longer hides one-word names.
 */
import { useEffect, useMemo, useState, type ReactNode, type TouchEventHandler } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search, FolderOpen, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/dashboard/empty-state'
import { useListUrlState } from '@/components/ui/list-url-state'
import {
  ListFilterSummary,
  ListFiltersSheet,
  ListSearch,
  ListSortMenu,
  ListTabs,
  type ActiveFilter,
} from '@/components/ui/list-toolbar'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

export type { ActiveFilter }

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  /** Sort option value for descending order (default when column header is clicked). */
  sortDesc?: string
  /** Sort option value for ascending order (secondary click). */
  sortAsc?: string
}

export interface FilterTab<T> {
  key: string
  label: string
  /** Client-side predicate. Omit on the first ("all") tab, or for server-filtered tabs. */
  match?: (row: T) => boolean
}

export interface DataTableReorder {
  /** The sort option that is the user's own order; reordering exists only while it is active. */
  sortValue: string
  /** Called after a drop with the moved row and the rows now directly above and below it. */
  onMove: (movedKey: string, aboveKey: string | null, belowKey: string | null) => void
  /** Shown instead of grips when the custom sort is on but search or filters narrow the list. */
  disabledHint?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  getRowKey: (row: T) => string
  searchPlaceholder?: string
  searchFn?: (row: T, term: string) => boolean
  sortOptions?: Array<{ value: string; label: string; sort: (a: T, b: T) => number }>
  defaultSort?: string
  /** Status-style tabs. The first tab is the "nothing filtered" default. */
  filterTabs?: Array<FilterTab<T>>
  defaultFilter?: string
  /**
   * Controlled tabs: the caller owns the value (e.g. a server-side view kept in
   * its own URL param). Rows are not filtered client-side, the tab is not
   * written to the URL, and it does not count as a filter for "Clear filters".
   */
  filterValue?: string
  onFilterChange?: (key: string) => void
  /** Label above the tabs in the phone filter sheet. Default "Status". */
  filterTabsLabel?: string
  /**
   * Extra filter controls (e.g. a client picker). Rendered inline on desktop
   * and inside the phone filter sheet; `placement` lets the caller keep
   * separate open state for each copy.
   */
  filters?: (placement: 'toolbar' | 'sheet') => ReactNode
  /** The caller's filters that are currently narrowing the list (chips + count). */
  activeFilters?: ActiveFilter[]
  /** Called by "Clear filters" after search and tabs are reset. */
  onClearFilters?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  emptyAction?: () => void
  /** Shown when the search matches nothing. */
  noResultsTitle?: string
  /** Shown when only tabs/filters (no search) leave nothing. Defaults to noResultsTitle's generic form. */
  noFilterResultsTitle?: string
  noResultsDescription?: string
  emptyIcon?: LucideIcon
  onRowClick?: (row: T) => void
  renderMobileCard?: (row: T) => React.ReactNode
  /** Actions on the right of the header row (e.g. "Add client"). */
  headerRight?: React.ReactNode
  /** Heading on the left of the header row (e.g. "Recent projects"). */
  title?: React.ReactNode
  /** Number of rows per page. Omit to disable pagination (renders all rows). */
  pageSize?: number
  /** Keep search/tab/sort/page in the URL. Default true. */
  persistInUrl?: boolean
  /** Namespaces the URL params when two lists share a page. */
  urlKey?: string
  /**
   * Opt-in drag-and-drop ordering. Active only while the sort equals
   * `reorder.sortValue` and nothing narrows the list (no search, base tab, no
   * filters); then every row is shown (no pagination) and gets a grip.
   */
  reorder?: DataTableReorder
  /** localStorage key that remembers the last chosen sort (the URL still wins). */
  rememberSortKey?: string
}

function readRememberedSort(key: string | undefined): string | null {
  if (!key) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRememberedSort(key: string | undefined, value: string) {
  if (!key) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the sort simply is not remembered.
  }
}

export function DataTable<T>({
  data,
  columns,
  getRowKey,
  searchPlaceholder = 'Search...',
  searchFn,
  sortOptions,
  defaultSort,
  filterTabs,
  defaultFilter,
  filterValue,
  onFilterChange,
  filterTabsLabel,
  filters,
  activeFilters = [],
  onClearFilters,
  emptyTitle = 'No items',
  emptyDescription = '',
  emptyActionLabel,
  emptyActionHref,
  emptyAction,
  noResultsTitle = 'No results match your filters',
  noFilterResultsTitle = 'No results match your filters',
  noResultsDescription = '',
  emptyIcon,
  onRowClick,
  renderMobileCard,
  headerRight,
  title,
  pageSize,
  persistInUrl = true,
  urlKey,
  reorder,
  rememberSortKey,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const url = useListUrlState({ enabled: persistInUrl, prefix: urlKey })

  const firstTabKey = filterTabs?.[0]?.key ?? 'all'
  const baseFilter = defaultFilter ?? firstTabKey
  const baseSort = defaultSort ?? sortOptions?.[0]?.value ?? ''
  const tabsControlled = filterValue !== undefined

  // Initial state comes from the URL, validated: an unknown tab or sort (an old
  // link, a typo) falls back to the default instead of showing an empty list.
  const [search, setSearch] = useState(() => url.read('q') ?? '')
  const [internalFilter, setInternalFilter] = useState(() => {
    const fromUrl = url.read('tab')
    return fromUrl && filterTabs?.some((tab) => tab.key === fromUrl) ? fromUrl : baseFilter
  })
  const [activeSort, setActiveSort] = useState(() => {
    const fromUrl = url.read('sort')
    return fromUrl && sortOptions?.some((s) => s.value === fromUrl) ? fromUrl : baseSort
  })
  const [page, setPage] = useState(() => {
    const n = Number.parseInt(url.read('page') ?? '', 10)
    return Number.isFinite(n) && n > 1 ? n : 1
  })
  const activeFilter = tabsControlled ? filterValue : internalFilter

  // Rewrite the URL once with what was actually applied, so an invalid value
  // (an old link, a typo) doesn't stay in the address bar and get shared.
  useEffect(() => {
    // The remembered sort is read after mount (localStorage does not exist on
    // the server render, so reading it in the initial state would mismatch).
    let sort = activeSort
    const urlSort = url.read('sort')
    if (!(urlSort && sortOptions?.some((s) => s.value === urlSort))) {
      const remembered = readRememberedSort(rememberSortKey)
      if (remembered && remembered !== activeSort && sortOptions?.some((s) => s.value === remembered)) {
        sort = remembered
        setActiveSort(remembered)
      }
    }
    url.write({
      q: search.trim() || null,
      tab: tabsControlled || internalFilter === baseFilter ? null : internalFilter,
      sort: sort === baseSort ? null : sort,
    })
    // Mount only: later changes write through the update functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const term = search.trim().toLowerCase()
  const tabIsFilter = !tabsControlled && !!filterTabs?.length && activeFilter !== firstTabKey
  const isFiltered = term !== '' || tabIsFilter || activeFilters.length > 0

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
    url.write({ q: value.trim() || null, page: null })
  }

  function updateSort(value: string) {
    setActiveSort(value)
    writeRememberedSort(rememberSortKey, value)
    setPage(1)
    url.write({ sort: value === baseSort ? null : value, page: null })
  }

  function updateFilter(value: string) {
    setPage(1)
    if (tabsControlled) {
      url.write({ page: null })
      onFilterChange?.(value)
      return
    }
    setInternalFilter(value)
    url.write({ tab: value === baseFilter ? null : value, page: null })
    onFilterChange?.(value)
  }

  function updatePage(value: number) {
    setPage(value)
    url.write({ page: value > 1 ? String(value) : null })
  }

  function clearFilters() {
    setSearch('')
    setPage(1)
    if (!tabsControlled) setInternalFilter(firstTabKey)
    url.write({ q: null, page: null, ...(tabsControlled ? {} : { tab: null }) })
    onClearFilters?.()
  }

  function toggleColumnSort(col: Column<T>) {
    if (!col.sortAsc && !col.sortDesc) return
    const desc = col.sortDesc ?? ''
    const asc = col.sortAsc ?? ''
    updateSort(activeSort === desc ? asc : desc)
  }

  const displayData = useMemo(() => {
    let result = data

    if (term && searchFn) {
      result = result.filter((row) => searchFn(row, term))
    }

    if (!tabsControlled && filterTabs && activeFilter !== firstTabKey) {
      const tab = filterTabs.find((tb) => tb.key === activeFilter)
      if (tab?.match) result = result.filter(tab.match)
    }

    if (sortOptions) {
      const sortOption = sortOptions.find((s) => s.value === activeSort)
      if (sortOption) result = [...result].sort(sortOption.sort)
    }

    return result
  }, [data, term, activeFilter, activeSort, searchFn, filterTabs, sortOptions, tabsControlled, firstTabKey])

  const totalPages = pageSize ? Math.max(1, Math.ceil(displayData.length / pageSize)) : 1
  // Clamp: after a delete (or an old link) the stored page may not exist anymore.
  const currentPage = Math.min(Math.max(1, page), totalPages)
  useEffect(() => {
    if (page !== currentPage) {
      setPage(currentPage)
      url.write({ page: currentPage > 1 ? String(currentPage) : null })
    }
  }, [page, currentPage, url])

  // Reordering: only on the custom sort, with nothing narrowing the list.
  const customSortOn = !!reorder && activeSort === reorder.sortValue
  const reorderActive = customSortOn && !isFiltered && activeFilter === baseFilter
  const showReorderHint = customSortOn && !reorderActive && !!reorder?.disabledHint

  const paginatedData =
    pageSize && !reorderActive
      ? displayData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : displayData

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const rowKeys = useMemo(() => displayData.map((row) => getRowKey(row)), [displayData, getRowKey])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!reorder || !over || active.id === over.id) return
    const from = rowKeys.indexOf(String(active.id))
    const to = rowKeys.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(rowKeys, from, to)
    reorder.onMove(next[to], next[to - 1] ?? null, next[to + 1] ?? null)
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const tabOptions = filterTabs?.map((tab) => ({ value: tab.key, label: tab.label })) ?? []
  const sortMenuOptions = sortOptions?.map((s) => ({ value: s.value, label: s.label })) ?? []
  const hasTabs = tabOptions.length > 0
  const hasSort = sortMenuOptions.length > 0
  // Searching an empty list is pointless; keep the box while a term is set so it can be cleared.
  const showSearch = !!searchFn && (data.length > 0 || term !== '')
  const tabChip: ActiveFilter[] = tabIsFilter
    ? [{ key: '__tab', label: tabOptions.find((o) => o.value === activeFilter)?.label ?? activeFilter, onRemove: () => updateFilter(firstTabKey) }]
    : []
  const chips = [...tabChip, ...activeFilters]
  const sheetHasContent = hasTabs || hasSort || !!filters

  // Search, sort and the phone Filters button: the part every list has.
  const hasControls = showSearch || hasTabs || hasSort || !!filters
  const searchAndSort = (
    <>
      {showSearch && (
        <ListSearch
          className="min-w-0 flex-1 lg:ml-auto lg:max-w-64"
          value={search}
          onChange={updateSearch}
          placeholder={searchPlaceholder}
        />
      )}
      {hasSort && data.length > 1 && (
        <ListSortMenu className="hidden lg:inline-flex" options={sortMenuOptions} value={activeSort} onChange={updateSort} />
      )}
      {sheetHasContent && (
        <ListFiltersSheet
          className={cn('lg:hidden', !showSearch && 'ml-auto')}
          tabs={hasTabs ? tabOptions : undefined}
          tabValue={activeFilter}
          onTabChange={updateFilter}
          tabsLabel={filterTabsLabel}
          sortOptions={hasSort && data.length > 1 ? sortMenuOptions : undefined}
          sortValue={activeSort}
          onSortChange={updateSort}
          extraFilters={filters?.('sheet')}
          activeCount={chips.length}
          resultCount={displayData.length}
          onClear={clearFilters}
        />
      )}
    </>
  )

  // A list without tabs or extra filters (Clients) gets a single row on
  // desktop: title, search, sort, actions. On a phone the controls wrap to
  // their own full-width line under the title.
  const singleRow = !hasTabs && !filters && !!(title || headerRight)

  const header = singleRow ? (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
      <div className="min-h-9 min-w-0 flex-1 content-center lg:flex-none">{title}</div>
      {hasControls && (
        <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto lg:flex-1 lg:justify-end">
          {searchAndSort}
        </div>
      )}
      {headerRight && <div className="flex shrink-0 items-center gap-2">{headerRight}</div>}
    </div>
  ) : (title || headerRight) ? (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <div className="min-w-0">{title}</div>
      {headerRight && <div className="flex shrink-0 items-center gap-2">{headerRight}</div>}
    </div>
  ) : null

  const toolbar = !singleRow && hasControls ? (
    <div className="flex items-center gap-2">
      {hasTabs && (
        <ListTabs className="hidden shrink-0 lg:flex" options={tabOptions} value={activeFilter} onChange={updateFilter} />
      )}
      {filters && <div className="hidden shrink-0 items-center gap-2 lg:flex">{filters('toolbar')}</div>}
      {searchAndSort}
    </div>
  ) : null

  // Empty data state (no items at all — or none in this server-side view)
  if (data.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        {toolbar}
        <EmptyState
          icon={emptyIcon ?? FolderOpen}
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          actionHref={emptyActionHref}
          onAction={emptyAction}
          onClearFilter={isFiltered ? clearFilters : undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      {toolbar}
      {isFiltered && displayData.length > 0 && (
        <ListFilterSummary chips={chips} shown={displayData.length} total={data.length} onClear={clearFilters} />
      )}
      {showReorderHint && (
        <p className="text-xs text-muted-foreground" data-testid="reorder-disabled-hint">
          {reorder?.disabledHint}
        </p>
      )}

      {displayData.length === 0 ? (
        // Its own "Clear filters" button resets everything; the Filters badge
        // still says how many are on.
        <EmptyState
          icon={Search}
          title={term ? noResultsTitle : noFilterResultsTitle}
          description={noResultsDescription}
          onClearFilter={clearFilters}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden min-w-0 md:block">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {reorderActive && <TableHead className="w-8 px-1" aria-label={t('Drag to reorder')} />}
                    {columns.map((col) => {
                      const isSortable = col.sortAsc !== undefined || col.sortDesc !== undefined
                      const isActiveDesc = activeSort === col.sortDesc
                      const isActiveAsc = activeSort === col.sortAsc
                      return (
                        <TableHead
                          key={col.key}
                          className={cn(col.className, isSortable && 'cursor-pointer select-none')}
                          onClick={isSortable ? () => toggleColumnSort(col) : undefined}
                          aria-sort={isActiveDesc ? 'descending' : isActiveAsc ? 'ascending' : undefined}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.header}
                            {isSortable && (
                              isActiveDesc ? (
                                <ChevronDown className="h-3.5 w-3.5 text-foreground" />
                              ) : isActiveAsc ? (
                                <ChevronUp className="h-3.5 w-3.5 text-foreground" />
                              ) : (
                                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                              )
                            )}
                          </span>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext items={reorderActive ? rowKeys : []} strategy={verticalListSortingStrategy}>
                    {paginatedData.map((row) =>
                      reorderActive ? (
                        <SortableTableRow
                          key={getRowKey(row)}
                          id={getRowKey(row)}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          gripLabel={t('Drag to reorder')}
                        >
                          {columns.map((col) => (
                            <TableCell key={col.key} className={col.className}>
                              {col.cell(row)}
                            </TableCell>
                          ))}
                        </SortableTableRow>
                      ) : (
                        <TableRow
                          key={getRowKey(row)}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          className={onRowClick ? 'cursor-pointer' : ''}
                        >
                          {columns.map((col) => (
                            <TableCell key={col.key} className={col.className}>
                              {col.cell(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ),
                    )}
                  </SortableContext>
                </TableBody>
              </Table>
            </DndContext>
          </div>

          {/* Mobile cards (sorting lives in the Filters sheet; a long press drags when reordering) */}
          {renderMobileCard && (
            <div className="md:hidden space-y-0">
              {reorderActive ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={rowKeys} strategy={verticalListSortingStrategy}>
                    {paginatedData.map((row) => (
                      <SortableCard key={getRowKey(row)} id={getRowKey(row)}>
                        {renderMobileCard(row)}
                      </SortableCard>
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                paginatedData.map((row) => renderMobileCard(row))
              )}
            </div>
          )}

          {pageSize && !reorderActive && totalPages > 1 && (
            <PaginationBar
              page={currentPage}
              totalPages={totalPages}
              totalItems={displayData.length}
              pageSize={pageSize}
              onPageChange={updatePage}
              ofLabel={t('of')}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Desktop row with a leading grip: mouse and keyboard drag from the grip only. */
function SortableTableRow({
  id,
  onClick,
  gripLabel,
  children,
}: {
  id: string
  onClick?: () => void
  gripLabel: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onClick}
      data-sortable-row={id}
      className={cn(onClick && 'cursor-pointer', isDragging && 'relative z-20 bg-background opacity-80 shadow-md')}
    >
      <TableCell className="w-8 px-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={gripLabel}
          title={gripLabel}
          data-testid={`row-grip-${id}`}
          className="flex size-7 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </TableCell>
      {children}
    </TableRow>
  )
}

/**
 * Phone card: only the touch listener is attached, so a long press (the
 * TouchSensor delay) lifts the card while a tap still opens the project and a
 * swipe still scrolls.
 */
function SortableCard({ id, children }: { id: string; children: ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const { onTouchStart } = (listeners ?? {}) as { onTouchStart?: TouchEventHandler }
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onTouchStart={onTouchStart}
      data-sortable-card={id}
      className={cn(
        'relative select-none bg-background [-webkit-touch-callout:none]',
        isDragging && 'z-20 opacity-80 shadow-md',
      )}
    >
      {children}
    </div>
  )
}

function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  ofLabel,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (p: number) => void
  ofLabel: string
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  // Build visible page list: always show first/last, current ±1, with ellipsis gaps
  function getPages(): (number | 'ellipsis')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const near = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages))
    const sorted = Array.from(near).sort((a, b) => a - b)
    const result: (number | 'ellipsis')[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis')
      result.push(sorted[i])
    }
    return result
  }

  const pages = getPages()
  const cell = 'flex size-9 items-center justify-center rounded-lg text-sm transition-colors md:size-8'

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {from}–{to} {ofLabel} {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(cell, 'text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30')}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* The full page strip can exceed the phone card's content width.
            Keep every page reachable through Previous/Next on small screens. */}
        <span className="px-2 text-xs tabular-nums md:hidden">{page} / {totalPages}</span>
        <div className="hidden items-center gap-1 md:flex">
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`ellipsis-${i}`} className={cn(cell, 'text-muted-foreground')}>
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                onClick={() => onPageChange(p)}
                className={cn(
                  cell,
                  p === page
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(cell, 'text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30')}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
