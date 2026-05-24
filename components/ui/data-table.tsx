'use client'

import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Search, FolderOpen } from 'lucide-react'
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

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
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
}: DataTableProps<T>) {
  const initialSort = defaultSort ?? sortOptions?.[0]?.value ?? ''
  const initialFilter = defaultFilter ?? filterTabs?.[0]?.key ?? 'all'

  const [search, setSearch] = useState('')
  const [activeSort, setActiveSort] = useState(initialSort)
  const [activeFilter, setActiveFilter] = useState(initialFilter)

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

  // Empty data state (no items at all)
  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? FolderOpen}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        actionHref={emptyActionHref}
        onAction={emptyAction}
      />
    )
  }

  const firstTabKey = filterTabs?.[0]?.key ?? 'all'

  return (
    <div className="space-y-4">
      {/* Controls row: search + sort + filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {sortOptions && sortOptions.length > 0 && (
          <Select value={activeSort} onValueChange={setActiveSort}>
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
                onClick={() => setActiveFilter(tab.key)}
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
            setSearch('')
            setActiveFilter(firstTabKey)
          }}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key} className={col.className}>
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.map((row) => (
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

          {/* Mobile cards */}
          {renderMobileCard && (
            <div className="md:hidden space-y-3">
              {displayData.map((row) => renderMobileCard(row))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
