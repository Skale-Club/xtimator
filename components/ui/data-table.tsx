'use client'

import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search, FolderOpen, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/dashboard/empty-state'
import { cn } from '@/lib/utils'

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

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  getRowKey: (row: T) => string
  searchPlaceholder?: string
  searchFn?: (row: T, term: string) => boolean
  sortOptions?: Array<{ value: string; label: string; sort: (a: T, b: T) => number }>
  defaultSort?: string
  filterTabs?: Array<{ key: string; label: string; match?: (row: T) => boolean }>
  defaultFilter?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
  emptyActionHref?: string
  emptyAction?: () => void
  noResultsTitle?: string
  noResultsDescription?: string
  emptyIcon?: LucideIcon
  onRowClick?: (row: T) => void
  renderMobileCard?: (row: T) => React.ReactNode
  headerRight?: React.ReactNode
  headerLeft?: React.ReactNode
  /** Rendered before the search input on the controls row (e.g. "Recent projects" heading). */
  title?: React.ReactNode
  /** Number of rows per page. Omit to disable pagination (renders all rows). */
  pageSize?: number
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
  emptyTitle = 'No items',
  emptyDescription = '',
  emptyActionLabel,
  emptyActionHref,
  emptyAction,
  noResultsTitle = 'No results match your filters',
  noResultsDescription = '',
  emptyIcon,
  onRowClick,
  renderMobileCard,
  headerRight,
  headerLeft,
  title,
  pageSize,
}: DataTableProps<T>) {
  const initialSort = defaultSort ?? sortOptions?.[0]?.value ?? ''
  const initialFilter = defaultFilter ?? filterTabs?.[0]?.key ?? 'all'

  const [search, setSearch] = useState('')
  const [activeSort, setActiveSort] = useState(initialSort)
  const [activeFilter, setActiveFilter] = useState(initialFilter)
  const [page, setPage] = useState(1)

  // Detect whether any column has column-header sort defined
  const hasColumnSort = columns.some((c) => c.sortAsc !== undefined || c.sortDesc !== undefined)

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateSort(value: string) {
    setActiveSort(value)
    setPage(1)
  }

  function updateFilter(value: string) {
    setActiveFilter(value)
    setPage(1)
  }

  function toggleColumnSort(col: Column<T>) {
    if (!col.sortAsc && !col.sortDesc) return
    const desc = col.sortDesc ?? ''
    const asc = col.sortAsc ?? ''
    updateSort(activeSort === desc ? asc : desc)
  }

  const displayData = useMemo(() => {
    let result = data

    // Search filter
    if (search && searchFn) {
      const term = search.toLowerCase()
      result = result.filter((row) => searchFn(row, term))
    }

    // Tab filter — first tab key means "show all" (no match fn applied)
    const firstTabKey = filterTabs?.[0]?.key ?? 'all'
    if (activeFilter !== firstTabKey && filterTabs) {
      const tab = filterTabs.find((t) => t.key === activeFilter)
      if (tab?.match) {
        result = result.filter(tab.match)
      }
    }

    // Sort
    if (sortOptions) {
      const sortOption = sortOptions.find((s) => s.value === activeSort)
      if (sortOption) {
        result = [...result].sort(sortOption.sort)
      }
    }

    return result
  }, [data, search, activeFilter, activeSort, searchFn, filterTabs, sortOptions])

  const totalPages = pageSize ? Math.ceil(displayData.length / pageSize) : 1
  const paginatedData = pageSize
    ? displayData.slice((page - 1) * pageSize, page * pageSize)
    : displayData

  // Empty data state (no items at all)
  if (data.length === 0) {
    return (
      <div className="space-y-4">
        {(title || headerLeft || headerRight) && (
          <div className="flex flex-wrap items-center gap-2">
            {title}
            {headerLeft}
            {headerRight && <div className="ml-auto">{headerRight}</div>}
          </div>
        )}
        <EmptyState
          icon={emptyIcon ?? FolderOpen}
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          actionHref={emptyActionHref}
          onAction={emptyAction}
        />
      </div>
    )
  }

  const firstTabKey = filterTabs?.[0]?.key ?? 'all'

  return (
    <div className="space-y-4">
      {/* Controls row: title + headerLeft + search + sort (dropdown or column-based) */}
      <div className="flex flex-wrap items-center gap-2">
        {title}
        {/* When headerLeft is present, merge it with search into one bordered control group. */}
        {headerLeft ? (
          <div className={cn(
            'flex min-w-0 h-9 items-stretch overflow-hidden rounded-md border border-input',
            title ? 'ml-auto max-w-full' : 'flex-1',
          )}>
            {headerLeft}
            <div className={cn(
              'relative min-w-[140px]',
              title ? 'w-[220px]' : 'flex-1',
            )}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => updateSearch(e.target.value)}
                className="pl-9 border-0 rounded-none h-full shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        ) : (
          <>
            {headerLeft}
            <div className={cn(
              'relative min-w-[160px]',
              title ? 'ml-auto w-[220px]' : 'flex-1',
            )}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => updateSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </>
        )}
        {/* Only show sort dropdown when no column handles sorting */}
        {!hasColumnSort && sortOptions && sortOptions.length > 0 && (
          <Select value={activeSort} onValueChange={updateSort}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {headerRight && <div className="ml-auto">{headerRight}</div>}

        {/* Filter tabs — inline on the same row */}
        {filterTabs && filterTabs.length > 0 && (
          <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap">
            {filterTabs.map((tab) => (
              <Button
                key={tab.key}
                variant={activeFilter === tab.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateFilter(tab.key)}
                className="capitalize px-2.5 py-1 h-8 text-xs"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Empty search/filter state */}
      {displayData.length === 0 && data.length > 0 ? (
        <EmptyState
          icon={Search}
          title={noResultsTitle}
          description={noResultsDescription}
          onClearFilter={() => {
            updateSearch('')
            updateFilter(firstTabKey)
          }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => {
                    const isSortable = col.sortAsc !== undefined || col.sortDesc !== undefined
                    const isActiveDesc = activeSort === col.sortDesc
                    const isActiveAsc = activeSort === col.sortAsc
                    return (
                      <TableHead
                        key={col.key}
                        className={cn(col.className, isSortable && 'cursor-pointer select-none')}
                        onClick={isSortable ? () => toggleColumnSort(col) : undefined}
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
                {paginatedData.map((row) => (
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
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile sort bar — mirrors column-header sort for small screens */}
          {hasColumnSort && renderMobileCard && (
            <div className="md:hidden flex items-center gap-1 overflow-x-auto pb-0.5">
              <span className="shrink-0 text-xs text-muted-foreground pr-1">Sort:</span>
              {columns.filter((c) => c.sortAsc !== undefined || c.sortDesc !== undefined).map((col) => {
                const isDesc = activeSort === col.sortDesc
                const isAsc = activeSort === col.sortAsc
                const isActive = isDesc || isAsc
                return (
                  <button
                    key={col.key}
                    onClick={() => toggleColumnSort(col)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {col.header}
                    {isActive ? (
                      isDesc
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Mobile cards */}
          {renderMobileCard && (
            <div className="md:hidden space-y-0">
              {paginatedData.map((row) => renderMobileCard(row))}
            </div>
          )}

          {/* Pagination controls */}
          {pageSize && totalPages > 1 && (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={displayData.length}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}

function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (p: number) => void
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

  return (
    <div className="flex items-center justify-between gap-4 pt-1">
      <span className="text-xs text-muted-foreground shrink-0">
        {from}–{to} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="flex h-7 w-7 items-center justify-center text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors',
                p === page
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
