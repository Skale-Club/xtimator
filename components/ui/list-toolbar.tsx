'use client'

/**
 * The one toolbar every list uses (DataTable composes these). Rules that keep
 * the screens consistent:
 *  - every control is 36px tall (h-9), rounded-lg, 14px text;
 *  - wide screens (lg, 1024px+; the sidebar takes 213px from 768px): one row — tabs and extra filters left, search and sort right;
 *  - phone and tablet: one row — full-width search plus a "Filters" button; tabs, extra
 *    filters and sort live in a bottom sheet, so the toolbar costs 36px;
 *  - an active filter is always visible (chips on the phone, a result count
 *    with "Clear filters" on both), so a narrowed list is never a mystery.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpDown, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

/**
 * The one surface for every bordered control in a toolbar (search, sort,
 * filters, outline actions). The stock outline Button paints bg-background,
 * which shows as a black box on a glass card next to a see-through search;
 * a faint foreground tint reads the same on any surface, in both themes.
 * (Not `dark:` — Tailwind's dark variant here follows the OS, not the app theme.)
 */
export const TOOLBAR_CONTROL =
  'h-9 rounded-lg border border-input bg-foreground/[0.03] shadow-none hover:bg-foreground/[0.07] hover:text-foreground'

export interface ListOption {
  value: string
  label: string
}

export interface ActiveFilter {
  key: string
  label: string
  onRemove: () => void
}

/** Segmented status tabs. Keeps role="tab" (Radix) and reacts to a plain click. */
export function ListTabs({ options, value, onChange, className }: {
  options: readonly ListOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <Tabs value={value} onValueChange={onChange} className={className}>
      <TabsList className="h-9 gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            onClick={() => onChange(option.value)}
            className="h-7 rounded-md px-3 text-sm font-normal text-muted-foreground data-[state=active]:bg-background data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** Search box: trims nothing itself (the list trims), Esc clears, "/" focuses. */
export function ListSearch({ value, onChange, placeholder, className }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const input = inputRef.current
      // Skip a box that is hidden (display:none parent) or inside a closed panel.
      if (!input || input.offsetParent === null) return
      event.preventDefault()
      input.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder.replace(/\.+$/, '')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            event.stopPropagation()
            onChange('')
          }
        }}
        className="h-9 w-full min-w-0 rounded-lg border border-input bg-foreground/[0.03] pl-9 pr-9 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); inputRef.current?.focus() }}
          aria-label={t('Clear search')}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

/** "Newest ▾" sort button; the same value the column headers set on desktop. */
export function ListSortMenu({ options, value, onChange, className }: {
  options: readonly ListOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(TOOLBAR_CONTROL, 'font-normal', className)} aria-label={`${t('Sort')}: ${current?.label ?? ''}`}>
          <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
          <span>{current?.label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('Sort by')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current?.value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Phone only: the "Filters" button and the bottom sheet it opens. */
export function ListFiltersSheet({
  tabs, tabValue, onTabChange, tabsLabel,
  sortOptions, sortValue, onSortChange,
  extraFilters, activeCount, resultCount, onClear, className,
}: {
  tabs?: readonly ListOption[]
  tabValue?: string
  onTabChange?: (value: string) => void
  tabsLabel?: string
  sortOptions?: readonly ListOption[]
  sortValue?: string
  onSortChange?: (value: string) => void
  extraFilters?: ReactNode
  activeCount: number
  resultCount: number
  onClear?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const choice = (selected: boolean) => cn(
    'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
    selected ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-foreground hover:bg-accent',
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(TOOLBAR_CONTROL, 'relative px-3 font-normal', className)}
        aria-label={activeCount ? `${t('Filters')} (${activeCount})` : t('Filters')}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        <span>{t('Filters')}</span>
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* A floating card with side margins, not an edge-to-edge drawer; capped
            width so it doesn't stretch across a tablet or a narrow desktop window. */}
        <SheetContent
          side="bottom"
          className="inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-h-[85dvh] w-auto max-w-md gap-0 overflow-y-auto rounded-2xl border pb-4"
        >
          <SheetHeader className="pb-2">
            <SheetTitle>{t('Filters')}</SheetTitle>
            <SheetDescription className="sr-only">{t('Filter and sort this list')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-4">
            {tabs && tabs.length > 0 && onTabChange && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tabsLabel ?? t('Status')}</h3>
                <div className="flex flex-wrap gap-2">
                  {tabs.map((tab) => (
                    <button key={tab.value} type="button" aria-pressed={tab.value === tabValue} onClick={() => onTabChange(tab.value)} className={choice(tab.value === tabValue)}>
                      {tab.value === tabValue && <Check className="size-3.5" aria-hidden />}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {extraFilters && <section className="space-y-2">{extraFilters}</section>}
            {sortOptions && sortOptions.length > 0 && onSortChange && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Sort by')}</h3>
                <div className="flex flex-wrap gap-2">
                  {sortOptions.map((o) => (
                    <button key={o.value} type="button" aria-pressed={o.value === sortValue} onClick={() => onSortChange(o.value)} className={choice(o.value === sortValue)}>
                      {o.value === sortValue && <Check className="size-3.5" aria-hidden />}
                      {o.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
          <SheetFooter className="flex-row gap-2 border-t border-border px-4 pt-3">
            {onClear && activeCount > 0 && (
              <Button type="button" variant="ghost" className="h-11 flex-1 rounded-lg" onClick={onClear}>
                {t('Clear filters')}
              </Button>
            )}
            <Button type="button" className="h-11 flex-1 rounded-lg" onClick={() => setOpen(false)}>
              {resultCount === 1 ? t('Show 1 result') : t('Show {n} results').replace('{n}', String(resultCount))}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * The slim line under the toolbar, shown only while something narrows the
 * list: removable chips (phone; desktop already shows the tabs and filter
 * buttons themselves), "3 of 12" and "Clear filters".
 */
export function ListFilterSummary({ chips, shown, total, onClear }: {
  chips: readonly ActiveFilter[]
  shown: number
  total: number
  onClear: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`${t('Remove filter')}: ${chip.label}`}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 pl-2 pr-1.5 font-medium text-primary lg:hidden"
        >
          {chip.label}
          <X className="size-3" aria-hidden />
        </button>
      ))}
      <span className="tabular-nums">{t('{shown} of {total}').replace('{shown}', String(shown)).replace('{total}', String(total))}</span>
      <span aria-hidden>·</span>
      <button type="button" onClick={onClear} className="font-medium text-foreground underline-offset-4 hover:underline">
        {t('Clear filters')}
      </button>
    </div>
  )
}
