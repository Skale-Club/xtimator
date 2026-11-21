'use client'

// Universal side panel: the one list-of-sections sidebar for the app.
//
//   SidePanelList         the list body (groups, rows, filter, reorder, footer)
//   SidePanelColumn       desktop column: collapsible to an icon rail, own scroll
//   SidePanelMobilePicker phone: a button that opens the same list in a bottom sheet
//
// No business logic: callers map their data to SidePanelGroup[] and handle
// onSelect. Active style and tokens follow the design system (section 9.4 of
// app/admin/design-system/page.tsx): a glass tint plus a 1.5px brand bar.
// No backdrop blur anywhere: a blurred tall element froze phone scrolling.

import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode, type TouchEventHandler } from 'react'
import Link from 'next/link'
import { ChevronDown, GripVertical, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
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

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/i18n/use-translation'

// ── Types ────────────────────────────────────────────────────────────────

export interface SidePanelItem {
  key: string
  label: string
  icon?: ElementType
  count?: number
  /** Link mode: renders a next/link anchor (aria-current="page" when active). */
  href?: string
  /** Tooltip/title override; defaults to the full label. */
  title?: string
}

export interface SidePanelGroup {
  key: string
  /** Optional small uppercase heading above the group's rows. */
  label?: string
  items: SidePanelItem[]
}

export interface SidePanelReorder {
  /** Called after a drop with the reorderable keys in their new order (fixedKeys excluded). */
  onReorder: (orderedKeys: string[]) => void
  /** Rows that never move and cannot be dragged (e.g. "All", "Uncategorized"). */
  fixedKeys?: string[]
}

// ── Style tokens ─────────────────────────────────────────────────────────

const ROW_BASE =
  'relative flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] px-3 text-left text-sm transition-colors md:min-h-9'
const ROW_ACTIVE =
  "bg-[var(--glass-bg-light)] font-medium text-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[1.5px] before:rounded-full before:bg-[image:var(--gradient-brand)] before:content-['']"
const ROW_IDLE =
  'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground'

const SQUARE_BASE =
  'relative flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[11px] font-semibold uppercase transition-colors'

// ── Helpers ──────────────────────────────────────────────────────────────

const MONOGRAM_SKIP = new Set(['&', 'and', 'e', 'y'])

/**
 * Two-letter monogram for a collapsed rail: first letters of the first two
 * words (ignoring "&", "and", "e", "y"); a single word gives its first two letters.
 */
export function sidePanelMonogram(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter((w) => w && !MONOGRAM_SKIP.has(w.toLowerCase()))
  if (words.length === 0) return label.trim().slice(0, 2).toUpperCase()
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase()
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase()
}

function tooltipText(item: SidePanelItem): string {
  const label = item.title ?? item.label
  return item.count === undefined ? label : `${label} · ${item.count}`
}

/** Collapsed state of one panel, persisted in localStorage (`side-panel:<id>:collapsed`). */
export function useSidePanelCollapsed(id: string): [boolean, () => void] {
  const key = `side-panel:${id}:collapsed`
  const [collapsed, setCollapsed] = useState(false)

  // Read after mount so the server render and first client render agree.
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === '1') setCollapsed(true)
    } catch {
      /* storage blocked: stay expanded */
    }
  }, [key])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [key])

  return [collapsed, toggle]
}

// ── Row ──────────────────────────────────────────────────────────────────

interface RowProps {
  item: SidePanelItem
  active: boolean
  onSelect?: (key: string) => void
  testId?: string
}

function RowBody({ item, active }: { item: SidePanelItem; active: boolean }) {
  const Icon = item.icon
  return (
    <>
      {Icon && <Icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden />}
      <span className="min-w-0 flex-1 truncate" title={item.title ?? item.label}>
        {item.label}
      </span>
      {item.count !== undefined && (
        <span className={cn('shrink-0 text-xs tabular-nums', active ? 'text-foreground' : 'text-muted-foreground')}>
          {item.count}
        </span>
      )}
    </>
  )
}

function RowControl({ item, active, onSelect, testId, className }: RowProps & { className?: string }) {
  const cls = cn(ROW_BASE, active ? ROW_ACTIVE : ROW_IDLE, className)
  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={() => onSelect?.(item.key)}
        aria-current={active ? 'page' : undefined}
        data-testid={testId}
        className={cls}
      >
        <RowBody item={item} active={active} />
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSelect?.(item.key)}
      aria-current={active ? 'true' : undefined}
      data-testid={testId}
      className={cls}
    >
      <RowBody item={item} active={active} />
    </button>
  )
}

function PlainRow(props: RowProps) {
  return (
    <li>
      <RowControl {...props} />
    </li>
  )
}

function SortableRow(props: RowProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.key,
  })
  // The grip takes mouse and keyboard; the whole row takes a long press on
  // touch, so a plain tap still selects and a swipe still scrolls.
  const { onTouchStart, ...gripListeners } = (listeners ?? {}) as Record<string, unknown>
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onTouchStart={onTouchStart as TouchEventHandler | undefined}
      className={cn('group/row relative select-none [-webkit-touch-callout:none]', isDragging && 'z-20 opacity-80 shadow-md')}
      data-sortable-row={props.item.key}
    >
      <RowControl {...props} className="md:pl-7" />
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...gripListeners}
        aria-label={`${t('Drag to reorder')}: ${props.item.label}`}
        title={t('Drag to reorder')}
        data-testid={`side-panel-grip-${props.item.key}`}
        className="absolute left-1 top-1/2 hidden size-6 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 md:flex"
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}

// ── List ─────────────────────────────────────────────────────────────────

export interface SidePanelListProps {
  groups: SidePanelGroup[]
  activeKey?: string | null
  /** Called with the item key (button mode and, as a side effect, link mode). */
  onSelect?: (key: string) => void
  /** Rows hidden while the filter has text (e.g. the "All" row). */
  pinnedKeys?: string[]
  /** Show the filter box once the total item count reaches this (default 7). */
  filterThreshold?: number
  filterLabel?: string
  noMatchesLabel?: string
  footer?: ReactNode
  reorder?: SidePanelReorder
  /** data-testid for a row, e.g. (k) => `category-filter-${k}`. */
  getItemTestId?: (key: string) => string
  className?: string
}

export function SidePanelList({
  groups,
  activeKey,
  onSelect,
  pinnedKeys = [],
  filterThreshold = 7,
  filterLabel,
  noMatchesLabel,
  footer,
  reorder,
  getItemTestId,
  className,
}: SidePanelListProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtering = q.length > 0
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const showFilter = total >= filterThreshold

  const select = (key: string) => {
    setQuery('')
    onSelect?.(key)
  }

  const fixed = useMemo(() => new Set(reorder?.fixedKeys ?? []), [reorder?.fixedKeys])
  const canReorder = !!reorder && !filtering

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: filtering
            ? g.items.filter((i) => !pinnedKeys.includes(i.key) && i.label.toLowerCase().includes(q))
            : g.items,
        }))
        .filter((g) => g.items.length > 0 || !filtering),
    [groups, filtering, pinnedKeys, q],
  )
  const anyVisible = visibleGroups.some((g) => g.items.length > 0)

  const sortableKeys = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => !fixed.has(i.key)).map((i) => i.key),
    [groups, fixed],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !reorder) return
    const from = sortableKeys.indexOf(String(active.id))
    const to = sortableKeys.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    reorder.onReorder(arrayMove(sortableKeys, from, to))
  }

  const renderRow = (item: SidePanelItem) => {
    const props: RowProps = {
      item,
      active: item.key === activeKey,
      onSelect: select,
      testId: getItemTestId?.(item.key),
    }
    return canReorder && !fixed.has(item.key) ? (
      <SortableRow key={item.key} {...props} />
    ) : (
      <PlainRow key={item.key} {...props} />
    )
  }

  const body = (
    <div className="space-y-4">
      {visibleGroups.map((group) => (
        <div key={group.key} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">{group.items.map(renderRow)}</ul>
        </div>
      ))}
      {filtering && !anyVisible && (
        <p className="px-3 py-2 text-sm text-muted-foreground">{noMatchesLabel ?? t('No matches')}</p>
      )}
    </div>
  )

  return (
    <div className={cn('space-y-3', className)}>
      {showFilter && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={filterLabel ?? t('Filter')}
            aria-label={filterLabel ?? t('Filter')}
            enterKeyHint="search"
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}
      {canReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableKeys} strategy={verticalListSortingStrategy}>
            {body}
          </SortableContext>
        </DndContext>
      ) : (
        body
      )}
      {footer}
    </div>
  )
}

// ── Desktop column ───────────────────────────────────────────────────────

export interface SidePanelColumnProps extends Omit<SidePanelListProps, 'className'> {
  /** Persistence id for the collapsed state. */
  id: string
  /** Small muted header label (also the nav's aria-label). */
  title: string
  /** Footer shown instead of `footer` in the collapsed rail (e.g. an icon button with a tooltip). */
  footerCollapsed?: ReactNode
  className?: string
}

export function SidePanelColumn({
  id,
  title,
  footerCollapsed,
  className,
  ...listProps
}: SidePanelColumnProps) {
  const { t } = useTranslation()
  const [collapsed, toggle] = useSidePanelCollapsed(id)
  const { groups, activeKey, onSelect, getItemTestId } = listProps
  const items = groups.flatMap((g) => g.items)

  return (
    <aside
      aria-label={title}
      data-collapsed={collapsed || undefined}
      className={cn(
        'hidden shrink-0 flex-col border-r border-[var(--glass-border)] transition-[width] duration-200 md:flex',
        collapsed ? 'w-12' : 'w-60',
        className,
      )}
    >
      <div className={cn('flex h-11 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pl-4 pr-2')}>
        {!collapsed && (
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={toggle}
          aria-label={`${collapsed ? t('Expand sidebar') : t('Collapse sidebar')}: ${title}`}
          title={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          aria-expanded={!collapsed}
          data-testid="side-panel-toggle"
        >
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
        </Button>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', collapsed ? 'px-2 pb-3' : 'px-3 pb-3')}>
        {collapsed ? (
          <TooltipProvider>
            <div className="flex flex-col items-center gap-1" data-testid="side-panel-rail">
              {items.map((item) => {
                const active = item.key === activeKey
                const Icon = item.icon
                const cls = cn(SQUARE_BASE, active ? ROW_ACTIVE : ROW_IDLE, 'min-h-0 w-8 px-0')
                const content = Icon ? <Icon className={cn('size-4', active && 'text-primary')} aria-hidden /> : sidePanelMonogram(item.label)
                const common = {
                  'aria-label': item.title ?? item.label,
                  'data-testid': getItemTestId?.(item.key),
                  className: cls,
                }
                return (
                  <Tooltip key={item.key}>
                    <TooltipTrigger asChild>
                      {item.href ? (
                        <Link href={item.href} onClick={() => onSelect?.(item.key)} aria-current={active ? 'page' : undefined} {...common}>
                          {content}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => onSelect?.(item.key)} aria-current={active ? 'true' : undefined} {...common}>
                          {content}
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent side="right">{tooltipText(item)}</TooltipContent>
                  </Tooltip>
                )
              })}
              {footerCollapsed && <div className="pt-2">{footerCollapsed}</div>}
            </div>
          </TooltipProvider>
        ) : (
          <SidePanelList {...listProps} />
        )}
      </div>
    </aside>
  )
}

// ── Phone picker ─────────────────────────────────────────────────────────

export interface SidePanelMobilePickerProps
  extends Omit<SidePanelListProps, 'footer' | 'className'> {
  /** Sheet title and the button's aria-label prefix. */
  title: string
  /** Label shown when no item is active. Defaults to the title. */
  fallbackLabel?: string
  /** A node, or a function that gets `close` so an action can dismiss the sheet. */
  footer?: ReactNode | ((close: () => void) => ReactNode)
  description?: string
  testId?: string
  className?: string
}

export function SidePanelMobilePicker({
  title,
  fallbackLabel,
  footer,
  description,
  testId,
  className,
  onSelect,
  ...listProps
}: SidePanelMobilePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const active = listProps.groups.flatMap((g) => g.items).find((i) => i.key === listProps.activeKey)
  const label = active?.label ?? fallbackLabel ?? title
  const close = () => setOpen(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(TOOLBAR_CONTROL, 'max-w-[45%] shrink-0 gap-1 px-3 md:hidden', className)}
        onClick={() => setOpen(true)}
        aria-label={`${title}: ${label}`}
        data-testid={testId}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <BottomSheetContent desktopClassName="sm:max-w-md">
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pt-4"
          >
            <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{title}</DialogTitle>
            <BottomSheetCloseButton label={t('Close')} />
            <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
            <SidePanelList
              {...listProps}
              onSelect={(key) => {
                onSelect?.(key)
                close()
              }}
              footer={typeof footer === 'function' ? footer(close) : footer}
            />
          </div>
        </BottomSheetContent>
      </Dialog>
    </>
  )
}
